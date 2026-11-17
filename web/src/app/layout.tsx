import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/Header";
import { themeInitScript } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

// Viola's type token names Geist as the kit font; the token file falls back to system-ui.
const geist = Geist({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Otto", template: "%s · Otto" },
  description: "Otto is a payment app on Aevum testnet. Request an exact amount, pay it in tUSD8, and give an AI agent a capped budget.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={geist.className}>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
