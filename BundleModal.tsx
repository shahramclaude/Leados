import { useState } from "react";
import type { Template } from "../automation/templates";
import type { Person } from "../automation/types";
import { Button } from "./shared";

export function BundleModal({
  template,
  people,
  defaultValues,
  onClose,
  onSubmit,
}: {
  template: Template;
  people: Person[];
  defaultValues?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues ?? {});
  const [error, setError] = useState<string | null>(null);

  const setField = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));

  const submit = () => {
    const err = template.validate ? template.validate(values) : null;
    if (err) {
      setError(err);
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{template.label}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{template.description}</p>

        <div className="space-y-3">
          {template.fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {f.label} {!f.optional && <span className="text-rose-500">*</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  rows={3}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                />
              ) : f.type === "person" ? (
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                >
                  <option value="">Select…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.archived}>
                      {p.name} {p.archived ? "(archived)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Submit bundle</Button>
        </div>
      </div>
    </div>
  );
}
