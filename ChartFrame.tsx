import { useId, useState, type ReactNode } from "react";
import { useInView } from "./useInView";
import type { VizMeta } from "./types";

interface ChartFrameProps {
  meta: VizMeta;
  /** renders the chart; receives the titleId/descId to wire into the SVG */
  children: (ids: { titleId: string; descId: string }) => ReactNode;
  /** accessible data-table fallback, always in the DOM */
  table: ReactNode;
  minHeight?: number;
  className?: string;
}

const confDot: Record<string, string> = {
  high: "var(--sev-1)",
  medium: "var(--sev-3)",
  low: "var(--sev-5)",
};

/**
 * Shared chrome every LEADOS.viz visualization goes through:
 *  - lazy mount via IntersectionObserver
 *  - title/desc/role=img/aria-labelledby wiring
 *  - non-optional [source] · [confidence] · [label] caption
 *  - "Show as table" toggle, with the table always present for AT
 */
export function ChartFrame({
  meta,
  children,
  table,
  minHeight = 120,
  className,
}: ChartFrameProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const [showTable, setShowTable] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div className={className}>
      <div ref={ref} style={{ minHeight: inView ? undefined : minHeight }}>
        {inView ? (
          <div aria-hidden={showTable ? "true" : undefined}>
            {children({ titleId, descId })}
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-[10px] font-mono-ui"
            style={{ height: minHeight, color: "var(--ink-3)" }}
          >
            loading when in view…
          </div>
        )}
        <div
          className={showTable ? "" : "viz-sr-table"}
          data-visible={showTable}
        >
          {table}
        </div>
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <p
          className="font-mono-ui leading-snug"
          style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}
        >
          <span
            className="mr-1 inline-block h-[6px] w-[6px] rounded-full align-middle"
            style={{ background: confDot[meta.confidence] }}
            title={`confidence: ${meta.confidence}`}
          />
          {meta.source} · {meta.confidence} · {meta.label}
          {meta.caveat ? (
            <span style={{ color: "var(--sev-4)" }}> · {meta.caveat}</span>
          ) : null}
        </p>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 rounded border font-mono-ui"
          style={{
            fontSize: "var(--text-2xs)",
            padding: "2px 6px",
            borderColor: "var(--line)",
            color: "var(--ink-2)",
            background: "var(--surface-1)",
          }}
        >
          {showTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
    </div>
  );
}

export function vizTitleDesc(svgTitle: string, svgDesc: string, ids: { titleId: string; descId: string }) {
  return (
    <>
      <title id={ids.titleId}>{svgTitle}</title>
      <desc id={ids.descId}>{svgDesc}</desc>
    </>
  );
}
