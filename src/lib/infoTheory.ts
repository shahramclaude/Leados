// src/lib/infoTheory.ts
// Shannon entropy / mutual information / signal-to-noise / information
// bottlenecks, applied to the synthetic event log (src/lib/seed.ts) and the
// active findings (src/lib/engine.ts).
//
// PROVENANCE: this is an ORIGINAL implementation written for this sandbox.
// A file with the same purpose (src/lib/infoTheory.ts, wired into a live
// "Thermodynamics" view) was independently confirmed to exist in the real
// wbweve/Leados repo this session — see AI-SESSION-LOG.md §2, V6-V8 — but
// its internals were not copied; this is a fresh implementation of the
// same disclosed, standard formulas (Shannon 1948), not a port.
import type { Finding, OrgEvent, Person } from "./types";

export interface EntropyResult {
  H: number;
  Hmax: number;
  normalized: number;
  richness: number;
  dominantType: string | null;
}

/** H = −Σ p(x)·log2 p(x) over the distribution of event types. */
export function shannonEntropy(events: OrgEvent[]): EntropyResult {
  if (events.length === 0) return { H: 0, Hmax: 0, normalized: 0, richness: 0, dominantType: null };
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) || 0) + 1);
  const n = events.length;
  let H = 0;
  let dominant: [string, number] = ["", -1];
  for (const [type, c] of counts) {
    const p = c / n;
    H -= p * Math.log2(p);
    if (c > dominant[1]) dominant = [type, c];
  }
  const richness = counts.size;
  const Hmax = richness > 1 ? Math.log2(richness) : 0;
  return {
    H,
    Hmax,
    normalized: Hmax > 0 ? H / Hmax : 0,
    richness,
    dominantType: dominant[0] || null,
  };
}

export interface MIResult {
  MI: number;
  HX: number;
  HY: number;
  normalized: number;
  weeksCompared: number;
  label: string;
}

/** I(X;Y) = H(X) + H(Y) − H(X,Y), binned weekly over a rolling window. */
export function mutualInformation(streamX: OrgEvent[], streamY: OrgEvent[], today: Date, windowDays = 90): MIResult {
  const weeks = Math.ceil(windowDays / 7);
  const end = today.getTime();
  const start = end - windowDays * 86400000;
  const binsX: boolean[] = new Array(weeks).fill(false);
  const binsY: boolean[] = new Array(weeks).fill(false);
  const bin = (ts: number) => Math.floor((ts - start) / (7 * 86400000));

  for (const e of streamX) {
    if (e.ts < start || e.ts > end) continue;
    const b = bin(e.ts);
    if (b >= 0 && b < weeks) binsX[b] = true;
  }
  for (const e of streamY) {
    if (e.ts < start || e.ts > end) continue;
    const b = bin(e.ts);
    if (b >= 0 && b < weeks) binsY[b] = true;
  }

  if (streamX.length === 0 || streamY.length === 0) {
    return { MI: 0, HX: 0, HY: 0, normalized: 0, weeksCompared: weeks, label: "One or both streams have no events in this window: mutual information is 0 by definition (no joint variation to measure)." };
  }

  const H = (bins: boolean[]) => {
    const p1 = bins.filter(Boolean).length / bins.length;
    if (p1 === 0 || p1 === 1) return 0;
    return -(p1 * Math.log2(p1) + (1 - p1) * Math.log2(1 - p1));
  };
  const HX = H(binsX);
  const HY = H(binsY);

  const joint = new Map<string, number>();
  for (let i = 0; i < weeks; i++) {
    const key = `${binsX[i] ? 1 : 0},${binsY[i] ? 1 : 0}`;
    joint.set(key, (joint.get(key) || 0) + 1);
  }
  let HXY = 0;
  for (const c of joint.values()) {
    const p = c / weeks;
    HXY -= p * Math.log2(p);
  }
  const MI = Math.max(0, HX + HY - HXY);
  const maxMI = Math.min(HX, HY) || 1;
  return {
    MI,
    HX,
    HY,
    normalized: maxMI > 0 ? MI / maxMI : 0,
    weeksCompared: weeks,
    label:
      MI < 0.05
        ? "Near-zero: these two people's logged activity shows no detectable weekly co-occurrence pattern."
        : MI > 0.4
        ? "High: these two people's activity weeks are strongly coupled — could be healthy collaboration or unhealthy dependency; this metric cannot distinguish the two."
        : "Moderate coupling between these two people's logged activity weeks.",
  };
}

export interface SNRResult {
  signalCount: number;
  noiseCount: number;
  snr: number;
  snrDb: number;
  interpretation: string;
  label: string;
}

/** Signal = events that fall within ±2 days of an active finding in the same category (and same person, if the finding is person-linked). Noise = everything else logged. */
export function signalToNoise(events: OrgEvent[], findings: Finding[]): SNRResult {
  const windowMs = 2 * 86400000;
  let signalCount = 0;
  for (const e of events) {
    const isSignal = findings.some((f) => {
      if (f.category !== e.category) return false;
      if (f.personId && e.personId && f.personId !== e.personId) return false;
      return Math.abs(e.ts - f.ts) <= windowMs;
    });
    if (isSignal) signalCount++;
  }
  const noiseCount = events.length - signalCount;
  const snr = noiseCount === 0 ? signalCount : signalCount / Math.max(1, noiseCount);
  const snrDb = signalCount > 0 && noiseCount > 0 ? 10 * Math.log10(signalCount / noiseCount) : signalCount > 0 ? Infinity : -Infinity;
  return {
    signalCount,
    noiseCount,
    snr,
    snrDb: Number.isFinite(snrDb) ? snrDb : snrDb > 0 ? 99 : -99,
    interpretation:
      findings.length === 0
        ? "No active findings: every logged event is classified as noise by definition (there is no signal to match against)."
        : snr < 0.3
        ? "Low SNR: most logged activity is not explained by anything currently flagged as a finding."
        : snr > 1
        ? "High SNR: most logged activity sits near an active finding — either good focus or a sign the log itself is finding-driven."
        : "Moderate SNR.",
    label: `${signalCount} + ${noiseCount} = ${events.length} total events (always reconciles exactly).`,
  };
}

export interface BottleneckResult {
  bottlenecks: { person: Person; informationIn: number; percentOfMean: number }[];
  label: string;
}

/** Flags people whose "information in" event count is under 30% of the roster mean. */
export function identifyBottlenecks(events: OrgEvent[], people: Person[]): BottleneckResult {
  const inCounts = people.map((p) => ({
    person: p,
    informationIn: events.filter((e) => e.personId === p.id && e.direction === "in").length,
  }));
  const mean = inCounts.reduce((a, b) => a + b.informationIn, 0) / (people.length || 1);
  const threshold = mean * 0.3;
  const bottlenecks = inCounts
    .filter((x) => x.informationIn < threshold)
    .map((x) => ({ ...x, percentOfMean: mean > 0 ? Math.round((x.informationIn / mean) * 100) : 0 }));
  return {
    bottlenecks,
    label: `Threshold: 30% of mean (mean = ${mean.toFixed(1)} inbound events/person). Disclosed: this 30% cutoff is an illustrative convention, not a validated organizational-science threshold.`,
  };
}
