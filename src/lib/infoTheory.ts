// src/lib/infoTheory.ts
//
// LEADOS.infoTheory — Shannon information theory applied to the LeadOS
// event log. This is this session's own TypeScript implementation of the
// pt-L brief's pasted `LEADOS.infoTheory` module (shannonEntropy,
// mutualInformation, identifyBottlenecks, signalToNoise), adapted to the
// data model in ./types.ts and ./engine.ts.
//
// PROVENANCE: the pasted brief's JS was treated as a SPECIFICATION, not as
// code known to exist in github.com/wbweve/Leados — a direct inspection of
// that repository (GitHub REST Contents/Trees API, this session) found no
// file, export, or string match for "infoTheory", "shannonEntropy",
// "mutualInformation", "LEADOS.infoTheory" anywhere in it (88 files
// enumerated at repo root + src/, including every src/lib/*.ts file).
// See AI-SESSION-LOG.md for the full verification ledger.
//
// SCIENTIFIC BASIS (disclosed, as requested):
//  - Shannon entropy H = -Σ p(x)·log2(p(x)) is a real, standard measure of
//    the unpredictability of a categorical distribution (Shannon, 1948).
//  - Applying it to "organizational event type mix" is an ANALOGY, not a
//    validated organizational-science instrument. No peer-reviewed study
//    is cited or implied for the "too rigid / too chaotic" interpretation
//    bands shown in the UI — those bands are this delivery's own
//    illustrative heuristic, clearly labeled as such.
//  - "Mutual information" here is computed over coarse weekly bins of
//    event-type co-occurrence between two people's event streams. This is
//    NOT the rigorous channel-capacity mutual information of information
//    theory proper; it is a bounded, disclosed approximation, and the
//    code says so in its own output label (matching the original brief's
//    own disclosure).
//  - "Signal-to-noise ratio" reuses the engineering SNR formula (ratio,
//    then 10·log10 for decibels) as a labeled metaphor for
//    findings-coverage of the log, not an actual physical signal.

import type { Finding, OrgEvent, Projection } from "./types";
import { engine } from "./engine";

export interface ShannonResult {
  H: number;
  Hmax: number;
  normalized: number;
  richness: number;
  dominantType?: string;
  n: number;
  label: string;
}

export interface MutualInfoResult {
  MI: number;
  normalized: number;
  HX: number;
  HY: number;
  HXY: number;
  weeksCompared: number;
  label: string;
}

export interface Bottleneck {
  person: { id: string; name: string; role: string };
  informationIn: number;
  percentOfMean: number;
}

export interface BottleneckResult {
  bottlenecks: Bottleneck[];
  overallEntropy: ShannonResult;
  label: string;
}

export interface SignalToNoiseResult {
  signalCount: number;
  noiseCount: number;
  snr: number;
  snrDb: number;
  interpretation: string;
  label: string;
}

function typeCounts(events: OrgEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  events.forEach((e) => {
    counts[e.type] = (counts[e.type] || 0) + 1;
  });
  return counts;
}

export const infoTheory = {
  /** H = -Σ p(x)·log2(p(x)) over the event-type distribution. */
  shannonEntropy(events: OrgEvent[]): ShannonResult {
    const n = events.length;
    if (!n) {
      return { H: 0, Hmax: 0, normalized: 0, richness: 0, dominantType: undefined, n: 0, label: "No events to measure." };
    }
    const counts = typeCounts(events);
    const types = Object.keys(counts);
    let H = 0;
    for (const c of Object.values(counts)) {
      const p = c / n;
      if (p > 0) H -= p * Math.log2(p);
    }
    const Hmax = types.length > 1 ? Math.log2(types.length) : 0;
    const normalized = Hmax > 0 ? H / Hmax : 0;
    const dominantType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      H,
      Hmax,
      normalized,
      richness: types.length,
      dominantType,
      n,
      label:
        `Shannon entropy H=${H.toFixed(2)} bits of max ${Hmax.toFixed(2)}. ` +
        `Normalized: ${(normalized * 100).toFixed(0)}%. ` +
        `Based on ${n} events, ${types.length} distinct types.`,
    };
  },

  /**
   * Heuristic mutual information between two event streams, binned by week
   * and restricted to the trailing `windowDays`. Measures event-type
   * co-occurrence across weeks, NOT causal information flow — disclosed in
   * the label, matching the original brief's own caveat.
   */
  mutualInformation(streamX: OrgEvent[], streamY: OrgEvent[], today: string | Date, windowDays = 90): MutualInfoResult {
    const todayIso = engine.iso(today);
    const inWindow = (e: OrgEvent) => {
      const age = engine._days(e.ts, todayIso);
      return age >= 0 && age <= windowDays;
    };
    const X = streamX.filter(inWindow);
    const Y = streamY.filter(inWindow);

    const binByWeek = (events: OrgEvent[]) => {
      const bins: Record<string, string[]> = {};
      events.forEach((e) => {
        const week = Math.floor(engine._days(e.ts, todayIso) / 7);
        const key = String(week);
        (bins[key] = bins[key] || []).push(e.type);
      });
      return bins;
    };

    const binsX = binByWeek(X);
    const binsY = binByWeek(Y);
    const allWeeks = new Set([...Object.keys(binsX), ...Object.keys(binsY)]);

    const joint: Record<string, number> = {};
    allWeeks.forEach((week) => {
      const tx = (binsX[week] || ["none"]).sort().join(",");
      const ty = (binsY[week] || ["none"]).sort().join(",");
      const key = tx + "|" + ty;
      joint[key] = (joint[key] || 0) + 1;
    });

    const n = Math.max(1, allWeeks.size);
    const HX = this.shannonEntropy(X).H;
    const HY = this.shannonEntropy(Y).H;

    let HXY = 0;
    for (const c of Object.values(joint)) {
      const p = c / n;
      if (p > 0) HXY -= p * Math.log2(p);
    }

    const MI = Math.max(0, HX + HY - HXY);
    const denom = Math.max(HX, HY);
    const normalized = denom > 0 ? Math.min(1, MI / denom) : 0;

    return {
      MI,
      normalized,
      HX,
      HY,
      HXY,
      weeksCompared: allWeeks.size,
      label:
        `Mutual information: ${MI.toFixed(2)} bits over ${allWeeks.size} weeks (trailing ${windowDays}d). ` +
        `Normalized: ${(normalized * 100).toFixed(0)}% of max. ` +
        `Labeled: measures event-type co-occurrence between the two streams, not causal information flow.`,
    };
  },

  /**
   * Flags people whose "information in" (events that reference them,
   * directly or as a collaboration-edge target) is far below the roster
   * mean. Low information-in may mean genuine isolation, OR simply that
   * other tools (not this log) capture their activity — both are
   * disclosed, the function cannot distinguish them from this data alone.
   */
  identifyBottlenecks(P: Projection, _today: string | Date): BottleneckResult {
    const flow: Record<string, { in: number; out: number }> = {};
    const touch = (id: string) => (flow[id] = flow[id] || { in: 0, out: 0 });

    P.state.events.forEach((ev) => {
      const d = ev.data || {};
      if (d.personId) touch(d.personId).in++;
      if (ev.type === "org.network.edge") {
        if (d.fromId) touch(d.fromId).out++;
        if (d.toId) touch(d.toId).in++;
      }
    });

    const roster = [...P.directs, ...P.skips];
    const flowValues = Object.values(flow);
    const meanIn = flowValues.length ? flowValues.reduce((a, b) => a + b.in, 0) / flowValues.length : 0;

    const bottlenecks: Bottleneck[] = roster
      .filter((p) => (flow[p.id]?.in || 0) < meanIn * 0.3)
      .map((p) => ({
        person: { id: p.id, name: p.name, role: p.role },
        informationIn: flow[p.id]?.in || 0,
        percentOfMean: meanIn > 0 ? Math.round(((flow[p.id]?.in || 0) / meanIn) * 100) : 0,
      }))
      .sort((a, b) => a.percentOfMean - b.percentOfMean);

    return {
      bottlenecks,
      overallEntropy: this.shannonEntropy(P.state.events),
      label:
        "Information bottleneck analysis from event-reference frequency. " +
        "Low information-in means few events reference this person. " +
        "This could indicate genuine isolation OR simply that other tools capture their data (not in this log).",
    };
  },

  /** Signal: events referenced as a finding's source. Noise: everything else. */
  signalToNoise(P: Projection, today: string | Date): SignalToNoiseResult {
    const result = engine.run(P, today);
    const findingSourceIds = new Set<string>(result.findings.flatMap((f: Finding) => f.sources));
    const signalCount = P.state.events.filter((e) => findingSourceIds.has(e.id)).length;
    const noiseCount = P.state.events.length - signalCount;
    const snr = signalCount / Math.max(1, noiseCount);
    const snrDb = 10 * Math.log10(Math.max(snr, 1e-9));

    const interpretation =
      snr > 2
        ? "High signal ratio: most logged events produce actionable findings."
        : snr > 0.5
        ? "Balanced signal/noise: a mix of actionable and contextual events."
        : "Low signal ratio: most logged events are not producing findings. " +
          "This may indicate over-logging (fine) or miscalibrated rules (check thresholds).";

    return {
      signalCount,
      noiseCount,
      snr,
      snrDb,
      interpretation,
      label:
        `Signal: ${signalCount} events referenced by active findings. ` +
        `Noise: ${noiseCount} events not referenced. ` +
        `SNR: ${snr.toFixed(2)} (${snrDb.toFixed(1)} dB). ` +
        `Labeled: "noise" events are not wasted — they build historical context.`,
    };
  },
};

export const LEADOS = { engine, infoTheory };
