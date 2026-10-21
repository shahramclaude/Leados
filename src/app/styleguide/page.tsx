const swatches = [
  { name: "slate-900", className: "bg-slate-900" },
  { name: "slate-500", className: "bg-slate-500" },
  { name: "emerald-600", className: "bg-emerald-600" },
  { name: "rose-600", className: "bg-rose-600" },
  { name: "amber-500", className: "bg-amber-500" },
];

export default function StyleguidePage() {
  return (
    <main data-testid="styleguide" className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Styleguide</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Design tokens and components used across LEADOS, captured for visual regression (light/dark × desktop/mobile).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Colors</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {swatches.map((s) => (
            <div key={s.name} className="text-center text-xs text-slate-600 dark:text-slate-400">
              <div className={`h-16 w-16 rounded-xl ${s.className}`} />
              <p className="mt-1">{s.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Buttons</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">Primary</button>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Secondary</button>
          <button disabled className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-white opacity-50 dark:bg-slate-700">Disabled</button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Form controls</h2>
        <div className="mt-3 max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <input placeholder="Text input" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option>Option A</option>
            <option>Option B</option>
          </select>
          <textarea placeholder="Textarea" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Status badges</h2>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">hot</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">cold</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">approved</span>
        </div>
      </section>
    </main>
  );
}
