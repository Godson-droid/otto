"use client";

import { agentBudgetAbi, getLogsChunked } from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getAbiItem, isAddress, parseUnits, type Address, type PublicClient } from "viem";
import { useAccount, useConfig, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useToken } from "@/components/useToken";
import { Notice, Skl, Tag } from "@/components/ui";
import { useNetwork } from "@/lib/network";
import { explain } from "@/lib/errors";
import { fmtAmount, fmtDateTime, invoiceLabel, shortAddress } from "@/lib/otto";

interface Budget {
  id: bigint;
  owner: Address;
  agent: Address;
  totalCap: bigint;
  perPaymentCap: bigint;
  spent: bigint;
  expiry: bigint;
  revoked: boolean;
}

type WriteState = { busy: string | null; error: string | null; done: string | null };

export default function BudgetPage() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const budgets = net.agentBudget;
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === appChain.id;
  const token = useToken();
  const client = usePublicClient({ chainId: appChain.id }) as PublicClient | undefined;

  const nextId = useReadContract({
    address: budgets,
    abi: agentBudgetAbi,
    functionName: "nextBudgetId",
    chainId: appChain.id,
    query: { enabled: Boolean(budgets), refetchInterval: 15_000 },
  });

  const ids = useMemo(() => {
    const n = nextId.data ?? 1n;
    const out: bigint[] = [];
    for (let i = 1n; i < n && i <= 64n; i++) out.push(i);
    return out;
  }, [nextId.data]);

  const all = useReadContracts({
    contracts: ids.map((id) => ({
      address: budgets!,
      abi: agentBudgetAbi,
      functionName: "budgetOf" as const,
      args: [id] as const,
      chainId: appChain.id,
    })),
    query: { enabled: Boolean(budgets && ids.length), refetchInterval: 15_000 },
  });

  const mine: Budget[] = useMemo(() => {
    if (!address || !all.data) return [];
    const out: Budget[] = [];
    all.data.forEach((res, i) => {
      const b = res.result as Budget | undefined;
      if (b && (b.owner.toLowerCase() === address.toLowerCase() || b.agent.toLowerCase() === address.toLowerCase())) {
        out.push({ ...b, id: ids[i] });
      }
    });
    return out;
  }, [all.data, address, ids]);

  // Allowlists and payment history come from the contract's events.
  const events = useQuery({
    queryKey: ["budget-events", appChain.id, budgets, mine.map((b) => b.id.toString()).join(",")],
    enabled: Boolean(client && budgets && mine.length),
    refetchInterval: 20_000,
    queryFn: async () => {
      const head = await client!.getBlockNumber();
      const from = net.deployBlock ?? (head > 20_000n ? head - 20_000n : 0n);
      const [added, removed, payments] = await Promise.all([
        getLogsChunked(client!, { address: budgets!, event: getAbiItem({ abi: agentBudgetAbi, name: "PayeeAdded" }), fromBlock: from, toBlock: head }),
        getLogsChunked(client!, { address: budgets!, event: getAbiItem({ abi: agentBudgetAbi, name: "PayeeRemoved" }), fromBlock: from, toBlock: head }),
        getLogsChunked(client!, { address: budgets!, event: getAbiItem({ abi: agentBudgetAbi, name: "AgentPayment" }), fromBlock: from, toBlock: head }),
      ]);
      const allow = new Map<string, Set<string>>();
      const fold = (logs: { budgetId: bigint; payee: Address }[], on: boolean) => {
        for (const l of logs) {
          const key = l.budgetId.toString();
          if (!allow.has(key)) allow.set(key, new Set());
          const set = allow.get(key)!;
          if (on) set.add(l.payee.toLowerCase());
          else set.delete(l.payee.toLowerCase());
        }
      };
      fold(added.map((l) => ({ budgetId: l.args.budgetId!, payee: l.args.payee! })), true);
      fold(removed.map((l) => ({ budgetId: l.args.budgetId!, payee: l.args.payee! })), false);
      const pays = payments
        .map((l) => ({
          budgetId: l.args.budgetId!,
          agent: l.args.agent!,
          payee: l.args.payee!,
          amount: l.args.amount!,
          invoiceId: l.args.invoiceId!,
          tx: l.transactionHash!,
          block: l.blockNumber ?? 0n,
        }))
        .reverse();
      return { allow, pays };
    },
  });

  const [write, setWrite] = useState<WriteState>({ busy: null, error: null, done: null });

  async function runWrite(key: string, doneMessage: string, fn: () => Promise<`0x${string}`>) {
    setWrite({ busy: key, error: null, done: null });
    try {
      const hash = await fn();
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: appChain.id });
      if (receipt.status !== "success") throw new Error("The transaction did not go through on chain.");
      setWrite({ busy: null, error: null, done: doneMessage });
      nextId.refetch();
      all.refetch();
      events.refetch();
    } catch (e) {
      setWrite({ busy: null, error: explain(e), done: null });
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="text-heading-page">Agent budget</h1>
          <p className="page-sub">
            Give an AI agent a spending mandate with hard limits: a total cap, a cap per payment, a list of who it may pay, and an end
            date. The limits live in the contract, not in the agent, and you can revoke the whole budget at any moment.
          </p>
        </div>
      </div>

      {!budgets && (
        <Notice tone="warning" title="No agent budget contract on this network yet">
          There is no AgentBudget address on {net.label}, so budgets cannot be created or read here yet.
        </Notice>
      )}
      {!isConnected && budgets && (
        <Notice tone="warning" title="Connect your wallet">
          Budgets you own, and budgets that name you as the agent, appear here once your wallet is connected.
        </Notice>
      )}

      {write.error && (
        <Notice tone="error" title="That did not go through">
          {write.error}
        </Notice>
      )}
      {write.done && (
        <Notice tone="good" title="Done">
          {write.done}
        </Notice>
      )}

      {budgets && isConnected && mine.length === 0 && all.isLoading && (
        <section className="card stack" aria-label="Loading budgets">
          <Skl height={22} width="38%" />
          <Skl height={14} width="72%" />
          <Skl height={6} width="100%" />
          <Skl height={14} width="52%" />
        </section>
      )}

      {budgets && isConnected && mine.length === 0 && !all.isLoading && (
        <p className="empty card">No budgets yet. Create the first one below.</p>
      )}

      {mine.map((b) => (
        <BudgetCard
          key={b.id.toString()}
          budget={b}
          isOwner={Boolean(address) && b.owner.toLowerCase() === address!.toLowerCase()}
          allowlist={[...(events.data?.allow.get(b.id.toString()) ?? new Set<string>())]}
          payments={(events.data?.pays ?? []).filter((p) => p.budgetId === b.id)}
          decimals={token.decimals}
          symbol={token.symbol}
          write={write}
          onWrite={runWrite}
          budgetsAddress={budgets!}
          chainId={appChain.id}
        />
      ))}

      {budgets && onChain && (
        <CreateBudget
          budgetsAddress={budgets}
          decimals={token.decimals}
          symbol={token.symbol}
          write={write}
          onWrite={runWrite}
        />
      )}
    </main>
  );
}

function BudgetCard({
  budget: b,
  isOwner,
  allowlist,
  payments,
  decimals,
  symbol,
  write,
  onWrite,
  budgetsAddress,
  chainId,
}: {
  budget: Budget;
  isOwner: boolean;
  allowlist: string[];
  payments: { payee: Address; amount: bigint; invoiceId: `0x${string}`; tx: `0x${string}`; block: bigint }[];
  decimals: number;
  symbol: string;
  write: WriteState;
  onWrite: (key: string, done: string, fn: () => Promise<`0x${string}`>) => Promise<void>;
  budgetsAddress: Address;
  chainId: number;
}) {
  const config = useConfig();
  const [newPayee, setNewPayee] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const expired = Number(b.expiry) <= now;
  const remaining = b.totalCap - b.spent;
  const pct = b.totalCap > 0n ? Number((b.spent * 100n) / b.totalCap) : 0;
  const key = (action: string) => `${b.id}:${action}`;
  const status = b.revoked ? (
    <Tag tone="error">Revoked</Tag>
  ) : expired ? (
    <Tag tone="error">Expired</Tag>
  ) : (
    <Tag tone="accent">Active</Tag>
  );

  return (
    <section className="card stack" aria-label={`Budget ${b.id.toString()}`}>
      <div className="row-between">
        <h2 className="text-title-card">Budget {b.id.toString()}</h2>
        {status}
      </div>

      <div className="grid-3">
        <div>
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Spent of total cap</p>
          <p className="text-number-large tnum" style={{ marginTop: 4 }}>
            {fmtAmount(b.spent, decimals, "")} of {fmtAmount(b.totalCap, decimals)}
          </p>
          <div className="progress" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="fine" style={{ marginTop: 6 }}>{fmtAmount(remaining, decimals)} left</p>
        </div>
        <div>
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Per payment cap</p>
          <p className="text-number-large tnum" style={{ marginTop: 4 }}>{fmtAmount(b.perPaymentCap, decimals)}</p>
          <p className="fine" style={{ marginTop: 6 }}>No single payment can pass this amount</p>
        </div>
        <div>
          <p className="text-label-strong" style={{ color: "var(--text-muted)" }}>Ends</p>
          <p className="text-number-large" style={{ marginTop: 4 }}>{fmtDateTime(Number(b.expiry))}</p>
          <p className="fine" style={{ marginTop: 6 }}>After this time nothing can be paid</p>
        </div>
      </div>

      <dl className="kv">
        <dt>Owner</dt>
        <dd className="addr">{b.owner}{isOwner ? " (you)" : ""}</dd>
        <dt>Agent</dt>
        <dd className="addr">{b.agent}</dd>
      </dl>

      <div>
        <p className="text-label-strong" style={{ color: "var(--text-muted)", marginBottom: 8 }}>Who the agent may pay</p>
        {allowlist.length === 0 ? (
          <p className="fine">No payees yet. The agent cannot pay anyone until at least one payee is on this list.</p>
        ) : (
          <div className="stack-sm">
            {allowlist.map((p) => (
              <div key={p} className="row-between" style={{ gap: 8 }}>
                <span className="addr tnum">{p}</span>
                {isOwner && !b.revoked && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={write.busy !== null}
                    onClick={() =>
                      onWrite(key("remove"), `Removed ${shortAddress(p)} from budget ${b.id.toString()}.`, () =>
                        writeContract(config, {
                          address: budgetsAddress,
                          abi: agentBudgetAbi,
                          functionName: "removePayee",
                          args: [b.id, p as Address],
                          chainId,
                        }),
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isOwner && !b.revoked && (
          <div className="cluster" style={{ marginTop: 12 }}>
            <input
              className="input"
              style={{ flex: "1 1 280px", height: "var(--sizing-control)" }}
              placeholder="Add a payee address, 0x…"
              value={newPayee}
              onChange={(e) => setNewPayee(e.target.value)}
              spellCheck={false}
              aria-label="New payee address"
            />
            <button
              type="button"
              className="btn secondary"
              disabled={!isAddress(newPayee.trim()) || write.busy !== null}
              onClick={() =>
                onWrite(key("add"), `Added ${shortAddress(newPayee.trim())} to budget ${b.id.toString()}.`, () =>
                  writeContract(config, {
                    address: budgetsAddress,
                    abi: agentBudgetAbi,
                    functionName: "addPayee",
                    args: [b.id, newPayee.trim() as Address],
                    chainId,
                  }),
                ).then(() => setNewPayee(""))
              }
            >
              {write.busy === key("add") ? "Adding…" : "Add payee"}
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-label-strong" style={{ color: "var(--text-muted)", marginBottom: 8 }}>What the agent has paid</p>
        {payments.length === 0 ? (
          <p className="fine">No payments under this budget yet. Each payment the agent makes is recorded here and on chain.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Paid to</th>
                  <th className="right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={`${p.tx}-${p.invoiceId}`}>
                    <td className="cell-main">{invoiceLabel(p.invoiceId)}</td>
                    <td className="tnum">{shortAddress(p.payee)}</td>
                    <td className="right text-number-table">{fmtAmount(p.amount, decimals, symbol)}</td>
                    <td className="right">
                      <Link href={`/receipts/${p.invoiceId}?tx=${p.tx}&chain=${chainId}`}>Receipt</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isOwner && !b.revoked && (
        <div className="row-between" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
          <p className="fine" style={{ maxWidth: "52ch" }}>
            Revoking stops this budget at once and for good. The agent keeps nothing and can pay nothing more under it.
          </p>
          {confirmRevoke ? (
            <span className="cluster">
              <button
                type="button"
                className="btn danger"
                disabled={write.busy !== null}
                onClick={() =>
                  onWrite(key("revoke"), `Budget ${b.id.toString()} is revoked. The agent can no longer pay under it.`, () =>
                    writeContract(config, {
                      address: budgetsAddress,
                      abi: agentBudgetAbi,
                      functionName: "revokeBudget",
                      args: [b.id],
                      chainId,
                    }),
                  ).then(() => setConfirmRevoke(false))
                }
              >
                {write.busy === key("revoke") ? "Revoking…" : "Yes, revoke it"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmRevoke(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="btn secondary" onClick={() => setConfirmRevoke(true)}>
              Revoke budget
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function CreateBudget({
  budgetsAddress,
  decimals,
  symbol,
  write,
  onWrite,
}: {
  budgetsAddress: Address;
  decimals: number;
  symbol: string;
  write: WriteState;
  onWrite: (key: string, done: string, fn: () => Promise<`0x${string}`>) => Promise<void>;
}) {
  const config = useConfig();
  const { chainId } = useAccount();
  const [agent, setAgent] = useState("");
  const [total, setTotal] = useState("");
  const [perPayment, setPerPayment] = useState("");
  const [days, setDays] = useState("7");
  const [payees, setPayees] = useState("");

  const amountOk = (v: string) => /^\d+(\.\d{1,6})?$/.test(v.trim()) && Number(v) > 0;
  const payeeList = payees.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  const payeesOk = payeeList.length > 0 && payeeList.every((p) => isAddress(p));
  const capsOk = amountOk(total) && amountOk(perPayment) && Number(perPayment) <= Number(total);
  const canCreate = isAddress(agent.trim()) && capsOk && payeesOk && write.busy === null;

  return (
    <section className="card stack" aria-label="Create a budget">
      <div>
        <h2 className="text-title-card">Create a budget</h2>
        <p className="card-sub">
          The agent can only pay signed requests from the payees you list, and only while every limit holds. The money stays in the
          agent&apos;s wallet until a payment is made.
        </p>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="agent">Agent wallet address</label>
          <input id="agent" className="input" placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)} spellCheck={false} />
          <span className="hint">The wallet the agent pays from. Only requests naming this wallet as the payer can be paid.</span>
        </div>
        <div className="field">
          <label htmlFor="payees">Payees the agent may pay</label>
          <input id="payees" className="input" placeholder="Seller addresses, separated by commas" value={payees} onChange={(e) => setPayees(e.target.value)} spellCheck={false} />
          <span className="hint">The sellers whose signed requests the agent may settle. You can change this list later.</span>
          {payees && !payeesOk && <span className="hint" style={{ color: "var(--semantic-negative)" }}>Every payee must be a complete wallet address.</span>}
        </div>
        <div className="field">
          <label htmlFor="total">Total budget in {symbol}</label>
          <input id="total" className="input tnum" inputMode="decimal" placeholder="200.00" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="per">Cap per payment in {symbol}</label>
          <input id="per" className="input tnum" inputMode="decimal" placeholder="50.00" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} />
          {total && perPayment && Number(perPayment) > Number(total) && (
            <span className="hint" style={{ color: "var(--semantic-negative)" }}>The per payment cap cannot be higher than the total budget.</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="days">Runs for how many days</label>
          <input id="days" className="input tnum" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          <span className="hint">After this the budget ends on its own. You can still revoke it sooner at any time.</span>
        </div>
      </div>
      <div>
        <button
          type="button"
          className="btn lg"
          disabled={!canCreate}
          onClick={() =>
            onWrite("create", "Budget created. The agent can now pay within its limits.", () =>
              writeContract(config, {
                address: budgetsAddress,
                abi: agentBudgetAbi,
                functionName: "createBudget",
                args: [
                  agent.trim() as Address,
                  parseUnits(total.trim() as `${number}`, decimals),
                  parseUnits(perPayment.trim() as `${number}`, decimals),
                  BigInt(Math.floor(Date.now() / 1000) + Math.max(1, Number(days) || 1) * 86_400),
                  payeeList as Address[],
                ],
                chainId,
              }),
            )
          }
        >
          {write.busy === "create" ? "Creating…" : "Create budget"}
        </button>
      </div>
      <p className="fine" style={{ marginTop: -8 }}>Creating a budget moves no money. It only records the limits on chain.</p>
    </section>
  );
}
