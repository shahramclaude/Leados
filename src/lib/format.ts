import { createHash } from "node:crypto";

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  return 0;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + Math.round(days));
  return out;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

export function monthKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Deterministic stable-key JSON stringify used for content hashing (board pack determinism). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortDeep(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(value: unknown): string {
  return sha256(stableStringify(value));
}
