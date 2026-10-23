// src/components/leaderState/UncertaintyNote.tsx
//
// Every leader-state surface that renders a derived insight (fatigue proxy,
// decision-window suggestion, capacity score) MUST wrap it with this
// component. A standalone check (tests/uncertaintyLint.test.ts, mirrored by
// scripts/uncertainty-lint.mjs) scans leaderState UI source files and fails
// if an insight-looking block is rendered without one of these nearby.

export type Confidence = "insufficient-data" | "low" | "moderate";

const CONFIDENCE_COPY: Record<Confidence, string> = {
  "insufficient-data": "Not enough of your own history yet — no pattern shown.",
  low: "Weak signal — based on a small sample of your own history.",
  moderate: "Moderate signal — still just a pattern in your own past records, not a measurement of you.",
};

export function UncertaintyNote({
  confidence,
  sampleSize,
  children,
}: {
  confidence: Confidence;
  sampleSize?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-leader-state-uncertainty-note="true"
      className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
    >
      <p className="m-0 font-semibold uppercase tracking-wide text-amber-700">Uncertainty</p>
      <p className="m-0 mt-1">
        {CONFIDENCE_COPY[confidence]}
        {typeof sampleSize === "number" ? ` (n = ${sampleSize})` : ""}
      </p>
      {children ? <div className="mt-1">{children}</div> : null}
      <p className="m-0 mt-1 text-amber-700">
        This is self-insight from your own records, not a performance evaluation.
      </p>
    </div>
  );
}
