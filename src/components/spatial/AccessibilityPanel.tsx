import { usePrefersReducedMotion, useGpuProfile } from "@/lib/spatial/accessibilityHooks";

export function AccessibilityPanel() {
  const reducedMotion = usePrefersReducedMotion();
  const gpu = useGpuProfile();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
      <span className="font-semibold text-slate-700">Environment:</span>
      <span>Reduced motion: {reducedMotion ? "ON (camera cuts, no animated flythroughs)" : "off"}</span>
      <span aria-hidden="true">·</span>
      <span>GPU profile: {gpu.reason}</span>
      <span aria-hidden="true">·</span>
      <span>Every scene below has a 2D chart, data table, and text description — use the tabs to switch.</span>
    </div>
  );
}
