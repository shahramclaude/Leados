"use client";

import { useCallback, useEffect, useState } from "react";

export type FieldType = "text" | "textarea" | "number" | "select" | "checkbox" | "date";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  defaultValue?: string | number | boolean;
  required?: boolean;
  step?: string;
  placeholder?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

export interface RowAction {
  label: string;
  method?: "POST" | "PATCH" | "DELETE";
  buildUrl: (row: Record<string, unknown>) => string;
  body?: (row: Record<string, unknown>) => Record<string, unknown>;
  confirm?: string;
  tone?: "default" | "danger" | "primary";
  showIf?: (row: Record<string, unknown>) => boolean;
}

interface EntityManagerProps {
  endpoint: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  rowActions?: RowAction[];
  emptyMessage?: string;
  addLabel?: string;
  allowDelete?: boolean;
}

function toneClasses(tone?: RowAction["tone"]) {
  if (tone === "danger") return "bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200";
  if (tone === "primary") return "bg-indigo-600 text-white hover:bg-indigo-500";
  return "bg-slate-100 text-slate-700 hover:bg-slate-200 ring-1 ring-slate-200";
}

export default function EntityManager({
  endpoint,
  fields,
  columns,
  rowActions = [],
  emptyMessage = "No records yet.",
  addLabel = "Add record",
  allowDelete = true,
}: EntityManagerProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const f of fields) {
      initial[f.name] = f.defaultValue !== undefined ? (f.defaultValue as string | boolean) : f.type === "checkbox" ? false : "";
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const resetForm: Record<string, string | boolean> = {};
      for (const f of fields) {
        resetForm[f.name] = f.defaultValue !== undefined ? (f.defaultValue as string | boolean) : f.type === "checkbox" ? false : "";
      }
      setForm(resetForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRowAction(action: RowAction, row: Record<string, unknown>) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setError(null);
    try {
      const res = await fetch(action.buildUrl(row), {
        method: action.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: action.body ? JSON.stringify(action.body(row)) : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function handleDelete(row: Record<string, unknown>) {
    if (!window.confirm("Delete this record?")) return;
    try {
      const res = await fetch(`${endpoint}?id=${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">
              {f.label}
              {f.required && <span className="text-rose-500"> *</span>}
            </span>
            {f.type === "textarea" ? (
              <textarea
                className="min-h-[72px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={String(form[f.name] ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
              />
            ) : f.type === "select" ? (
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={String(form[f.name] ?? "")}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
              >
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <input
                type="checkbox"
                className="h-4 w-4 self-start"
                checked={Boolean(form[f.name])}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.checked }))}
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                step={f.step}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={String(form[f.name] ?? "")}
                placeholder={f.placeholder}
                required={f.required}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
              />
            )}
          </label>
        ))}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="h-fit rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : addLabel}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2 text-left font-semibold text-slate-600">
                  {c.label}
                </th>
              ))}
              {(rowActions.length > 0 || allowDelete) && (
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id)} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2 align-top text-slate-700">
                      {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                    </td>
                  ))}
                  {(rowActions.length > 0 || allowDelete) && (
                    <td className="px-4 py-2 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {rowActions
                          .filter((a) => !a.showIf || a.showIf(row))
                          .map((a) => (
                            <button
                              key={a.label}
                              onClick={() => handleRowAction(a, row)}
                              className={`rounded-md px-2 py-1 text-xs font-medium ${toneClasses(a.tone)}`}
                            >
                              {a.label}
                            </button>
                          ))}
                        {allowDelete && (
                          <button
                            onClick={() => handleDelete(row)}
                            className="rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
