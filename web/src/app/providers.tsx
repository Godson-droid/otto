"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { NetworkProvider, useNetwork } from "@/lib/network";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { wagmiConfig } from "@/lib/wagmi";

// RainbowKit accents are Viola's accent token values in each mode.
const rkLight = lightTheme({ accentColor: "#6366f1", accentColorForeground: "#ffffff", borderRadius: "medium" });
const rkDark = darkTheme({ accentColor: "#818cf8", accentColorForeground: "#ffffff", borderRadius: "medium" });

/** Connect the wallet straight to the network picked in the header, not always the first one. */
function RainbowKit({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  const { theme } = useTheme();
  return (
    <RainbowKitProvider initialChain={net.chain} locale="en-US" theme={theme === "dark" ? rkDark : rkLight} appInfo={{ appName: "Otto" }}>
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NetworkProvider>
            <RainbowKit>{children}</RainbowKit>
          </NetworkProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
