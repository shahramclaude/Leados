"use client";

import { askLeados } from "./CommandPalette";

/**
 * Inline "ask a follow-up" affordance meant to be dropped onto any data
 * surface (a metric card, a chart, a table row). It doesn't open a separate
 * page — it opens the same Ask-LEADOS layer that sits over the whole
 * product, pre-filled with a question scoped to that surface.
 */
export default function AskFollowUpButton({ prompt, label = "Ask a follow-up" }: { prompt: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => askLeados(prompt)}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
    >
      <span aria-hidden>↗</span> {label}
    </button>
  );
}
