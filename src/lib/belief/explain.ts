/**
 * src/lib/belief/explain.ts
 *
 * COMPATIBILITY NOTE (read-before-write disclosure):
 * The standing order for this part asks us to build on "Part 04's belief
 * core" (the uncertainty-envelope type referenced throughout LEADOS as
 * `Explain<T>`). At the time this part was implemented, the repository
 * snapshot available to this task contained only the default Vite/React/
 * Tailwind scaffold (`src/App.tsx`, `src/index.css`, `src/main.tsx`,
 * `src/utils/cn.ts`) — there were no `src/lib/causal/*`, `mathUtils.ts`,
 * `stats.ts`, or belief-core files to read. We record that honestly here
 * instead of silently inventing a history.
 *
 * To avoid blocking delivery of the causal-inference layer, this file
 * defines a minimal, self-contained `Explain<T>` envelope that mirrors the
 * shape implied by the standing order (value + interval + confidence +
 * caveats). If/when the real Part 04 belief core is uploaded, this file
 * should be deleted and all imports repointed — they are isolated to this
 * one module on purpose.
 */

/** A value accompanied by an uncertainty interval and plain-language caveats. */
export interface Explain<T> {
  /** Point estimate / best-guess value. */
  value: T;
  /** Lower bound of the interval (same units as value). */
  low: T;
  /** Upper bound of the interval (same units as value). */
  high: T;
  /** Nominal coverage of the interval, e.g. 0.9 for a 90% interval. */
  coverage: number;
  /** Short machine identifier of how the interval was produced. */
  method: string;
  /** Plain-language caveats a reader should know before trusting this number. */
  caveats: string[];
}

/** Build an Explain<number> envelope from a point estimate + symmetric half-width. */
export function explainFromHalfWidth(
  value: number,
  halfWidth: number,
  coverage: number,
  method: string,
  caveats: string[] = [],
): Explain<number> {
  return {
    value,
    low: value - Math.abs(halfWidth),
    high: value + Math.abs(halfWidth),
    coverage,
    method,
    caveats,
  };
}

/** Build an Explain<number> envelope from an explicit [low, high] interval. */
export function explainFromInterval(
  value: number,
  low: number,
  high: number,
  coverage: number,
  method: string,
  caveats: string[] = [],
): Explain<number> {
  return { value, low: Math.min(low, high), high: Math.max(low, high), coverage, method, caveats };
}

/** Widen an existing envelope (e.g. for sensitivity-slider "what if confounding were worse"). */
export function widenEnvelope<T extends number>(e: Explain<T>, factor: number): Explain<T> {
  const mid = e.value;
  const halfWidth = ((e.high - e.low) / 2) * factor;
  return {
    ...e,
    low: (mid - halfWidth) as T,
    high: (mid + halfWidth) as T,
  };
}
