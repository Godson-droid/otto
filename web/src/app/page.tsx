"use client";

import { erc20Abi, getLogsChunked, settleCheckoutAbi, TUSD8_ADDRESS } from "@aevum-kit/aevum";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAbiItem } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useToken } from "@/components/useToken";
import { CountUp, Notice, SkeletonRows, Skl, Tag, TrendChart, type TrendPoint } from "@/components/ui";
import { useNetwork } from "@/lib/network";
import { explain } from "@/lib/errors";
import {
  fmtAmount,
  fmtDateTime,
  invoiceLabel,
  loadRequests,
  quoteOf,
  shortAddress,
  type PaymentRequest,
} from "@/lib/otto";

type RowState = "paid" | "waiting" | "expired";

export default function DashboardPage() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const settle = net.settle;
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();
  const client = usePublicClient({ chainId: appChain.id });

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  useEffect(() => {
    if (address && settle) setRequests(loadRequests(appChain.id, address));
    else setRequests([]);
  }, [address, appChain.id, settle]);

  const balance = useReadContract({
    address: token.address ?? TUSD8_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  // Settlement truth comes from the contract, never from the local request book.
  const settlements = useReadContracts({
    contracts: requests.map((r) => ({
      address: settle!,
      abi: settleCheckoutAbi,
      functionName: "isSettled" as const,
      args: [r.invoiceId, quoteOf(r, token.decimals).amount] as const,
      chainId: appChain.id,
    })),
    query: { enabled: Boolean(settle && requests.length), refetchInterval: 12_000 },
  });

  const rows = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return requests.map((r, i) => {
      const settled = settlements.data?.[i]?.result === true;
      const state: RowState = settled ? "paid" : r.expiry <= now ? "expired" : "waiting";
      return { r, state };
    });
  }, [requests, settlements.data]);

  // A request that flips from waiting to paid while the page is open announces
  // itself once: the row flashes and the Paid tag pops, then both settle down.
  const prevStates = useRef<Map<string, RowState>>(new Map());
  const [justPaid, setJustPaid] = useState<Set<string>>(new Set());
  useEffect(() => {
    const newly = rows.filter(({ r, state }) => state === "paid" && prevStates.current.get(r.invoiceId) === "waiting");
    for (const { r, state } of rows) prevStates.current.set(r.invoiceId, state);
    if (!newly.length) return;
    setJustPaid((prev) => new Set([...prev, ...newly.map((x) => x.r.invoiceId)]));
    const t = setTimeout(() => setJustPaid(new Set()), 2600);
    return () => clearTimeout(t);
  }, [rows]);

  const merchant = useReadContract({
    address: settle ?? undefined,
    abi: settleCheckoutAbi,
    functionName: "merchant",
    chainId: appChain.id,
    query: { enabled: Boolean(settle) },
  });
  const isMerchant = Boolean(address && merchant.data && address.toLowerCase() === merchant.data.toLowerCase());

  const open = rows.filter((x) => x.state === "waiting");
  const paid = rows.filter((x) => x.state === "paid");
  const receivedTotal = paid.reduce((sum, x) => sum + quoteOf(x.r, token.decimals).amount, 0n);

  // Recent receipts: InvoicePaid events naming this account's invoices, newest first.
  const [receipts, setReceipts] = useState<{ invoiceId: string; amount: bigint; tx: string; block: bigint }[]>([]);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  // The chart adds up every settlement on the contract when the connected account
  // is the merchant (every InvoicePaid pays the merchant), oldest first.
  const [chartPoints, setChartPoints] = useState<TrendPoint[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!client || !settle || !requests.length) {
        setReceipts([]);
        setChartPoints([]);
        return;
      }
      setReceiptsLoading(true);
      try {
        const head = await client.getBlockNumber();
        const from = net.deployBlock ?? (head > 20_000n ? head - 20_000n : 0n);
        const logs = await getLogsChunked(client, {
          address: settle,
          event: getAbiItem({ abi: settleCheckoutAbi, name: "InvoicePaid" }),
          fromBlock: from,
          toBlock: head,
        });
        const mine = new Set(requests.map((r) => r.invoiceId.toLowerCase()));
        const items = logs
          .filter((l) => l.args.invoiceId && mine.has(l.args.invoiceId.toLowerCase()))
          .map((l) => ({ invoiceId: l.args.invoiceId!, amount: l.args.amount ?? 0n, tx: l.transactionHash!, block: l.blockNumber ?? 0n }))
          .reverse();
        if (live) setReceipts(items);
        const chartLogs = isMerchant ? logs : logs.filter((l) => l.args.invoiceId && mine.has(l.args.invoiceId.toLowerCase()));
        if (chartLogs.length) {
          const blocks = [...new Set(chartLogs.map((l) => l.blockNumber ?? 0n))];
          const times = new Map<bigint, number>();
          await Promise.all(
            blocks.map(async (b) => {
              const blk = await client.getBlock({ blockNumber: b });
              times.set(b, Number(blk.timestamp));
            }),
          );
          let sum = 0n;
          const pts: TrendPoint[] = chartLogs.map((l) => {
            sum += l.args.amount ?? 0n;
            return { t: times.get(l.blockNumber ?? 0n) ?? 0, v: sum };
          });
          if (pts.length) pts.unshift({ t: Math.max(0, pts[0].t - 1800), v: 0n });
          if (live) setChartPoints(pts);
        } else if (live) {
          setChartPoints([]);
        }
      } catch (e) {
        if (live) setReceiptError(explain(e));
      } finally {
        if (live) setReceiptsLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [client, settle, requests, net.deployBlock, isMerchant]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="text-heading-page">Home</h1>
          <p className="page-sub">Your balance, the payment requests you have sent, and what has been paid.</p>
        </div>
        <div className="cluster">
          <Link className="btn secondary" href="/pay">Pay someone</Link>
          <Link className="btn" href="/request">Request a payment</Link>
        </div>
      </div>

      {!settle && (
        <Notice tone="warning" title="Otto is not deployed on this network yet">
          The payment contract has no address on {net.label}. Switch networks in the top bar, or deploy SettleCheckout and set its
          address in the app settings.
        </Notice>
      )}
      {isConnected && !onChain && (
        <Notice tone="warning" title="Your wallet is on a different network">
          Switch your wallet to {appChain.name} to see your balance and requests. Use the network switch in the top bar.
        </Notice>
      )}

      <div className="grid-3">
        <section className="card" aria-label="Balance">
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Balance</p>
          {isConnected && balance.data === undefined ? (
            <Skl height={40} width="62%" style={{ marginTop: 8 }} />
          ) : (
            <p className="stat-value tnum" style={{ marginTop: 8 }}>
              {!isConnected ? "…" : <CountUp base={balance.data ?? 0n} decimals={token.decimals} />}
            </p>
          )}
          <p className="fine" style={{ marginTop: 4 }}>{token.symbol} on {appChain.name}</p>
          {!isConnected && <p className="fine" style={{ marginTop: 8 }}>Connect your wallet to see your balance.</p>}
        </section>

        <section className="card" aria-label="Open requests">
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Waiting to be paid</p>
          <p className="stat-value tnum" style={{ marginTop: 8 }}>{open.length}</p>
          <p className="fine" style={{ marginTop: 4 }}>
            {open.length
              ? `${fmtAmount(open.reduce((s, x) => s + quoteOf(x.r, token.decimals).amount, 0n), token.decimals)} still to come in`
              : "No open requests right now"}
          </p>
        </section>

        <section className="card" aria-label="Received">
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Received through Otto</p>
          <p className="stat-value tnum" style={{ marginTop: 8 }}>
            <CountUp base={receivedTotal} decimals={token.decimals} />
          </p>
          <p className="fine" style={{ marginTop: 4 }}>{token.symbol} across {paid.length} settled {paid.length === 1 ? "request" : "requests"}</p>
        </section>
      </div>

      {isConnected && chartPoints.length >= 2 && (
        <section className="card" aria-label="Received over time">
          <div className="card-head" style={{ marginBottom: 8 }}>
            <div>
              <h2 className="text-title-card">Received over time</h2>
              <p className="card-sub">Every payment settled for you on this network, added up as it landed.</p>
            </div>
          </div>
          <TrendChart points={chartPoints} decimals={token.decimals} />
        </section>
      )}

      <section className="card flush" aria-label="Your payment requests">
        <div style={{ padding: "20px 16px 0" }}>
          <h2 className="text-title-card">Your payment requests</h2>
          <p className="card-sub">Paid state is read from the contract every few seconds. A request only counts as paid when the exact amount arrived.</p>
        </div>
        {!isConnected ? (
          <p className="empty">Connect your wallet to see the requests you created on this device.</p>
        ) : rows.length > 0 && settlements.data === undefined ? (
          <SkeletonRows rows={rows.length} cols={4} />
        ) : rows.length === 0 ? (
          <p className="empty">
            No requests yet. <Link href="/request">Create your first payment request</Link>.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Payer</th>
                  <th className="right">Amount</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, state }) => (
                  <tr key={r.invoiceId} className={justPaid.has(r.invoiceId) ? "row-flash" : undefined}>
                    <td>
                      <span className="cell-main">{r.note || `Invoice ${invoiceLabel(r.invoiceId)}`}</span>
                      <span className="cell-sub" style={{ display: "block" }}>{invoiceLabel(r.invoiceId)}</span>
                    </td>
                    <td className="tnum">{shortAddress(r.payer)}</td>
                    <td className="right text-number-table">{fmtAmount(quoteOf(r, token.decimals).amount, token.decimals)}</td>
                    <td>{fmtDateTime(r.expiry)}</td>
                    <td>
                      {state === "paid" ? (
                        <Tag tone="accent" className={justPaid.has(r.invoiceId) ? "pop" : undefined}>Paid</Tag>
                      ) : state === "expired" ? (
                        <Tag tone="error">Expired</Tag>
                      ) : (
                        <Tag tone="warning"><span className="pulse-dot" aria-hidden="true" />Waiting</Tag>
                      )}
                    </td>
                    <td className="right">
                      {state === "paid" ? (
                        <Link href={`/receipts/${r.invoiceId}?chain=${appChain.id}`}>Receipt</Link>
                      ) : state === "waiting" ? (
                        <Link href={`/pay/${r.invoiceId}`}>Open</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flush" aria-label="Recent receipts">
        <div style={{ padding: "20px 16px 0" }}>
          <h2 className="text-title-card">Recent receipts</h2>
          <p className="card-sub">Payments confirmed on chain for your invoices.</p>
        </div>
        {receiptError ? (
          <p className="empty">Receipts could not be loaded: {receiptError}</p>
        ) : receiptsLoading && receipts.length === 0 ? (
          <SkeletonRows rows={2} cols={3} />
        ) : receipts.length === 0 ? (
          <p className="empty">No payments yet. When a request is paid, its receipt appears here.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="right">Amount</th>
                  <th className="right">Block</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {receipts.map((x) => (
                  <tr key={`${x.tx}-${x.invoiceId}`}>
                    <td className="cell-main">{invoiceLabel(x.invoiceId)}</td>
                    <td className="right text-number-table">{fmtAmount(x.amount, token.decimals)}</td>
                    <td className="right tnum">{x.block.toString()}</td>
                    <td className="right">
                      <Link href={`/receipts/${x.invoiceId}?tx=${x.tx}&chain=${appChain.id}`}>Receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="fine">
        Requests are kept in this browser. The share link carries everything a payer needs, and the contract settles only the exact
        amount on it.
      </p>
    </main>
  );
}
