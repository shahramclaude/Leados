import { ChartFrame } from "./ChartFrame";
import type { CohortRow, VizMeta } from "./types";

type MetricKey = "m1" | "m3" | "m6" | "m12";
const cols: { key: MetricKey; label: string }[] = [
  { key: "m1", label: "M1" },
  { key: "m3", label: "M3" },
  { key: "m6", label: "M6" },
  { key: "m12", label: "M12" },
];

function heatColor(v: number | null) {
  if (v === null) return "transparent";
  const t = Math.max(0, Math.min(1, v / 100));
  // interpolate sev-5 (0%) -> domain-finance (100%)
  const from = [178, 58, 58]; // sev-5
  const to = [47, 122, 79]; // domain-finance
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * t));
  return `rgb(${rgb.join(",")})`;
}

/** Rendered as a CSS grid of cells rather than Canvas — this dataset
 * (cohorts x 4 columns) is well under the >100-point canvas threshold the
 * brief sets, so plain DOM gives crisper text at zero perf cost. Disclosed
 * deviation from the brief's blanket "cohort grids -> canvas" example. */
export function CohortGrid({ rows, meta }: { rows: CohortRow[]; meta: VizMeta }) {
  const means = cols.map((c) => {
    const vals = rows.map((r) => r[c.key]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>cohort</th>
          {cols.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cohort}>
            <td>{r.cohort}</td>
            {cols.map((c) => (
              <td key={c.key}>{r[c.key] === null ? "—" : `${r[c.key]}%`}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={rows.length * 36 + 90}>
      {({ titleId, descId }) => (
        <div role="img" aria-labelledby={`${titleId} ${descId}`}>
          <span id={titleId} className="sr-only">
            Cohort retention grid
          </span>
          <span id={descId} className="sr-only">
            Retention tracked for {rows.length} cohorts across M1, M3, M6 and M12.
          </span>
          <div
            className="grid font-mono-ui"
            style={{
              gridTemplateColumns: `100px repeat(${cols.length}, 80px)`,
              fontSize: "var(--text-xs)",
            }}
          >
            <div className="p-1 font-semibold" style={{ color: "var(--ink-2)" }}>
              COHORT
            </div>
            {cols.map((c) => (
              <div key={c.key} className="p-1 text-center font-semibold" style={{ color: "var(--ink-2)" }}>
                {c.label}
              </div>
            ))}
            {rows.map((r) => (
              <>
                <div key={r.cohort + "l"} className="p-1 flex items-center" style={{ color: "var(--ink-1)" }}>
                  {r.cohort}
                </div>
                {cols.map((c) => {
                  const v = r[c.key];
                  return (
                    <div
                      key={r.cohort + c.key}
                      className="flex items-center justify-center"
                      style={{
                        height: 36,
                        background: heatColor(v),
                        opacity: v === null ? 1 : 0.85,
                        color: v === null ? "var(--ink-3)" : "white",
                        border: "1px solid var(--surface-2)",
                      }}
                    >
                      {v === null ? "─ ─ ─" : `${v.toFixed(1)}%`}
                    </div>
                  );
                })}
              </>
            ))}
            <div className="p-1 flex items-center font-semibold" style={{ color: "var(--ink-2)" }}>
              trend
            </div>
            {means.map((m, i) => (
              <div key={i} className="p-1 text-center" style={{ color: "var(--ink-2)" }}>
                {m === null ? "—" : `${m.toFixed(1)}%`}
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}
