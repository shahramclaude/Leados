export function PanelSkeleton({ height = 240, label }: { height?: number; label: string }) {
  return (
    <div
      className="flex animate-pulse items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400"
      style={{ height }}
    >
      loading {label}…
    </div>
  );
}
