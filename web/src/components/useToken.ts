"use client";

import { erc20Abi, settleCheckoutAbi, TUSD8_ADDRESS } from "@aevum-kit/aevum";
import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { useNetwork } from "@/lib/network";

/**
 * The payment token. Read from SettleCheckout.token() when Otto is deployed on the
 * network (works for the local MockUSD8 too); otherwise tUSD8 on Aevum.
 */
export function useToken() {
  const { net } = useNetwork();
  const appChain = net.chain;
  const settle = net.settle;
  const fromSettle = useReadContract({
    address: settle,
    abi: settleCheckoutAbi,
    functionName: "token",
    chainId: appChain.id,
    query: { enabled: Boolean(settle) },
  });
  const address: Address | undefined = fromSettle.data ?? (net.key === "local" ? undefined : TUSD8_ADDRESS);
  const meta = useReadContracts({
    contracts: address
      ? [
          { address, abi: erc20Abi, functionName: "decimals", chainId: appChain.id },
          { address, abi: erc20Abi, functionName: "symbol", chainId: appChain.id },
        ]
      : [],
    query: { enabled: Boolean(address) },
  });
  const decimals = (meta.data?.[0]?.result as number | undefined) ?? 6;
  const symbol = (meta.data?.[1]?.result as string | undefined) ?? "tUSD8";
  return { address, decimals, symbol, isLoading: fromSettle.isLoading || meta.isLoading };
}
