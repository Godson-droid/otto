"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { networks, repoUrl } from "@/lib/env";
import { useNetwork } from "@/lib/network";
import { useTheme } from "@/lib/theme";
import { BotIcon, GitHubIcon, HomeIcon, MoonIcon, RequestIcon, SendIcon, SunIcon } from "./Icons";

const links = [
  { href: "/", label: "Home", icon: <HomeIcon /> },
  { href: "/pay", label: "Pay", icon: <SendIcon /> },
  { href: "/request", label: "Request", icon: <RequestIcon /> },
  { href: "/budget", label: "Agent budget", icon: <BotIcon /> },
];

function NavItems() {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className="sidebar-item" aria-current={active ? "page" : undefined}>
            {l.icon}
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="sidebar-brand" style={{ color: "var(--text-primary)", textDecoration: "none" }}>
      <span className="brand-mark" aria-hidden="true">O</span>
      <span className="text-title-brand">Otto</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { net, select, switchingTo, switchError } = useNetwork();
  const { theme, toggle } = useTheme();
  const wrongNetwork = isConnected && chainId !== net.chain.id && !switchingTo;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-nav" aria-label="Main">
          <NavItems />
        </nav>
        <div className="sidebar-foot">
          <span className="fine">
            {net.chain.name} · chain {net.chain.id}
          </span>
          <a className="cluster" style={{ gap: 8, color: "var(--text-secondary)" }} href={repoUrl} target="_blank" rel="noreferrer">
            <GitHubIcon size={16} /> Source code
          </a>
        </div>
      </aside>

      <div className="content">
        <div className="mobile-nav">
          <NavItems />
        </div>
        <header className="topbar">
          <span className="text-title-brand" style={{ display: "none" }}>Otto</span>
          {networks.length > 1 && (
            <div className="net-switch" role="radiogroup" aria-label="Network">
              {networks.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  role="radio"
                  aria-checked={n.key === net.key}
                  disabled={Boolean(switchingTo)}
                  title={`${n.chain.name} · chain ${n.chain.id}`}
                  onClick={() => select(n.key)}
                >
                  <span className={`net-dot ${n.key}`} aria-hidden="true" />
                  {n.label}
                </button>
              ))}
            </div>
          )}
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
        </header>

        {switchingTo && (
          <div className="banner info" role="status">
            <span>
              Confirm the switch to <strong>{switchingTo.chain.name}</strong> in your wallet. If no window opened, click the wallet icon in
              your browser toolbar.
            </span>
          </div>
        )}
        {switchError && !switchingTo && (
          <div className="banner" role="alert">
            <span>{switchError}</span>
          </div>
        )}
        {wrongNetwork && (
          <div className="banner" role="alert">
            <span>
              Your wallet is on another network. This app is set to <strong>{net.chain.name} ({net.chain.id})</strong>.
            </span>
            <button type="button" className="btn danger sm" onClick={() => select(net.key)}>
              Switch network
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
