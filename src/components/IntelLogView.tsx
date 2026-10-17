import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { appendEvent } from "../lib/store";
import { EVENT_GROUPS, EVENT_TYPES, getEventType, type FieldDef } from "../lib/eventSchema";
import { Card, SectionTitle, Label, Button, Badge } from "./ui";
import { cn } from "../utils/cn";

export function IntelLogView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [selectedType, setSelectedType] = useState(EVENT_TYPES[0].type);
  const [form, setForm] = useState<Record<string, any>>({});
  const [justSaved, setJustSaved] = useState(false);

  const def = getEventType(selectedType)!;

  function selectType(type: string) {
    setSelectedType(type);
    setForm({});
    setJustSaved(false);
  }

  function setField(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    const data: Record<string, any> = {};
    def.fields.forEach((f) => {
      let v = form[f.key];
      if (f.type === "tags" && typeof v === "string") {
        v = v.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (f.type === "number" && v !== undefined && v !== "") v = Number(v);
      if (f.type === "scale5" && v !== undefined && v !== "") v = Number(v);
      if (v !== undefined && v !== "") data[f.key] = v;
    });
    const next = appendEvent(state, def.type, data);
    setState(next);
    setForm({});
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  const grouped = useMemo(() => {
    const m: Record<string, typeof EVENT_TYPES> = {};
    EVENT_GROUPS.forEach((g) => (m[g] = []));
    EVENT_TYPES.forEach((e) => m[e.group]?.push(e));
    return m;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Log intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Manually append a new event to your own event log. This is the only way data enters this app — there are no
          external feeds, scrapers, or market-data connectors.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <div className="space-y-4">
            {EVENT_GROUPS.map((g) =>
              grouped[g]?.length ? (
                <div key={g}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g}</div>
                  <div className="space-y-0.5">
                    {grouped[g].map((e) => (
                      <button
                        key={e.type}
                        onClick={() => selectType(e.type)}
                        className={cn(
                          "block w-full rounded-md px-2 py-1.5 text-left text-sm transition",
                          selectedType === e.type ? "bg-violet-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        )}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle sub={def.description}>
            {def.label} <span className="ml-2 font-mono text-xs text-zinc-500">{def.type}</span>
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {def.fields.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                <FieldInput field={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={submit}>Log event</Button>
            {justSaved && <Badge tone="emerald">Saved to event log</Badge>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void }) {
  const baseClass = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600";
  if (field.type === "textarea") {
    return (
      <div>
        <Label>{field.label}</Label>
        <textarea rows={3} className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        <Label>{field.label}</Label>
        <select className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— choose —</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          id={field.key}
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
        />
        <label htmlFor={field.key} className="text-sm text-zinc-300">
          {field.label}
        </label>
      </div>
    );
  }
  if (field.type === "scale5") {
    return (
      <div>
        <Label>{field.label}</Label>
        <select className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div>
        <Label>{field.label}</Label>
        <input type="number" className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
      </div>
    );
  }
  if (field.type === "tags") {
    return (
      <div>
        <Label>{field.label}</Label>
        <input className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || "comma-separated"} />
      </div>
    );
  }
  return (
    <div>
      <Label>{field.label}</Label>
      <input className={baseClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
    </div>
  );
}
