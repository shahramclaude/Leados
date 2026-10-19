import type { DomainKey, Severity } from "./types";
import { DOMAIN_META } from "./mockData";

// ─────────────────────────────────────────────────────────────
// shared.tsx — formatting + lookup helpers reused across views.
// ─────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

export function timeUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const hrs = Math.round(diffMs / 3_600_000);
  if (hrs <= 0) return "overdue";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export const SEVERITY_VAR: Record<Severity, string> = {
  5: "--sev-5",
  4: "--sev-4",
  3: "--sev-3",
  2: "--sev-2",
  1: "--sev-1",
};

export function domainColorVar(domain: DomainKey): string {
  return DOMAIN_META[domain].colorVar;
}

export function domainName(domain: DomainKey): string {
  return DOMAIN_META[domain].name;
}

export function healthBand(score: number): { color: string; label: string } {
  if (score >= 70) return { color: "var(--health-green)", label: "STABLE" };
  if (score >= 50) return { color: "var(--health-amber)", label: "STRAINED" };
  return { color: "var(--health-red)", label: "CRITICAL" };
}

export function cascadeBand(pct: number): string {
  if (pct > 40) return "var(--health-critical)";
  if (pct > 20) return "var(--health-amber)";
  return "var(--health-green)";
}

export function entropyBand(n: number): string {
  if (n > 70) return "var(--health-critical)";
  if (n > 40) return "var(--health-amber)";
  return "var(--health-green)";
}

export function riskProfileColor(p: string): string {
  switch (p) {
    case "critical":
      return "var(--health-critical)";
    case "red":
      return "var(--health-red)";
    case "amber":
      return "var(--health-amber)";
    default:
      return "var(--health-green)";
  }
}

export function scoreMath(sev: Severity, confidence: number): string {
  return `sev:${sev} × conf:${confidence.toFixed(2)} = ${(sev * confidence).toFixed(2)}`;
}
