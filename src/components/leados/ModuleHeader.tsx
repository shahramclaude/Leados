export default function ModuleHeader({
  part,
  title,
  description,
  produces,
}: {
  part: string;
  title: string;
  description: string;
  produces?: string;
}) {
  return (
    <div className="mb-8 max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Part {part}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      {produces && (
        <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
          Produces: {produces}
        </p>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
