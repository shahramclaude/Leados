import { useState } from "react";
import type { SlideDeck } from "../../lib/slideGenerator";

/** Slide deck preview: one-message-per-slide, footnotes clickable (traceable
 * to source), speaker notes visible — mirrors what the exported .pptx
 * contains so the studio is never showing something different from what
 * gets downloaded. */
export function SlideDeckViewer({ deck, onFootnoteClick }: { deck: SlideDeck; onFootnoteClick: (factId: number) => void }) {
  const [index, setIndex] = useState(0);
  const slide = deck.slides[index];

  return (
    <div className="space-y-2">
      <div className={`rounded-xl p-4 ${slide.kind === "title" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}>
        <p className="text-[10px] uppercase tracking-wide opacity-60">Slide {index + 1} of {deck.slides.length} · {slide.kind}</p>
        <h3 className={`mt-1 text-base font-bold ${slide.kind === "title" ? "text-white" : "text-slate-900"}`}>{slide.title}</h3>
        <p className={`mt-1 text-sm font-medium ${slide.kind === "title" ? "text-indigo-200" : "text-indigo-700"}`}>{slide.oneMessage}</p>
        {slide.bullets.length > 0 && (
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {slide.bullets.map((b, i) => (
              <li key={i} className={slide.kind === "title" ? "text-slate-200" : "text-slate-600"}>{b}</li>
            ))}
          </ul>
        )}
        {slide.footnotes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
            {slide.footnotes.map((f) => (
              <button key={f.factId} onClick={() => onFootnoteClick(f.factId)} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100">
                {f.marker} {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <details className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Speaker notes</summary>
        <p className="mt-1">{slide.speakerNotes}</p>
      </details>
      <div className="flex items-center justify-between text-xs">
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">← Prev</button>
        <button onClick={() => setIndex((i) => Math.min(deck.slides.length - 1, i + 1))} disabled={index === deck.slides.length - 1} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}
