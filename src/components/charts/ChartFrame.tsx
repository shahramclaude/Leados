// Part 02 chart-grammar stand-in: every chart is wrapped in the same frame
// so uncertainty and purpose are always visible next to the picture, never
// only in a tooltip.
import type { ReactNode } from "react";

export function ChartFrame({
  title,
  caption,
  uncertaintyNote,
  children,
}: {
  title: string;
  caption?: string;
  uncertaintyNote?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {caption && <p className="mt-0.5 text-xs text-slate-500">{caption}</p>}
      <div className="mt-3">{children}</div>
      {uncertaintyNote && (
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">
          <span className="font-medium text-slate-600">Uncertainty: </span>
          {uncertaintyNote}
        </p>
      )}
    </div>
  );
}
