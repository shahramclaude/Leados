import { useMemo } from "react";
import { chromaticAdaptation, generateLivingStylesheet, optimizeDensity, PHI, spacingScale } from "../lib/aesthetics";
import type { DensityMode } from "../lib/aesthetics";

export function AestheticsView({ densityMode }: { densityMode: DensityMode }) {
  const scale = useMemo(() => spacingScale(), []);
  const density = useMemo(() => optimizeDensity(densityMode), [densityMode]);
  const chroma = useMemo(() => chromaticAdaptation(), []);
  const css = useMemo(() => generateLivingStylesheet(densityMode), [densityMode]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Aesthetics</h1>
        <p className="text-sm text-slate-500">
          Live output of this build's aesthetics module. Recomputes on load and when density mode
          changes (not on every render) &mdash; a deliberate, disclosed simplification.
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-2">Golden-ratio spacing scale (&phi; = {PHI})</h2>
        <div className="grid grid-cols-5 gap-2 text-xs text-slate-400">
          {scale.map((t) => (
            <div key={t.name} className="rounded-md bg-slate-950/60 border border-slate-800 p-2 text-center">
              <div className="text-slate-200 font-mono">{t.name}</div>
              <div>{t.px}px</div>
              <div
                className="mx-auto mt-1 bg-indigo-500 rounded-sm"
                style={{ width: Math.min(40, t.px), height: 4 }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 grid sm:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Density: {density.mode}</h2>
          <ul className="text-sm text-slate-400 space-y-1">
            <li>target visible cards: <span className="text-slate-200">{density.targetVisible}</span></li>
            <li>
              Miller range: <span className="text-slate-200">[{density.millerRange.min}, {density.millerRange.max}]</span>{" "}
              <span className="text-[11px] text-emerald-400">(min &le; max, inversion bug fixed)</span>
            </li>
            <li>bits/px proxy (fabricated): <span className="text-slate-200">{density.bitsPerPixel}</span></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Chromatic adaptation (time-of-day)</h2>
          <ul className="text-sm text-slate-400 space-y-1">
            <li>local hour: <span className="text-slate-200">{chroma.hour}</span></li>
            <li>approx. kelvin: <span className="text-slate-200">{chroma.kelvinApprox}K</span></li>
            <li>filter: <code className="text-indigo-300">{chroma.filterCss}</code></li>
          </ul>
          <div
            className="mt-3 h-10 rounded-md bg-gradient-to-r from-amber-200 via-white to-sky-200"
            style={{ filter: chroma.filterCss }}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-2">Generated stylesheet</h2>
        <pre className="text-xs text-slate-400 bg-slate-950/70 rounded-md p-3 overflow-x-auto">{css}</pre>
      </section>
    </div>
  );
}
