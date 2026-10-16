import { ChartFrame } from "./ChartFrame";
import type { GanttItem, VizMeta } from "./types";

const stateGlyph: Record<GanttItem["state"], string> = {
  planned: "░",
  atRisk: "▒",
  done: "█",
  blocked: "▓",
};

const trendGlyph: Record<GanttItem["trend"], string> = {
  up: "↗",
  down: "↘",
  flat: "─",
  blocked: "▲",
};

const COLS = 60;

/** A purely typographic Gantt — monospace block, no SVG needed. */
export function GanttText({
  items,
  columns,
  today,
  meta,
}: {
  items: GanttItem[];
  columns: string[];
  today: number;
  meta: VizMeta;
}) {
  const labelWidth = 28;
  const todayCol = Math.round(today * COLS);

  function bar(item: GanttItem) {
    const startCol = Math.round(item.startFrac * COLS);
    const endCol = Math.round(item.endFrac * COLS);
    const chars: string[] = [];
    for (let i = 0; i < COLS; i++) {
      if (i === todayCol) {
        chars.push("│");
      } else if (i >= startCol && i < endCol) {
        chars.push(item.state === "done" ? "█" : stateGlyph[item.state]);
      } else {
        chars.push(" ");
      }
    }
    return chars.join("");
  }

  const colHeader = columns
    .map((c) => c.padEnd(Math.floor(COLS / columns.length)))
    .join("")
    .slice(0, COLS);

  const text = [
    `${"INITIATIVE / MILESTONE".padEnd(labelWidth)}${colHeader}`,
    "─".repeat(labelWidth + COLS + 4),
    ...items.map(
      (it) =>
        `${it.label.slice(0, labelWidth - 1).padEnd(labelWidth)}[${bar(it)}] ${trendGlyph[it.trend]}`
    ),
    "",
    "Legend: █ done  ▒ at-risk  ▓ blocked  ░ planned  │ today",
  ].join("\n");

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>initiative</th>
          <th>state</th>
          <th>trend</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.label}>
            <td>{it.label}</td>
            <td>{it.state}</td>
            <td>{it.trend}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={items.length * 18 + 60}>
      {({ titleId, descId }) => (
        <figure role="img" aria-labelledby={`${titleId} ${descId}`} className="m-0 overflow-x-auto">
          <figcaption id={titleId} className="sr-only">
            Roadmap Gantt chart, {items.length} initiatives
          </figcaption>
          <p id={descId} className="sr-only">
            {items.filter((i) => i.state === "blocked").length} initiative(s) blocked,{" "}
            {items.filter((i) => i.state === "atRisk").length} at risk.
          </p>
          <pre
            className="font-mono-ui whitespace-pre"
            style={{ fontSize: "var(--text-xs)", color: "var(--ink-1)", lineHeight: 1.6 }}
          >
            {text}
          </pre>
        </figure>
      )}
    </ChartFrame>
  );
}
