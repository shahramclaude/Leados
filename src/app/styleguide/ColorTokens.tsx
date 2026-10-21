"use client";

import { useEffect, useRef, useState } from "react";
import { apcaContrast, wcagContrast, APCA_FLOOR, WCAG_FLOOR, type ContrastClass } from "@/lib/a11y";
import { resolveCssColorToRgb } from "@/lib/color";
import { Badge } from "@/components/ui/Badge";
import { CONFIDENCE_LEVELS, DOMAIN_META, CATEGORICAL_ORDER, SEQUENTIAL_RAMP, DIVERGING_RAMP } from "@/design/tokens";

interface Pair {
  label: string;
  text: string;
  bg: string;
  cls: ContrastClass;
}

const SANCTIONED_PAIRS: Pair[] = [
  { label: "text-primary on surface-0", text: "var(--text-primary)", bg: "var(--surface-0)", cls: "body" },
  { label: "text-primary on surface-1", text: "var(--text-primary)", bg: "var(--surface-1)", cls: "body" },
  { label: "text-primary on surface-2", text: "var(--text-primary)", bg: "var(--surface-2)", cls: "body" },
  { label: "text-secondary on surface-0", text: "var(--text-secondary)", bg: "var(--surface-0)", cls: "large" },
  { label: "text-muted on surface-0", text: "var(--text-muted)", bg: "var(--surface-0)", cls: "ui" },
  { label: "border-strong on surface-0", text: "var(--border-strong)", bg: "var(--surface-0)", cls: "ui" },
];

/** Live, in-browser cross-check of the same sanctioned pairs the Node audit
 * script verifies against the CSS source. This reads ACTUAL rendered pixels
 * (via canvas) for the theme currently applied to `scopeRef`, so it is a
 * real second measurement, not a restatement of the build-time numbers. */
function LiveContrastRow({ pair, scopeRef }: { pair: Pair; scopeRef: React.RefObject<HTMLElement | null> }) {
  const [result, setResult] = useState<{ lc: number; wcag: number } | null>(null);

  useEffect(() => {
    if (!scopeRef.current) return;
    const probe = document.createElement("div");
    probe.style.color = pair.text;
    probe.style.backgroundColor = pair.bg;
    scopeRef.current.appendChild(probe);
    const computed = getComputedStyle(probe);
    const text = resolveCssColorToRgb(computed.color);
    const bg = resolveCssColorToRgb(computed.backgroundColor);
    scopeRef.current.removeChild(probe);
    if (text && bg) {
      setResult({ lc: apcaContrast(text, bg), wcag: wcagContrast(text, bg) });
    }
  }, [pair, scopeRef]);

  if (!result) return null;
  const pass = Math.abs(result.lc) >= APCA_FLOOR[pair.cls] && result.wcag >= WCAG_FLOOR[pair.cls];

  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2">
      <span className="flex items-center gap-2 text-[var(--text-sm)]">
        <span className="rounded px-2 py-1" style={{ color: pair.text, backgroundColor: pair.bg }}>
          Ag
        </span>
        {pair.label}
        <span className="text-[var(--text-muted)]">({pair.cls} ≥ Lc {APCA_FLOOR[pair.cls]})</span>
      </span>
      <span data-metric className="flex items-center gap-2 text-[var(--text-sm)]">
        <span>Lc {result.lc.toFixed(1)}</span>
        <span>WCAG {result.wcag.toFixed(2)}:1</span>
        <Badge tone={pass ? "success" : "danger"}>{pass ? "PASS" : "FAIL"}</Badge>
      </span>
    </li>
  );
}

function ContrastPanel({ theme }: { theme: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-theme={theme === "light" ? undefined : theme} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-0)] p-4">
      <p className="mb-2 text-[var(--text-sm)] font-semibold text-[var(--text-secondary)]">Theme: {theme}</p>
      <ul className="flex flex-col gap-1.5">
        {SANCTIONED_PAIRS.map((pair) => (
          <LiveContrastRow key={pair.label} pair={pair} scopeRef={ref} />
        ))}
      </ul>
    </div>
  );
}

function Swatch({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)]" style={style} />
      <span className="text-[var(--text-xs)] text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export function ColorTokens() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">
          Live APCA/WCAG audit (in-browser, per theme)
        </h3>
        <p className="measure mb-3 text-[var(--text-sm)] text-[var(--text-muted)]">
          This reads real rendered pixels via canvas for the sanctioned text/background pairs declared in this file. The
          authoritative, CI-gated check is <code>npm run design:check</code>, which parses <code>src/design/tokens.css</code>{" "}
          directly with the same APCA math (cross-checked against the <code>apca-w3</code> reference package) — see
          AI-SESSION-LOG.md for that run&rsquo;s output.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ContrastPanel theme="light" />
          <ContrastPanel theme="dark" />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Domain accents (tint / ink / solid)</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORICAL_ORDER.map((id) => {
            const meta = DOMAIN_META[id];
            return (
              <div key={id} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
                <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">{meta.label}</p>
                <div
                  className="rounded-[var(--radius-md)] px-2 py-3 text-center text-[var(--text-sm)] font-medium"
                  style={{ backgroundColor: `var(--domain-${id}-tint)`, color: `var(--domain-${id}-ink)` }}
                >
                  ink on tint
                </div>
                <div className="h-6 rounded-[var(--radius-md)]" style={{ backgroundColor: `var(--domain-${id}-solid)` }} />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Semantic</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["success", "warn", "danger", "info"] as const).map((id) => (
            <div key={id} className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
              <p className="text-[var(--text-sm)] font-semibold capitalize text-[var(--text-primary)]">{id}</p>
              <div
                className="rounded-[var(--radius-md)] px-2 py-3 text-center text-[var(--text-sm)] font-medium"
                style={{ backgroundColor: `var(--${id}-tint)`, color: `var(--${id}-ink)` }}
              >
                ink on tint
              </div>
              <div className="h-6 rounded-[var(--radius-md)]" style={{ backgroundColor: `var(--${id}-solid)` }} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">
          Confidence ramp (observed → assumed)
        </h3>
        <div className="flex gap-3">
          {CONFIDENCE_LEVELS.map((level) => (
            <Swatch key={level.id} label={`${level.index}. ${level.label}`} style={{ backgroundColor: `var(${level.cssVar})` }} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Sequential ramp (7-step)</h3>
          <div className="flex gap-1">
            {SEQUENTIAL_RAMP.map((v) => (
              <div key={v} className="h-10 flex-1 rounded-[var(--radius-sm)]" style={{ backgroundColor: `var(${v})` }} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">Diverging ramp (amber ↔ blue)</h3>
          <div className="flex gap-1">
            {DIVERGING_RAMP.map((v) => (
              <div key={v} className="h-10 flex-1 rounded-[var(--radius-sm)]" style={{ backgroundColor: `var(${v})` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
