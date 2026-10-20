// src/lib/domain/severity.ts — colorblind-safe severity encoding. Every
// severity level is distinguished by SHAPE + i18n LABEL, with color as a
// third, non-load-bearing reinforcement (WCAG 1.4.1 "use of color").

export type SeverityLevel = 1 | 2 | 3 | 4 | 5;

export interface SeverityEncoding {
  level: SeverityLevel;
  labelKey: string; // resolved through the i18n catalog, e.g. "severity.3"
  shape: "circle" | "diamond" | "triangle" | "square" | "star";
  colorClass: string; // Tailwind classes — decorative only, never the sole signal
}

export const SEVERITY_ENCODINGS: Record<SeverityLevel, SeverityEncoding> = {
  1: { level: 1, labelKey: "severity.1", shape: "circle", colorClass: "bg-slate-500" },
  2: { level: 2, labelKey: "severity.2", shape: "diamond", colorClass: "bg-emerald-600" },
  3: { level: 3, labelKey: "severity.3", shape: "triangle", colorClass: "bg-amber-600" },
  4: { level: 4, labelKey: "severity.4", shape: "square", colorClass: "bg-orange-600" },
  5: { level: 5, labelKey: "severity.5", shape: "star", colorClass: "bg-red-700" },
};

export function severityEncoding(level: number): SeverityEncoding {
  const clamped = Math.min(5, Math.max(1, Math.round(level))) as SeverityLevel;
  return SEVERITY_ENCODINGS[clamped];
}
