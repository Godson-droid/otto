"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, ShieldIcon, WarnIcon } from "./Icons";
import { fmtAmount, type IdentityRecord } from "@/lib/otto";

export function Tag({ tone = "default", className, children }: { tone?: "default" | "accent" | "warning" | "error"; className?: string; children: ReactNode }) {
  return <span className={`tag ${tone === "default" ? "" : tone}${className ? ` ${className}` : ""}`}>{children}</span>;
}

export function Notice({
  tone = "info",
  title,
  className,
  children,
}: {
  tone?: "info" | "warning" | "error" | "good";
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`notice ${tone === "info" ? "" : tone}${className ? ` ${className}` : ""}`} role={tone === "error" ? "alert" : "status"}>
      <span className="notice-title">{title}</span>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/**
 * A money figure that counts toward its real value whenever the value changes:
 * on first load, and again when a payment lands and the number moves. The final
 * frame is the exact figure, formatted the same way as every other amount.
 */
export function CountUp({ base, decimals, symbol = "" }: { base: bigint; decimals: number; symbol?: string }) {
  const [display, setDisplay] = useState(0n);
  const fromRef = useRef(0n);
  useEffect(() => {
    const from = fromRef.current;
    const to = base;
    fromRef.current = base;
    if (from === to) {
      setDisplay(to);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + ((to - from) * BigInt(Math.round(eased * 10000))) / 10000n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [base]);
  return <>{fmtAmount(display, decimals, symbol).trim()}</>;
}

/** Shimmering placeholder block, sized by inline style. */
export function Skl({ width = "100%", height = 16, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return <div className="skl" style={{ width, height, ...style }} aria-hidden="true" />;
}

/** Placeholder rows for a table that is still reading the chain. */
export function SkeletonRows({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: "8px 16px 20px", display: "flex", flexDirection: "column", gap: 12 }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skl key={j} height={14} width={j === 0 ? "70%" : "50%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface TrendPoint {
  /** Unix seconds. */
  t: number;
  /** Cumulative tUSD8 value at this point, in base units. */
  v: bigint;
}

/**
 * Viola portfolio chart treatment, drawn from real settlements: the portfolio
 * line token over a light tint, dashed baselines, tabular captions. The line
 * draws itself in once on mount; the data is the merchant's own receipts.
 */
export function TrendChart({ points, decimals }: { points: TrendPoint[]; decimals: number }) {
  if (points.length < 2) return null;
  const W = 640;
  const H = 208;
  const PAD = { l: 8, r: 8, t: 14, b: 22 };
  const max = points.reduce((m, p) => (p.v > m ? p.v : m), 0n);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: bigint) => {
    const frac = max === 0n ? 0 : Number((v * 10000n) / max) / 10000;
    return PAD.t + (1 - frac) * (H - PAD.t - PAD.b);
  };
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(t0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const timeLabel = (t: number) =>
    new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Payments received over time" style={{ display: "block" }}>
      {[0.25, 0.55, 0.85].map((f) => {
        const gy = PAD.t + f * (H - PAD.t - PAD.b);
        return <line key={f} x1={PAD.l} x2={W - PAD.r} y1={gy} y2={gy} stroke="var(--chart-baseline)" strokeWidth="1" strokeDasharray="3 4" />;
      })}
      <path className="chart-area" d={area} fill="var(--chart-line-portfolio)" opacity="0.1" stroke="none" />
      <path className="chart-line" d={line} fill="none" stroke="var(--chart-line-portfolio)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
      <circle className="chart-dot" cx={x(last.t)} cy={y(last.v)} r="4" fill="var(--chart-line-portfolio)" stroke="var(--bg-surface)" strokeWidth="2" />
      <text x={PAD.l} y={H - 6} fontSize="11" fill="var(--text-muted)">{timeLabel(t0)}</text>
      <text x={W - PAD.r} y={H - 6} fontSize="11" fill="var(--text-muted)" textAnchor="end">{timeLabel(t1)}</text>
      <text x={W - PAD.r} y={PAD.t - 2} fontSize="11" fill="var(--text-muted)" textAnchor="end" className="tnum">
        {fmtAmount(max, decimals)}
      </text>
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard can be unavailable (permissions, insecure origin). The text stays selectable on screen.
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Confirmation of Payee, from the Aevum identity registry. A record means the address
 * registered an identity on chain. No record is not proof of anything bad, so the copy
 * says exactly what to do: only pay someone you know.
 */
export function IdentityPanel({ record, loading }: { record?: IdentityRecord; loading?: boolean }) {
  if (loading || !record) {
    return (
      <div className="notice">
        <span className="notice-title cluster" style={{ gap: 8 }}>
          <Spinner /> Checking the identity registry
        </span>
        <p>Looking this address up in the Aevum identity registry before you pay.</p>
      </div>
    );
  }
  if (record.count > 0) {
    return (
      <div className="notice good">
        <span className="notice-title cluster" style={{ gap: 8 }}>
          <ShieldIcon /> Identity record found
        </span>
        <p>
          This address holds {record.count === 1 ? "an identity record" : `${record.count} identity records`} in the Aevum identity
          registry{record.agentId !== undefined ? `, most recently record ${record.agentId.toString()}` : ""}. A record shows the address
          registered itself on chain. It does not prove who controls it, so still check the name matches who you expect to pay.
        </p>
      </div>
    );
  }
  return (
    <div className="notice warning">
      <span className="notice-title cluster" style={{ gap: 8 }}>
        <WarnIcon /> No identity record for this address
      </span>
      <p>
        This address has no identity record in the Aevum registry. Only go ahead if you know and trust who controls it. If someone gave
        you this address in a message, check it with them on a different channel before you pay.
      </p>
    </div>
  );
}
