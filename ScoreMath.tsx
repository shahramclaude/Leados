import type { ScoreMathFinding } from "./types";

/** Not a chart — a structured text block. No ChartFrame wrapper (brief
 * calls this a text block that lives in a context panel, not a chart with
 * a caption toggle). */
export function ScoreMath({ f }: { f: ScoreMathFinding }) {
  const base = f.severity * f.confidenceFactor;
  const smartMult = f.smartFactors.reduce((a, s) => a * s.mult, 1);
  const smart = base * smartMult;
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4">
      <span style={{ color: "var(--ink-2)" }}>{label}</span>
      <span style={{ color: "var(--ink-1)" }}>{value}</span>
    </div>
  );

  return (
    <div
      className="rounded border font-mono-ui"
      style={{ borderColor: "var(--line)", fontSize: "var(--text-xs)", background: "var(--surface-1)" }}
    >
      <div className="border-b px-3 py-2 font-semibold" style={{ borderColor: "var(--line)" }}>
        SCORE COMPUTATION
      </div>
      <div className="space-y-1 px-3 py-2">
        {row("severity:", `${f.severity}`)}
        {row("confidence:", `${f.confidence} → factor ${f.confidenceFactor.toFixed(2)}`)}
        {row("base score:", `${f.severity} × ${f.confidenceFactor.toFixed(2)} = ${base.toFixed(2)}`)}
        {row(
          "smart adj:",
          f.smartFactors.map((s) => `× ${s.mult.toFixed(2)} (${s.label})`).join(" ")
        )}
        {row("smart score:", `${base.toFixed(2)} × ${smartMult.toFixed(2)} = ${smart.toFixed(2)}`)}
        {row("effective rank:", `#${f.rank} of ${f.totalActive} active findings`)}
      </div>
      <div className="border-t px-3 py-2 space-y-1" style={{ borderColor: "var(--line)" }}>
        {row("rule:", `${f.rule} · domain: ${f.domain.toUpperCase()}`)}
        {row("key:", f.key)}
        {row("source:", `${f.source} · event#${f.eventId} · ${f.date}`)}
      </div>
    </div>
  );
}
