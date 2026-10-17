// Shannon entropy / mutual information / signal-to-noise / bottlenecks over
// the synthetic event log. Original implementation for this delivery.
// Formula provenance: standard textbook information theory (Shannon, 1948) —
// not copied from any file in github.com/wbweve/Leados (that repo's
// equivalent file, src/lib/infoTheory.ts, was confirmed to exist and be
// wired into a live Thermodynamics view, but its internals were not read
// line-by-line or ported — see AI-SESSION-LOG.md).
import type { EventLogEntry } from "./types";

export function shannonEntropy(events: EventLogEntry[]): { bits: number; normalized: number } {
  if (events.length === 0) return { bits: 0, normalized: 0 };
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const total = events.length;
  let bits = 0;
  for (const c of counts.values()) {
    const p = c / total;
    bits -= p * Math.log2(p);
  }
  const maxBits = Math.log2(counts.size || 1);
  return { bits, normalized: maxBits > 0 ? bits / maxBits : 0 };
}

export function mutualInformation(events: EventLogEntry[], personA: string, personB: string): number {
  const a = events.filter((e) => e.personId === personA);
  const b = events.filter((e) => e.personId === personB);
  if (a.length === 0 || b.length === 0) return 0;

  // Bucket both people's activity into hourly bins, then treat "active in
  // this bin" (0/1) as the joint random variable pair.
  const hour = 3600000;
  const bin = (ts: number) => Math.floor(ts / hour);
  const binsA = new Set(a.map((e) => bin(e.ts)));
  const binsB = new Set(b.map((e) => bin(e.ts)));
  const allBins = new Set([...binsA, ...binsB]);
  const n = allBins.size;
  if (n === 0) return 0;

  let p00 = 0,
    p01 = 0,
    p10 = 0,
    p11 = 0;
  for (const bn of allBins) {
    const inA = binsA.has(bn);
    const inB = binsB.has(bn);
    if (inA && inB) p11++;
    else if (inA) p10++;
    else if (inB) p01++;
    else p00++;
  }
  const probs = [p00 / n, p01 / n, p10 / n, p11 / n];
  const pA1 = binsA.size / n;
  const pB1 = binsB.size / n;
  const marginals = [
    [1 - pA1, 1 - pB1],
    [1 - pA1, pB1],
    [pA1, 1 - pB1],
    [pA1, pB1],
  ];
  let mi = 0;
  probs.forEach((pxy, i) => {
    if (pxy <= 0) return;
    const [pa, pb] = marginals[i];
    const denom = pa * pb;
    if (denom <= 0) return;
    mi += pxy * Math.log2(pxy / denom);
  });
  return Math.max(0, mi);
}

export interface Bottleneck {
  personId: string;
  informationIn: number;
  thresholdRatio: number; // informationIn / mean, flagged if < 0.3
}

/** People whose event volume ("information in") is under 30% of the team mean. */
export function identifyBottlenecks(events: EventLogEntry[], personIds: string[]): Bottleneck[] {
  const counts = personIds.map((id) => ({ id, n: events.filter((e) => e.personId === id).length }));
  const mean = counts.reduce((s, c) => s + c.n, 0) / (counts.length || 1);
  if (mean === 0) return [];
  return counts
    .filter((c) => c.n / mean < 0.3)
    .map((c) => ({ personId: c.id, informationIn: c.n, thresholdRatio: c.n / mean }));
}

/** Signal-to-noise: share of events that are "signal" types (review, ticket) vs "noise" (message, meeting). */
export function signalToNoise(events: EventLogEntry[]): number {
  if (events.length === 0) return 0;
  const signalTypes = new Set(["review", "ticket", "commit"]);
  const signal = events.filter((e) => signalTypes.has(e.type)).length;
  const noise = events.length - signal;
  if (noise === 0) return signal > 0 ? Infinity : 0;
  return signal / noise;
}
