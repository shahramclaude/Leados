import type { SpatialEncoding } from "@/types/spatial";
import { validateEncodings } from "@/lib/spatial/encodingValidator";

const DIMENSION_LABEL: Record<SpatialEncoding["dimension"], string> = {
  position3d: "Position (3D)",
  size: "Size",
  depth: "Depth (camera distance)",
  color: "Color",
  motion: "Motion",
};

export function EncodingLegend({ encodings }: { encodings: SpatialEncoding[] }) {
  const result = validateEncodings(encodings);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Encoding legend</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${result.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {result.ok ? "Validator: pass" : "Validator: FAIL"}
        </span>
      </div>
      <ul className="space-y-2">
        {encodings.map((e, i) => (
          <li key={`${e.dataField}-${i}`} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                e.decorative ? "bg-amber-100 text-amber-700" : e.fieldKind === "magnitude" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {DIMENSION_LABEL[e.dimension]}
            </span>
            <div>
              <div className="font-medium text-slate-700">
                {e.dataField} <span className="font-normal text-slate-400">({e.fieldKind}, rank {e.perceptualRanking})</span>
                {e.decorative ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">decorative — no data</span> : null}
              </div>
              {e.note ? <div className="text-slate-500">{e.note}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      {!result.ok ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">
          {result.issues.filter((i) => i.severity === "error").map((i, idx) => (
            <li key={idx}>⚠ {i.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
