import { isAddress, type Address, type Chain } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export type NetworkKey = "aevum" | "fork" | "local";

export interface Network {
  key: NetworkKey;
  /** Short name for the network switcher. */
  label: string;
  chain: Chain;
  /** Your Checkout on this network, if you deployed one. */
  checkout?: Address;
  /** Otto's SettleCheckout (merchant signed quotes) on this network. */
  settle?: Address;
  /** Otto's AgentBudget (capped agent mandates) on this network. */
  agentBudget?: Address;
  /** Only scan events from this block onward on the Activity page. */
  deployBlock?: bigint;
  /** Explorer links only make sense on the real testnet. */
  hasExplorer: boolean;
}

const address = (v: string | undefined): Address | undefined => (v && isAddress(v.trim()) ? (v.trim() as Address) : undefined);
const block = (v: string | undefined): bigint | undefined => (v && /^\d+$/.test(v.trim()) ? BigInt(v.trim()) : undefined);

// NEXT_PUBLIC_* values must be written out in full so Next.js can inline them into the browser bundle.
const all: Record<NetworkKey, Network> = {
  aevum: {
    key: "aevum",
    label: "Aevum testnet",
    chain: aevumTestnet,
    checkout: address(process.env.NEXT_PUBLIC_CHECKOUT_AEVUM),
    settle: address(process.env.NEXT_PUBLIC_SETTLE_AEVUM),
    agentBudget: address(process.env.NEXT_PUBLIC_AGENT_BUDGET_AEVUM),
    deployBlock: block(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_AEVUM),
    hasExplorer: true,
  },
  fork: {
    key: "fork",
    label: "Local fork",
    chain: aevumFork,
    checkout: address(process.env.NEXT_PUBLIC_CHECKOUT_FORK),
    settle: address(process.env.NEXT_PUBLIC_SETTLE_FORK),
    agentBudget: address(process.env.NEXT_PUBLIC_AGENT_BUDGET_FORK),
    deployBlock: block(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_FORK),
    hasExplorer: false,
  },
  local: {
    key: "local",
    label: "Local anvil",
    chain: localAnvil,
    checkout: address(process.env.NEXT_PUBLIC_CHECKOUT_LOCAL),
    settle: address(process.env.NEXT_PUBLIC_SETTLE_LOCAL),
    agentBudget: address(process.env.NEXT_PUBLIC_AGENT_BUDGET_LOCAL),
    deployBlock: undefined,
    hasExplorer: false,
  },
};

const requested = (process.env.NEXT_PUBLIC_NETWORKS ?? "aevum")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is NetworkKey => k in all);

/** The networks the app offers, in the order of NEXT_PUBLIC_NETWORKS. The first one is the default. */
export const networks: [Network, ...Network[]] = (() => {
  const keys = [...new Set(requested)];
  const list = (keys.length ? keys : (["aevum"] as NetworkKey[])).map((k) => all[k]);
  return list as [Network, ...Network[]];
})();

export const defaultNetwork = networks[0];

export function networkByChainId(chainId: number | undefined): Network | undefined {
  return networks.find((n) => n.chain.id === chainId);
}

export function networkByKey(key: string | null | undefined): Network | undefined {
  return networks.find((n) => n.key === key);
}

/**
 * Otto's WalletConnect (Reown) project id. A project id is a public client
 * identifier, not a secret — it ships in the browser bundle either way — so,
 * following the Reflex precedent, the default lives here in code. That keeps
 * the hosted Vercel build working with no dashboard env change. Set
 * NEXT_PUBLIC_WC_PROJECT_ID (web/.env.local locally) to override it.
 */
export const WALLETCONNECT_PROJECT_ID = "5940522633ad9fc623dd1fb3f00b05f4";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim() || WALLETCONNECT_PROJECT_ID || undefined;

/** Where the "Source" links and the clone command on the Docs page point. Override it for a fork or a preview deploy. */
export const repoUrl = (process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/qday-io/aevum-starter-kit").replace(/\.git$|\/+$/g, "");
