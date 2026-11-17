import {
  getAbiItem,
  isAddress,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { getLogsChunked, identityRegistryAbi, IDENTITY_REGISTRY_ADDRESS } from "@aevum-kit/aevum";

/** A merchant signed price quote, exactly as SettleCheckout defines it. */
export interface Quote {
  invoiceId: Hex;
  payer: Address;
  amount: bigint;
  expiry: bigint;
}

export const quoteTypes = {
  Quote: [
    { name: "invoiceId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

/** EIP 712 domain of SettleCheckout. The name and version come from the contract constructor. */
export function settleDomain(chainId: number, settle: Address) {
  return { name: "SettleCheckout", version: "1", chainId, verifyingContract: settle } as const;
}

/** A payment request as the merchant's app keeps it. The chain only ever sees the quote. */
export interface PaymentRequest {
  invoiceId: Hex;
  chainId: number;
  settle: Address;
  merchant: Address;
  payer: Address;
  /** tUSD8 amount in whole units, as typed, for example "12.50". */
  amount: string;
  /** Unix seconds. The quote can only be paid strictly before this. */
  expiry: number;
  note: string;
  /** The merchant's EIP 712 signature over the quote. */
  signature: Hex;
  createdAt: number;
}

export function quoteOf(r: PaymentRequest, decimals: number): Quote {
  return {
    invoiceId: r.invoiceId,
    payer: r.payer,
    amount: parseUnits(r.amount as `${number}`, decimals),
    expiry: BigInt(r.expiry),
  };
}

/** A fresh, unguessable invoice id. */
export function newInvoiceId(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return keccak256(toHex(bytes));
}

/** Short label for an invoice id, for lists and headings. */
export function invoiceLabel(invoiceId: string): string {
  return `#${invoiceId.slice(2, 6).toUpperCase()} ${invoiceId.slice(-4).toUpperCase()}`;
}

// ---- the merchant's local request book ----
// Requests live in the merchant's browser: the note and the share link are app data,
// never chain data. Settlement truth is always read back from SettleCheckout.

const storeKey = (chainId: number, merchant: string) => `otto:requests:${chainId}:${merchant.toLowerCase()}`;

export function loadRequests(chainId: number, merchant: string): PaymentRequest[] {
  try {
    const raw = localStorage.getItem(storeKey(chainId, merchant));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaymentRequest[];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.invoiceId === "string") : [];
  } catch {
    return [];
  }
}

export function saveRequest(r: PaymentRequest): PaymentRequest[] {
  const list = [r, ...loadRequests(r.chainId, r.merchant).filter((x) => x.invoiceId !== r.invoiceId)];
  try {
    localStorage.setItem(storeKey(r.chainId, r.merchant), JSON.stringify(list));
  } catch {
    // Storage can be blocked. The request still exists in the share link itself.
  }
  return list;
}

// ---- share links ----
// The whole request travels in the link, so a payer needs nothing but the link.
// The amount in the link is never trusted on its own: the payer's app rebuilds the
// quote, checks the merchant signature recovers to the merchant in the link, and the
// contract rechecks the exact amount before any money moves.

interface PayLinkData {
  v: 1;
  chain: number;
  settle: Address;
  merchant: Address;
  payer: Address;
  amount: string;
  expiry: number;
  note: string;
  sig: Hex;
}

export function payLink(origin: string, r: PaymentRequest): string {
  const data: PayLinkData = {
    v: 1,
    chain: r.chainId,
    settle: r.settle,
    merchant: r.merchant,
    payer: r.payer,
    amount: r.amount,
    expiry: r.expiry,
    note: r.note,
    sig: r.signature,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${origin}/pay/${r.invoiceId}?d=${encoded}`;
}

export function parsePayLink(invoiceId: string, d: string | null): PaymentRequest | null {
  if (!d) return null;
  try {
    const b64 = d.replaceAll("-", "+").replaceAll("_", "/");
    const data = JSON.parse(decodeURIComponent(escape(atob(b64)))) as PayLinkData;
    if (data.v !== 1 || !isAddress(data.settle) || !isAddress(data.merchant) || !isAddress(data.payer)) return null;
    if (typeof data.amount !== "string" || !/^\d+(\.\d{1,6})?$/.test(data.amount)) return null;
    if (typeof data.expiry !== "number" || typeof data.sig !== "string" || !data.sig.startsWith("0x")) return null;
    return {
      invoiceId: invoiceId as Hex,
      chainId: data.chain,
      settle: data.settle,
      merchant: data.merchant,
      payer: data.payer,
      amount: data.amount,
      expiry: data.expiry,
      note: typeof data.note === "string" ? data.note.slice(0, 140) : "",
      signature: data.sig,
      createdAt: 0,
    };
  } catch {
    return null;
  }
}

// ---- Confirmation of Payee: the Aevum identity registry ----

export interface IdentityRecord {
  /** How many identity records the address holds. Zero means no record. */
  count: number;
  /** Filled in when the registration event is found in the scanned window. */
  agentId?: bigint;
  agentUri?: string;
}

/**
 * Does this address hold an identity record on Aevum? One balanceOf call decides the
 * state the UI shows. The registration event scan only enriches it with the agent id
 * and record URI, and only searches the most recent blocks, so a record can be real
 * even when the enrichment finds nothing.
 */
export async function lookupIdentity(
  client: PublicClient,
  address: Address,
  scanBlocks = 20_000n,
): Promise<IdentityRecord> {
  const count = await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "balanceOf",
    args: [address],
  });
  if (count === 0n) return { count: 0 };
  try {
    const head = await client.getBlockNumber();
    const from = head > scanBlocks ? head - scanBlocks + 1n : 0n;
    const logs = await getLogsChunked(client, {
      address: IDENTITY_REGISTRY_ADDRESS,
      event: getAbiItem({ abi: identityRegistryAbi, name: "Registered" }),
      args: { owner: address },
      fromBlock: from,
      toBlock: head,
    });
    const last = logs.at(-1);
    if (last?.args.agentId !== undefined) {
      return { count: Number(count), agentId: last.args.agentId, agentUri: last.args.agentURI };
    }
  } catch {
    // Enrichment is best effort. The count above is the state that matters.
  }
  return { count: Number(count) };
}

// ---- display helpers ----

/** "1,234.50 tUSD8" from base units. Amounts always carry their currency. */
export function fmtAmount(base: bigint, decimals: number, symbol = "tUSD8"): string {
  const neg = base < 0n;
  const v = neg ? -base : base;
  const scale = 10n ** BigInt(decimals);
  const whole = v / scale;
  const frac = ((v % scale) * 100n) / scale;
  const text = `${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "−" : ""}${text} ${symbol}`;
}

/** "12.50 tUSD8" from a typed amount string. */
export function fmtTypedAmount(amount: string, symbol = "tUSD8"): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${symbol}`;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}

export function fmtDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddress(value: string, head = 6, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}
