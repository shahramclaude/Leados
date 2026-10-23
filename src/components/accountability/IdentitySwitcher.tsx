import { PEOPLE } from "@/lib/accountability/people";

/**
 * Zero-JS identity switcher: a plain GET form. Submitting it reloads the
 * current page with ?as=<personKey> so every page can demonstrate real,
 * server-side role-based access control (not UI-only hiding).
 */
export function IdentitySwitcher({ currentKey, extraHiddenFields }: { currentKey: string; extraHiddenFields?: Record<string, string> }) {
  const current = PEOPLE.find((p) => p.personKey === currentKey);
  return (
    <form method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      {extraHiddenFields
        ? Object.entries(extraHiddenFields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)
        : null}
      <span className="font-medium text-slate-700">Viewing as:</span>
      <select name="as" defaultValue={currentKey} className="rounded-md border border-slate-300 bg-white px-2 py-1">
        {PEOPLE.map((p) => (
          <option key={p.personKey} value={p.personKey}>
            {p.name} — {p.role} ({p.personKey})
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-white hover:bg-slate-700">
        Switch
      </button>
      {current ? <span className="text-slate-500">{current.note}</span> : null}
    </form>
  );
}
