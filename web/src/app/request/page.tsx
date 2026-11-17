"use client";

import { isAddress, type Address, type Hex } from "viem";
import { useEffect, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { signTypedData } from "wagmi/actions";
import QRCode from "qrcode";
import { CopyButton, Notice } from "@/components/ui";
import { useToken } from "@/components/useToken";
import { useNetwork } from "@/lib/network";
import { explain } from "@/lib/errors";
import {
  fmtDateTime,
  fmtTypedAmount,
  invoiceLabel,
  newInvoiceId,
  payLink,
  quoteOf,
  saveRequest,
  settleDomain,
  quoteTypes,
  type PaymentRequest,
} from "@/lib/otto";

const EXPIRY_CHOICES = [
  { label: "24 hours", seconds: 86_400 },
  { label: "3 days", seconds: 259_200 },
  { label: "7 days", seconds: 604_800 },
  { label: "30 days", seconds: 2_592_000 },
];

export default function RequestPage() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const settle = net.settle;
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();

  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [note, setNote] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const amountOk = /^\d+(\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0;
  const payerOk = isAddress(payer.trim());
  const canCreate = Boolean(settle && onChain && amountOk && payerOk && !busy);

  const link = created && typeof window !== "undefined" ? payLink(window.location.origin, created) : "";

  useEffect(() => {
    if (!link) {
      setQr(null);
      return;
    }
    let live = true;
    QRCode.toDataURL(link, { width: 400, margin: 1 })
      .then((url) => {
        if (live) setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      live = false;
    };
  }, [link]);

  async function onCreate() {
    if (!address || !settle) return;
    setError(null);
    setBusy(true);
    try {
      const expiry = Math.floor(Date.now() / 1000) + EXPIRY_CHOICES[expiryIdx].seconds;
      const draft: PaymentRequest = {
        invoiceId: newInvoiceId(),
        chainId: appChain.id,
        settle,
        merchant: address,
        payer: payer.trim() as Address,
        amount: amount.trim(),
        expiry,
        note: note.trim(),
        signature: "0x" as Hex,
        createdAt: Date.now(),
      };
      // The merchant signs the quote. From here on, only this exact amount, from this
      // exact payer, before this expiry, can settle the invoice.
      const signature = await signTypedData(config, {
        account: address,
        domain: settleDomain(appChain.id, settle),
        types: quoteTypes,
        primaryType: "Quote",
        message: quoteOf(draft, token.decimals),
      });
      const request = { ...draft, signature };
      saveRequest(request);
      setCreated(request);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="text-heading-page">Request a payment</h1>
          <p className="page-sub">
            Set the exact amount and who should pay it, sign once, then share the link or code. Your signature locks the amount, so
            nobody can settle the bill for less.
          </p>
        </div>
      </div>

      {!settle && (
        <Notice tone="warning" title="Otto is not deployed on this network yet">
          There is no SettleCheckout address on {net.label}, so requests cannot be created here yet.
        </Notice>
      )}

      <div className="grid-2">
        <section className="card stack" aria-label="New request">
          <h2 className="text-title-card">New request</h2>

          <div className="field">
            <label htmlFor="amount">Amount in {token.symbol}</label>
            <input
              id="amount"
              className="input tnum"
              inputMode="decimal"
              placeholder="12.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="hint">The exact amount. The payer cannot pay more or less than this.</span>
          </div>

          <div className="field">
            <label htmlFor="payer">Who should pay</label>
            <input
              id="payer"
              className="input"
              placeholder="0x…"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              spellCheck={false}
            />
            <span className="hint">The wallet address of the person paying. Only this address can settle the request.</span>
            {payer && !payerOk && <span className="hint" style={{ color: "var(--semantic-negative)" }}>That does not look like a complete wallet address yet.</span>}
          </div>

          <div className="field">
            <label htmlFor="note">What is it for</label>
            <input
              id="note"
              className="input"
              placeholder="Website design, second half"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="hint">Shown to the payer and in your request list. Kept in the link, not on chain.</span>
          </div>

          <div className="field">
            <label htmlFor="expiry">Valid for</label>
            <select id="expiry" className="input" value={expiryIdx} onChange={(e) => setExpiryIdx(Number(e.target.value))}>
              {EXPIRY_CHOICES.map((c, i) => (
                <option key={c.label} value={i}>{c.label}</option>
              ))}
            </select>
            <span className="hint">After this time the request can no longer be paid and you would send a new one.</span>
          </div>

          {error && (
            <Notice tone="error" title="The request was not created">
              {error}
            </Notice>
          )}

          <button type="button" className="btn lg block" disabled={!canCreate} onClick={onCreate}>
            {busy ? "Waiting for your signature…" : !isConnected ? "Connect your wallet first" : !onChain ? `Switch to ${appChain.name} first` : "Sign and create request"}
          </button>
          <p className="fine">Signing is free. It moves no money. It only fixes the amount, the payer and the expiry under your name.</p>
        </section>

        <section className={`card stack${created ? " rise" : ""}`} aria-label="Share your request">
          <h2 className="text-title-card">Share it</h2>
          {!created ? (
            <p style={{ color: "var(--text-secondary)" }}>
              When you create a request, its link and scan code appear here. Send the link in any message, or let the payer scan the code
              with their phone.
            </p>
          ) : (
            <>
              <dl className="kv">
                <dt>Request</dt>
                <dd>{invoiceLabel(created.invoiceId)}{created.note ? ` · ${created.note}` : ""}</dd>
                <dt>Amount</dt>
                <dd className="tnum">{fmtTypedAmount(created.amount)}</dd>
                <dt>Payer</dt>
                <dd className="addr">{created.payer}</dd>
                <dt>Expires</dt>
                <dd>{fmtDateTime(created.expiry)}</dd>
              </dl>
              {qr && (
                <div>
                  <span className="qr-box">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="Scan code for this payment request" />
                  </span>
                </div>
              )}
              <div className="field">
                <label htmlFor="link">Payment link</label>
                <input id="link" className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
              </div>
              <div className="cluster">
                <CopyButton text={link} label="Copy link" />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setCreated(null);
                    setAmount("");
                    setNote("");
                  }}
                >
                  New request
                </button>
              </div>
              <p className="fine">
                Anyone with the link can view the request, but only the named payer can pay it, and only the exact amount.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
