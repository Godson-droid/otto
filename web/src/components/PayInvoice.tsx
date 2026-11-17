"use client";

import {
  authorizationWindow,
  checkoutTypedData,
  erc20Abi,
  settleCheckoutAbi,
  txUrl,
} from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { recoverTypedDataAddress, type Hash } from "viem";
import { useAccount, useConfig, usePublicClient, useReadContract } from "wagmi";
import { readContract, signTypedData, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useToken } from "@/components/useToken";
import { IdentityPanel, Notice, Tag } from "@/components/ui";
import { CheckIcon } from "@/components/Icons";
import { networkByChainId, type Network } from "@/lib/env";
import { useNetwork } from "@/lib/network";
import { explain } from "@/lib/errors";
import {
  fmtAmount,
  fmtDateTime,
  invoiceLabel,
  lookupIdentity,
  quoteOf,
  settleDomain,
  quoteTypes,
  type PaymentRequest,
} from "@/lib/otto";

type Mode = "gasless" | "standard";
type Phase = "idle" | "working" | "done" | "error";

const STEPS: Record<Mode, { title: string; who: string }[]> = {
  gasless: [
    { title: "Sign the payment", who: "Your wallet signs. No gas needed." },
    { title: "A relayer sends it", who: "The relayer pays the network fee." },
    { title: "Confirmed", who: "The contract records the exact amount." },
  ],
  standard: [
    { title: "Approve the exact amount", who: "Your wallet, one transaction." },
    { title: "Pay the request", who: "Your wallet, one transaction." },
    { title: "Confirmed", who: "The contract records the exact amount." },
  ],
};

export function PayInvoice({ request }: { request: PaymentRequest }) {
  const { net: appNet, select } = useNetwork();
  // The link carries its chain, so it still works after the viewer switches networks.
  const net: Network = networkByChainId(request.chainId) ?? appNet;
  const appChain = net.chain;
  const settle = net.settle;
  const hasExplorer = net.hasExplorer;
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();
  const client = usePublicClient({ chainId: appChain.id });

  const quote = useMemo(() => quoteOf(request, token.decimals), [request, token.decimals]);
  const expired = request.expiry <= Math.floor(Date.now() / 1000);
  const isPayer = Boolean(address) && address!.toLowerCase() === request.payer.toLowerCase();

  const [mode, setMode] = useState<Mode>("gasless");
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const busy = phase === "working";

  // Does the signature in the link really come from the merchant it names?
  const signerCheck = useQuery({
    queryKey: ["quote-signer", appChain.id, request.invoiceId, request.signature],
    queryFn: () =>
      recoverTypedDataAddress({
        domain: settleDomain(appChain.id, request.settle),
        types: quoteTypes,
        primaryType: "Quote",
        message: quote,
        signature: request.signature,
      }),
  });
  const signerOk = signerCheck.data ? signerCheck.data.toLowerCase() === request.merchant.toLowerCase() : undefined;

  // And is that merchant the merchant of the contract the link points at?
  const contractMerchant = useReadContract({
    address: settle,
    abi: settleCheckoutAbi,
    functionName: "merchant",
    chainId: appChain.id,
    query: { enabled: Boolean(settle) },
  });
  const merchantOk =
    contractMerchant.data && settle?.toLowerCase() === request.settle.toLowerCase()
      ? contractMerchant.data.toLowerCase() === request.merchant.toLowerCase()
      : undefined;

  const settled = useReadContract({
    address: settle,
    abi: settleCheckoutAbi,
    functionName: "isSettled",
    args: [request.invoiceId, quote.amount],
    chainId: appChain.id,
    query: { enabled: Boolean(settle), refetchInterval: 6_000 },
  });
  const isPaid = settled.data === true || phase === "done";

  const identity = useQuery({
    queryKey: ["identity", appChain.id, request.merchant],
    enabled: Boolean(client),
    queryFn: () => lookupIdentity(client!, request.merchant),
    staleTime: 60_000,
  });

  const relay = useQuery({
    queryKey: ["relay-status", appChain.id],
    queryFn: async () => (await fetch(`/api/relay?chainId=${appChain.id}`)).json() as Promise<{ enabled: boolean }>,
  });
  const gaslessAvailable = relay.data?.enabled ?? false;
  useEffect(() => {
    if (relay.data) setMode(relay.data.enabled ? "gasless" : "standard");
  }, [relay.data]);

  const balance = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address && token.address) },
  });
  const enoughBalance = balance.data === undefined || balance.data >= quote.amount;

  async function payGasless() {
    if (!address || !settle || !token.address) return;
    const nonce = await readContract(config, {
      address: settle,
      abi: settleCheckoutAbi,
      functionName: "authorizationNonce",
      args: [quote],
      chainId: appChain.id,
    });
    // The token contract judges the window by the time of the block the payment
    // lands in, not by this device's clock, so the window is anchored to the
    // pending block: the closest estimate of that landing time. On a chain whose
    // clock has drifted from the wall clock the two can disagree by minutes.
    const head = client ? await client.getBlock({ blockTag: "pending" }).catch(() => undefined) : undefined;
    const { validAfter, validBefore } = authorizationWindow(600, head ? Number(head.timestamp) * 1000 : Date.now());
    const signature = await signTypedData(config, {
      account: address,
      ...checkoutTypedData(appChain.id, token.address, {
        from: address,
        to: settle,
        value: quote.amount,
        validAfter,
        validBefore,
        nonce,
      }),
    });
    setStep(1);
    const res = await fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: appChain.id,
        settle,
        quote: {
          invoiceId: request.invoiceId,
          payer: request.payer,
          amount: quote.amount.toString(),
          expiry: quote.expiry.toString(),
        },
        merchantSignature: request.signature,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        signature,
      }),
    });
    const data = (await res.json()) as { hash?: Hash; error?: string };
    if (!res.ok || !data.hash) throw new Error(data.error ?? "The relayer did not accept the payment.");
    setTxHash(data.hash);
    setStep(2);
    return data.hash;
  }

  async function payStandard() {
    if (!address || !settle || !token.address) return;
    const allowance = await readContract(config, {
      address: token.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, settle],
      chainId: appChain.id,
    });
    if (allowance < quote.amount) {
      const approveHash = await writeContract(config, {
        address: token.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [settle, quote.amount],
        chainId: appChain.id,
      });
      await waitForTransactionReceipt(config, { hash: approveHash, chainId: appChain.id });
    }
    setStep(1);
    const { request: writeReq } = await simulateContract(config, {
      account: address,
      address: settle,
      abi: settleCheckoutAbi,
      functionName: "pay",
      args: [quote, request.signature],
      chainId: appChain.id,
    });
    const hash = await writeContract(config, writeReq);
    setTxHash(hash);
    setStep(2);
    return hash;
  }

  async function onPay() {
    setError(null);
    setPhase("working");
    setStep(0);
    try {
      const hash = mode === "gasless" ? await payGasless() : await payStandard();
      if (!hash) throw new Error("Connect your wallet first.");
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: appChain.id });
      if (receipt.status !== "success") throw new Error("The payment did not go through on chain. Nothing was charged.");
      setStep(3);
      setPhase("done");
      settled.refetch();
      balance.refetch();
    } catch (e) {
      setError(explain(e));
      setPhase("error");
    }
  }

  const blockedReason = !settle
    ? "Otto is not deployed on this network yet."
    : signerOk === false || merchantOk === false
      ? "This link failed its checks, so paying is switched off."
      : expired
        ? "This request has expired."
        : isPaid
          ? null
          : !isConnected
            ? "Connect your wallet to pay."
            : !onChain
              ? `Switch your wallet to ${appChain.name} to pay.`
              : !isPayer
                ? "This request names a different payer."
                : !enoughBalance
                  ? `You need ${fmtAmount(quote.amount, token.decimals)} in your wallet.`
                  : null;

  const cta = isPaid
    ? "Paid"
    : busy
      ? (["Check your wallet", mode === "gasless" ? "Waiting for the relayer" : "Check your wallet", "Confirming"][step] ?? "Working") + "…"
      : phase === "error"
        ? "Try again"
        : `Pay ${fmtAmount(quote.amount, token.decimals)}`;

  return (
    <div className="stack">
      <section className="card stack" aria-label="Payment request">
        <div className="row-between">
          <h2 className="text-title-card">{request.note || `Invoice ${invoiceLabel(request.invoiceId)}`}</h2>
          {isPaid ? (
            <Tag tone="accent" className="pop">Paid</Tag>
          ) : expired ? (
            <Tag tone="error">Expired</Tag>
          ) : (
            <Tag tone="warning"><span className="pulse-dot" aria-hidden="true" />Waiting for payment</Tag>
          )}
        </div>

        <p className="stat-value tnum">{fmtAmount(quote.amount, token.decimals)}</p>

        <dl className="kv">
          <dt>From</dt>
          <dd className="addr">{request.merchant} (the seller)</dd>
          <dt>To be paid by</dt>
          <dd className="addr">{request.payer}</dd>
          <dt>Pay before</dt>
          <dd>{fmtDateTime(request.expiry)}</dd>
          <dt>Invoice</dt>
          <dd>{invoiceLabel(request.invoiceId)}</dd>
        </dl>

        <IdentityPanel record={identity.data} loading={identity.isLoading} />

        {signerOk === false && (
          <Notice tone="error" title="This link did not come from the seller it names">
            The signature on this request does not match the seller address in the link. Do not pay it. Ask the seller to send you a
            fresh link.
          </Notice>
        )}
        {merchantOk === false && (
          <Notice tone="error" title="This link points at the wrong contract">
            The seller in this link is not the seller of the payment contract it names. Do not pay it.
          </Notice>
        )}
        {signerOk === undefined && (
          <p className="fine cluster" style={{ gap: 8 }}>
            <span className="spinner" aria-hidden="true" /> Checking the signature on this request…
          </p>
        )}

        {isPaid ? (
          <Notice tone="good" title="This request is paid" className="settle-in">
            The exact amount arrived and the contract recorded it.
            {txHash ? " Your payment is the one just confirmed." : ""}
          </Notice>
        ) : expired ? (
          <Notice tone="error" title="This request has expired">
            The pay by time has passed, so the contract will not accept a payment. Ask the seller for a new request.
          </Notice>
        ) : (
          <>
            {blockedReason && isConnected && onChain && isPayer && (
              <Notice tone="warning" title="Not ready to pay">
                {blockedReason}
              </Notice>
            )}
            {isConnected && !onChain && (
              <div className="stack-sm">
                <Notice tone="warning" title="Wrong network">
                  This request is on {appChain.name}. Your wallet is somewhere else.
                </Notice>
                <button type="button" className="btn secondary" onClick={() => select(net.key)}>
                  Switch to {appChain.name}
                </button>
              </div>
            )}
            {isConnected && onChain && !isPayer && (
              <Notice tone="warning" title="This request names a different payer">
                Only the wallet it was sent to can pay it: {request.payer}. Connect that wallet, or ask the seller to send a request
                naming yours.
              </Notice>
            )}

            <div className="cluster" role="radiogroup" aria-label="How to pay">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "gasless"}
                className={`btn ${mode === "gasless" ? "" : "secondary"}`}
                disabled={busy || !gaslessAvailable}
                onClick={() => setMode("gasless")}
                title={gaslessAvailable ? "Sign once. A relayer sends it and pays the fee." : "The relayer is not switched on for this network."}
              >
                No gas needed
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "standard"}
                className={`btn ${mode === "standard" ? "" : "secondary"}`}
                disabled={busy}
                onClick={() => setMode("standard")}
              >
                Pay from my wallet
              </button>
            </div>

            <ol className="steps">
              {STEPS[mode].map((s, i) => {
                const done = step > i || isPaid;
                const active = busy && step === i;
                return (
                  <li key={s.title} className={`step ${done ? "done" : active ? "active" : ""}`}>
                    <div className="step-dot">{done ? <CheckIcon /> : i + 1}</div>
                    <div className="step-body">
                      <div className="row-between">
                        <span className="step-title">{s.title}</span>
                        <span className="step-state">{done ? "Done" : active ? "In progress" : "Waiting"}</span>
                      </div>
                      <p className="step-who">{s.who}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {error && (
              <Notice tone="error" title="The payment did not go through">
                {error}
              </Notice>
            )}

            <button type="button" className="btn lg block" disabled={Boolean(blockedReason) || busy} onClick={onPay}>
              {cta}
            </button>
            <p className="fine">
              {mode === "gasless"
                ? "Your signature covers this exact amount, this invoice only, and stays valid for 10 minutes."
                : "The approval is for this exact amount only, never unlimited."}{" "}
              The amount cannot be changed by anyone, including the seller.
            </p>
          </>
        )}

        {txHash && hasExplorer && (
          <p className="fine">
            Transaction:{" "}
            <a href={txUrl(txHash)} target="_blank" rel="noreferrer">
              {txHash}
            </a>
          </p>
        )}
        {isPaid && (
          <p>
            <Link href={`/receipts/${request.invoiceId}?chain=${appChain.id}${txHash ? `&tx=${txHash}` : ""}`}>View the receipt</Link>
          </p>
        )}
      </section>
    </div>
  );
}
