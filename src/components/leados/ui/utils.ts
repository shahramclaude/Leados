import { clsx, type ClassValue } from "clsx";
import { useId } from "react";

/** Thin wrapper so every primitive composes class names the same way. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** SSR-safe id generator (wraps React's useId) for aria-describedby/labelledby pairs. */
export function useStableId(prefix: string): string {
  const id = useId();
  return `${prefix}-${id}`;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", options).format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", options ?? { month: "short", day: "numeric" }).format(new Date(value));
}
