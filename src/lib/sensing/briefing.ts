// Morning brief generator + zero-filler lint.
//
// The generator ONLY emits lines built from real deltas passed in; there is
// no boilerplate "things are looking great" filler. The lint then re-checks
// that discipline mechanically: every content line must (a) contain at least
// one digit (a real id, z-score, probability, threshold, or count) and
// (b) not contain a known filler phrase. A brief that fails lint is still
// saved (status flagged) but is marked lintPassed=false so nothing ships
// silently.

export const FILLER_PHRASES = [
  "fast-paced",
  "moving forward",
  "end of the day",
  "circle back",
  "synergy",
  "going forward",
  "today's environment",
  "it is important to note",
  "stay tuned",
  "exciting times",
  "game changer",
  "think outside the box",
];

export interface OvernightAlertDelta {
  alertId: number;
  seriesName: string;
  method: string;
  observed: number;
  expectedLow: number;
  expectedHigh: number;
  deviation: number;
  falsePositiveEstimate: number;
  severity: string;
}

export interface ForecastUpdateDelta {
  questionId: number;
  question: string;
  kind: "resolved" | "new_forecast" | "crowd_shift";
  detail: string; // pre-formatted, must include numbers
}

export interface RiskProximityDelta {
  riskId: number;
  riskTitle: string;
  indicatorId: number;
  currentValue: number;
  thresholdValue: number;
  proximity: number; // 0..1
  direction: "above" | "below";
}

export interface WeakSignalDelta {
  themeLabel: string;
  status: "signal" | "trend";
  velocity: number;
  evidenceCount: number;
}

export interface BriefInputs {
  asOf: Date;
  monitoredSeriesCount: number;
  overnightAlerts: OvernightAlertDelta[];
  forecastUpdates: ForecastUpdateDelta[];
  riskProximities: RiskProximityDelta[];
  weakSignals: WeakSignalDelta[];
}

export interface GeneratedBrief {
  content: string;
  citationsCount: number;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "n/a";
}

export function generateBrief(inputs: BriefInputs): GeneratedBrief {
  const lines: string[] = [];
  let citations = 0;

  lines.push(`# Morning Brief — ${inputs.asOf.toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`## Overnight anomalies (${inputs.monitoredSeriesCount} series monitored)`);
  if (inputs.overnightAlerts.length === 0) {
    lines.push(`- No alerts fired across the ${inputs.monitoredSeriesCount} monitored series in the last cycle.`);
  } else {
    for (const a of inputs.overnightAlerts) {
      lines.push(
        `- Alert #${a.alertId} on "${a.seriesName}": observed ${fmt(a.observed)} vs expected band [${fmt(a.expectedLow)}, ${fmt(a.expectedHigh)}], deviation ${fmt(a.deviation)}σ via ${a.method} (severity ${a.severity}, est. false-positive rate ${(a.falsePositiveEstimate * 100).toFixed(1)}%).`,
      );
      citations++;
    }
  }

  lines.push("");
  lines.push(`## Forecast updates (${inputs.forecastUpdates.length})`);
  if (inputs.forecastUpdates.length === 0) {
    lines.push("- No forecast questions resolved or re-forecast in the last cycle (0 updates).");
  } else {
    for (const f of inputs.forecastUpdates) {
      lines.push(`- Q#${f.questionId} "${f.question}": ${f.detail}`);
      citations++;
    }
  }

  lines.push("");
  lines.push(`## Risks nearing threshold (${inputs.riskProximities.length})`);
  if (inputs.riskProximities.length === 0) {
    lines.push("- No leading indicators moved into the top 20% proximity band toward their threshold (0 of tracked indicators).");
  } else {
    for (const r of inputs.riskProximities) {
      lines.push(
        `- Risk #${r.riskId} "${r.riskTitle}": indicator #${r.indicatorId} at ${fmt(r.currentValue)} (threshold ${r.direction} ${fmt(r.thresholdValue)}), proximity ${(r.proximity * 100).toFixed(0)}%.`,
      );
      citations++;
    }
  }

  lines.push("");
  lines.push(`## Weak signals (${inputs.weakSignals.length})`);
  if (inputs.weakSignals.length === 0) {
    lines.push("- No theme crossed the 1.5x burst velocity threshold in the last 3 days (0 active themes).");
  } else {
    for (const s of inputs.weakSignals) {
      lines.push(
        `- "${s.themeLabel}" labeled ${s.status}: velocity ${s.velocity.toFixed(2)}x baseline, ${s.evidenceCount} evidence items.`,
      );
      citations++;
    }
  }

  return { content: lines.join("\n"), citationsCount: citations };
}

export interface LintResult {
  passed: boolean;
  errors: string[];
}

export function lintBrief(content: string): LintResult {
  const errors: string[] = [];
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-")); // only content bullet lines are checked; headings are structural

  const lower = content.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    if (lower.includes(phrase)) {
      errors.push(`Filler phrase detected: "${phrase}"`);
    }
  }

  for (const line of lines) {
    if (!/\d/.test(line)) {
      errors.push(`Line has no referenced number/metric/id: "${line}"`);
    }
  }

  return { passed: errors.length === 0, errors };
}
