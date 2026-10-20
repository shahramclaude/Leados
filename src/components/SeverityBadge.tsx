"use client";

import { severityEncoding } from "@/lib/domain/severity";
import { useT } from "@/components/providers/LocaleProvider";

const SHAPE_PATH: Record<string, string> = {
  circle: "M8 2a6 6 0 100 12A6 6 0 008 2z",
  diamond: "M8 1l7 7-7 7-7-7 7-7z",
  triangle: "M8 1l7 13H1L8 1z",
  square: "M2 2h12v12H2z",
  star: "M8 0l2.1 5.2 5.9.4-4.6 3.8 1.6 5.6L8 11.9 2.9 15l1.6-5.6L0 5.6l5.9-.4L8 0z",
};

/**
 * Colorblind-safe severity indicator: shape + text label carry the meaning;
 * color is additive reinforcement only (never the sole signal — WCAG 1.4.1).
 */
export function SeverityBadge({ severity }: { severity: number }) {
  const t = useT();
  const encoding = severityEncoding(severity);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
        className={`shrink-0 rounded-sm text-white ${encoding.colorClass}`}
        style={{ fill: "currentColor" }}
      >
        <path d={SHAPE_PATH[encoding.shape]} />
      </svg>
      <span>{t(encoding.labelKey)}</span>
      <span className="sr-only"> ({encoding.level}/5)</span>
    </span>
  );
}
