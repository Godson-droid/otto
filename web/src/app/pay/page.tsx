"use client";

import { erc20Abi } from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, parseUnits, type Address, type Hash } from "viem";
import { useAccount, useConfig, usePublicClient, useReadContract } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useToken } from "@/components/useToken";
import { IdentityPanel, Notice } from "@/components/ui";
import { useNetwork } from "@/lib/network";
import { explain } from "@/lib/errors";
import { fmtAmount, lookupIdentity, shortAddress } from "@/lib/otto";

type Phase = "idle" | "working" | "done" | "error";

export default function PayPage() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();
  const client = usePublicClient({ chainId: appChain.id });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const toOk = isAddress(to.trim());
  const amountOk = /^\d+(\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0;
  const value = amountOk ? parseUnits(amount.trim() as `${number}`, token.decimals) : 0n;
  const busy = phase === "working";

  const identity = useQuery({
    queryKey: ["identity", appChain.id, toOk ? to.trim().toLowerCase() : ""],
    enabled: Boolean(client && toOk),
    queryFn: () => lookupIdentity(client!, to.trim() as Address),
    staleTime: 60_000,
  });

  const balance = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address && token.address) },
  });
  const enough = balance.data === undefined || balance.data >= value;
  const selfPay = Boolean(address) && toOk && address!.toLowerCase() === to.trim().toLowerCase();

  async function onPay() {
    if (!address || !token.address || !toOk) return;
    setError(null);
    setPhase("working");
    try {
      const { request } = await simulateContract(config, {
        account: address,
        address: token.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to.trim() as Address, value],
        chainId: appChain.id,
      });
      const hash = await writeContract(config, request);
      setTxHash(hash);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: appChain.id });
      if (receipt.status !== "success") throw new Error("The payment did not go through on chain. Nothing was charged.");
      setPhase("done");
      balance.refetch();
    } catch (e) {
      setError(explain(e));
      setPhase("error");
    }
  }

  const blocked = !isConnected || !onChain || !toOk || !amountOk || !enough || selfPay || busy;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="text-heading-page">Pay someone</h1>
          <p className="page-sub">
            Send tUSD8 straight to a wallet address. Before you sign, Otto checks the address against the Aevum identity registry, so
            you can see whether it has registered itself.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack" aria-label="Payment details">
          <h2 className="text-title-card">Payment details</h2>
          <div className="field">
            <label htmlFor="to">Pay to</label>
            <input id="to" className="input" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} />
            <span className="hint">The wallet address of the person you are paying. Payments cannot be undone, so check it carefully.</span>
            {to && !toOk && <span className="hint" style={{ color: "var(--semantic-negative)" }}>That does not look like a complete wallet address yet.</span>}
            {selfPay && <span className="hint" style={{ color: "var(--semantic-warning)" }}>That is your own address.</span>}
          </div>
          <div className="field">
            <label htmlFor="amount">Amount in {token.symbol}</label>
            <input id="amount" className="input tnum" inputMode="decimal" placeholder="5.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {amountOk && !enough && (
              <span className="hint" style={{ color: "var(--semantic-negative)" }}>
                Your balance is {balance.data !== undefined ? fmtAmount(balance.data, token.decimals) : "…"}. Lower the amount or add funds first.
              </span>
            )}
          </div>

          {error && (
            <Notice tone="error" title="The payment did not go through">
              {error}
            </Notice>
          )}
          {phase === "done" && (
            <Notice tone="good" title="Payment sent">
              {fmtAmount(value, token.decimals)} is on its way to {shortAddress(to.trim())}. It is recorded on chain and cannot be
              undone.
            </Notice>
          )}

          <button type="button" className="btn lg block" disabled={blocked} onClick={onPay}>
            {busy
              ? "Check your wallet…"
              : !isConnected
                ? "Connect your wallet first"
                : !onChain
                  ? `Switch to ${appChain.name} first`
                  : amountOk
                    ? `Pay ${fmtAmount(value, token.decimals)}`
                    : "Pay"}
          </button>
          <p className="fine">You pay the network fee for this payment in tQDAY. For a payment with no fee, ask the seller to send you a payment request instead.</p>
        </section>

        <section className="stack" aria-label="Who you are paying">
          <h2 className="text-title-card" style={{ padding: "4px 0 0" }}>Who you are paying</h2>
          {!toOk ? (
            <div className="notice">
              <span className="notice-title">The identity check runs when the address is complete</span>
              <p>Otto looks the address up in the Aevum identity registry and shows the result here, before any money moves.</p>
            </div>
          ) : (
            <IdentityPanel record={identity.data} loading={identity.isLoading} />
          )}
          {txHash && (
            <p className="fine addr">Transaction: {txHash}</p>
          )}
        </section>
      </div>
    </main>
  );
}
