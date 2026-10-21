// Part 04 stand-in, re-implemented here because no prior-part files existed in
// the checked-out sandbox (see AI-SESSION-LOG.md). `Explain<T>` is the contract
// every number surfaced to a human in LEADOS must satisfy: a value is useless
// without the drivers and evidence that produced it.
//
// HONESTY RULE: nothing in this file invents numbers. It only shapes and
// carries provenance that calling code must supply.

export type EvidenceRef = {
  table: string;
  id: number | string;
  note?: string;
};

export type Driver = {
  name: string;
  /** signed contribution in the same unit as the explained value, or a fraction for scores */
  contribution: number;
  direction: "positive" | "negative" | "neutral";
  assumptionKey?: string;
  note?: string;
};

export type Explain<T> = {
  value: T;
  /** 0..1 confidence in the figure, must be justified by `method` */
  confidence: number;
  method: string;
  drivers: Driver[];
  assumptionsUsed: string[];
  evidence: EvidenceRef[];
  caveats: string[];
  computedAt: string;
};

export function explain<T>(
  value: T,
  opts: {
    confidence: number;
    method: string;
    drivers?: Driver[];
    assumptionsUsed?: string[];
    evidence?: EvidenceRef[];
    caveats?: string[];
  },
): Explain<T> {
  return {
    value,
    confidence: clamp01(opts.confidence),
    method: opts.method,
    drivers: opts.drivers ?? [],
    assumptionsUsed: opts.assumptionsUsed ?? [],
    evidence: opts.evidence ?? [],
    caveats: opts.caveats ?? [],
    computedAt: new Date().toISOString(),
  };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Sorts drivers by |contribution| descending — the "tornado order". */
export function tornadoOrder(drivers: Driver[]): Driver[] {
  return [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/** Every number on screen must carry at least one assumption or one event reference. */
export function hasProvenance(e: Explain<unknown>): boolean {
  return e.assumptionsUsed.length > 0 || e.evidence.length > 0;
}
