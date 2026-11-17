"use client";

import { addressUrl, settleCheckoutAbi, txUrl } from "@aevum-kit/aevum";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { isHash, isHex, parseEventLogs, type Hex } from "viem";
import { useReadContract, useTransactionReceipt } from "wagmi";
import { useToken } from "@/components/useToken";
import { Notice, Tag } from "@/components/ui";
import { networkByChainId } from "@/lib/env";
import { useNetwork } from "@/lib/network";
import { fmtAmount, invoiceLabel } from "@/lib/otto";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function ReceiptPage() {
  const { net: appNet } = useNetwork();
  const params = useParams<{ orderId: string }>();
  const search = useSearchParams();
  // Receipt links carry their chain, so they still work after you switch networks.
  const net = networkByChainId(Number(search.get("chain"))) ?? appNet;
  const appChain = net.chain;
  const settle = net.settle;
  const hasExplorer = net.hasExplorer;
  const invoiceId = params.orderId;
  const rawTx = search.get("tx");
  // Anything else in ?tx= is ignored, never shown: a receipt must not display text from the URL.
  const tx = rawTx && isHash(rawTx) ? rawTx : undefined;
  const validId = isHex(invoiceId) && invoiceId.length === 66;
  const token = useToken();

  const settlement = useReadContract({
    address: settle,
    abi: settleCheckoutAbi,
    functionName: "settlementOf",
    args: validId ? [invoiceId as Hex] : undefined,
    chainId: appChain.id,
    query: { enabled: validId && Boolean(settle) },
  });
  const receipt = useTransactionReceipt({ hash: tx, chainId: appChain.id, query: { enabled: Boolean(tx) } });
  // The money lands with the contract's merchant, never with the contract itself.
  const merchant = useReadContract({
    address: settle,
    abi: settleCheckoutAbi,
    functionName: "merchant",
    chainId: appChain.id,
    query: { enabled: Boolean(settle) },
  });

  if (!validId) {
    return (
      <main className="page" style={{ maxWidth: 760 }}>
        <h1 className="text-heading-page">Receipt not found</h1>
        <p className="page-sub">That invoice id is not valid. Invoice ids are 32 byte hex values (0x plus 64 characters).</p>
      </main>
    );
  }

  const s = settlement.data;
  const paid = Boolean(s && s.payer !== ZERO);
  // Only show transaction details if that transaction really settled this invoice.
  const paidLog =
    receipt.data && settle
      ? parseEventLogs({ abi: settleCheckoutAbi, logs: receipt.data.logs, eventName: "InvoicePaid" }).find(
          (l) => l.address.toLowerCase() === settle.toLowerCase() && l.args.invoiceId.toLowerCase() === invoiceId.toLowerCase(),
        )
      : undefined;
  const txMatches = Boolean(paidLog);

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div>
        <h1 className="text-heading-page">Receipt {invoiceLabel(invoiceId)}</h1>
        <p className="page-sub">Read from {appChain.name}. A receipt only exists when the exact amount on the request arrived.</p>
      </div>

      <section className="card stack" aria-label="Receipt">
        {!settle ? (
          <Notice tone="warning" title="Cannot check this receipt here">
            Otto has no payment contract address on {appChain.name} in this app.
          </Notice>
        ) : settlement.isLoading ? (
          <p className="fine cluster" style={{ gap: 8 }}>
            <span className="spinner" aria-hidden="true" /> Reading the settlement from the contract…
          </p>
        ) : settlement.isError ? (
          <div className="stack-sm">
            <Notice tone="warning" title="The receipt could not be loaded">
              The network did not answer. Nothing about the payment has changed.
            </Notice>
            <div>
              <button type="button" className="btn secondary" onClick={() => settlement.refetch()}>
                Try again
              </button>
            </div>
          </div>
        ) : !paid ? (
          <div className="stack-sm">
            <Tag tone="warning">Not paid</Tag>
            <p style={{ color: "var(--text-secondary)" }}>
              No payment is recorded for this invoice on {appChain.name}. If it was just paid, wait a few seconds and reload this page.
            </p>
          </div>
        ) : (
          <>
            <div className="row-between">
              <Tag tone="accent">Paid</Tag>
              <span className="fine">{new Date(Number(s!.paidAt) * 1000).toLocaleString()}</span>
            </div>
            <p className="stat-value tnum">{fmtAmount(s!.amount, token.decimals)}</p>
            <dl className="kv">
              <dt>Invoice</dt>
              <dd className="addr">{invoiceId}</dd>
              <dt>Paid by</dt>
              <dd className="addr">
                {hasExplorer ? (
                  <a href={addressUrl(s!.payer)} target="_blank" rel="noreferrer">{s!.payer}</a>
                ) : (
                  s!.payer
                )}
              </dd>
              <dt>Paid to</dt>
              <dd className="addr">{merchant.data ?? "…"}</dd>
              {txMatches && receipt.data && (
                <>
                  <dt>Block</dt>
                  <dd className="tnum">{receipt.data.blockNumber.toString()}</dd>
                  <dt>Submitted by</dt>
                  <dd className="addr">{receipt.data.from}</dd>
                  <dt>Transaction</dt>
                  <dd className="addr">
                    {hasExplorer ? (
                      <a href={txUrl(tx!)} target="_blank" rel="noreferrer">{tx}</a>
                    ) : (
                      tx
                    )}
                  </dd>
                </>
              )}
            </dl>
            {tx && receipt.data && !txMatches && (
              <p className="fine">The transaction in this link is not the payment for this invoice, so its details are not shown.</p>
            )}
            {txMatches && receipt.data && receipt.data.from.toLowerCase() !== s!.payer.toLowerCase() && (
              <p className="fine">
                The payer did not send this transaction themselves: a relayer or an agent budget submitted it (gasless payment).
              </p>
            )}
          </>
        )}
      </section>

      <p className="fine">
        This page trusts nothing but the chain: it reads the settlement record on the payment contract, which only exists for the
        exact quoted amount. <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
