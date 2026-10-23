export function MethodBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
      method: {label}
    </span>
  );
}
