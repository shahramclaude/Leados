import { useState } from "react";
import type { LeadosEvent } from "../lib/types";
import * as store from "../lib/store";
import { Card, SectionTitle, Badge } from "./ui";

const QUICK_TYPES = [
  { type: "signal.raised", example: { domain: "ops", severity: 3, title: "New ops signal" } },
  { type: "culture.signal", example: { polarity: "positive", note: "Logged from Data view" } },
  { type: "commitment.made", example: { id: "c-new", ownerId: "p-ceo", desc: "New commitment", by_date: new Date().toISOString() } },
  { type: "conflict.resolved", example: { id: "cf-new", note: "Resolved from Data view" } },
];

export function DataView({ events, onChange }: { events: LeadosEvent[]; onChange: () => void }) {
  const [typeIdx, setTypeIdx] = useState(0);
  const [json, setJson] = useState(JSON.stringify(QUICK_TYPES[0].example, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function handleTypeChange(idx: number) {
    setTypeIdx(idx);
    setJson(JSON.stringify(QUICK_TYPES[idx].example, null, 2));
    setError(null);
  }

  function submit() {
    try {
      const data = JSON.parse(json);
      store.append(QUICK_TYPES[typeIdx].type, data);
      setError(null);
      onChange();
    } catch (e: any) {
      setError("Invalid JSON: " + e.message);
    }
  }

  function doReset() {
    if (!confirm("Reset the event log? This clears localStorage and reseeds.")) return;
    store.reset();
    onChange();
  }

  const shown = events
    .filter((e) => !filter || e.type.includes(filter) || JSON.stringify(e.data).includes(filter))
    .slice()
    .reverse();

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle
          eyebrow="Append-only log"
          title="Event store"
          desc={`${events.length} events · key "${store.STORAGE_KEY}" · schema v${store.SCHEMA_VERSION}. Nothing derived is ever persisted — every view recomputes from this list on every render.`}
        />
        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto]">
            <select value={typeIdx} onChange={(e) => handleTypeChange(Number(e.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {QUICK_TYPES.map((t, i) => (
                <option key={t.type} value={i}>
                  {t.type}
                </option>
              ))}
            </select>
            <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={3} className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
            <button onClick={submit} className="h-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Append
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">Appended events stamp real "now" — they are never backdated (only the one-time seed path may do that, and it marks every event meta.seeded:true).</p>
            <button onClick={doReset} className="text-xs font-medium text-rose-600 hover:underline">
              Reset &amp; reseed
            </button>
          </div>
        </Card>
      </div>

      <div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by type or content…"
          className="mb-3 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">ts</th>
                <th className="px-3 py-2">type</th>
                <th className="px-3 py-2">data</th>
                <th className="px-3 py-2">meta</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{e.ts.slice(0, 16).replace("T", " ")}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-slate-800">{e.type}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{JSON.stringify(e.data)}</td>
                  <td className="px-3 py-2">{e.meta?.seeded ? <Badge color="indigo">seeded</Badge> : <Badge color="slate">live</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
