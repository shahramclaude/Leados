import type { Series } from "./types";

/** Generic accessible table rendering for a set of series — the fallback
 * body used by ChartFrame's "view as table" toggle. */
export function SeriesTable({ series, caption }: { series: Series[]; caption: string }) {
  const xValues = series[0]?.points.map((p) => p.x) ?? [];
  return (
    <table className="w-full border-collapse text-[var(--text-xs)]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="border-b border-[var(--border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-left text-[var(--text-muted)]">
            Period
          </th>
          {series.map((s) => (
            <th key={s.id} scope="col" className="border-b border-[var(--border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-right text-[var(--text-muted)]">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {xValues.map((x, i) => (
          <tr key={x}>
            <td className="border-b border-[var(--border-subtle)] px-[var(--space-2)] py-[var(--space-1)]">{x}</td>
            {series.map((s) => {
              const point = s.points[i];
              return (
                <td key={s.id} className="font-mono-nums border-b border-[var(--border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-right">
                  {point ? point.y.toLocaleString() : "—"}
                  {point?.low !== undefined && point?.high !== undefined ? (
                    <span className="ml-1 text-[var(--text-muted)]">
                      ({point.low.toLocaleString()}–{point.high.toLocaleString()})
                    </span>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
