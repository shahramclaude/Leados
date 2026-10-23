"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface CrisisClass {
  id: string;
  key: string;
  name: string;
  description: string;
  requiresDualDeclaration: boolean;
  dualDeclarationRoleKeys: string[];
  roleTemplate: string[];
}

interface Persona {
  id: string;
  name: string;
  email: string;
  roleKeys: string[];
}

export default function DeclareForm() {
  const router = useRouter();
  const [classes, setClasses] = useState<CrisisClass[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [classKey, setClassKey] = useState("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState(4);
  const [declarerIds, setDeclarerIds] = useState<string[]>([]);
  const [confirmStep, setConfirmStep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/crisis/classes")
      .then((r) => r.json())
      .then((d) => {
        setClasses(d.classes);
        setPersonas(d.personas);
        if (d.classes[0]) setClassKey(d.classes[0].key);
      });
  }, []);

  const selectedClass = classes.find((c) => c.key === classKey);

  function toggleDeclarer(id: string) {
    setDeclarerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/crisis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classKey, title, severity, declarerPersonaIds: declarerIds }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to declare crisis.");
      return;
    }
    router.push(`/crisis/${data.crisis.id}`);
  }

  if (!selectedClass) {
    return <p className="text-sm text-slate-600">Loading crisis classes…</p>;
  }

  return (
    <div className="space-y-6 rounded-2xl bg-white p-6 shadow">
      {!confirmStep ? (
        <>
          <div>
            <label className="text-sm font-medium text-slate-700">Crisis class</label>
            <select
              value={classKey}
              onChange={(e) => {
                setClassKey(e.target.value);
                setDeclarerIds([]);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
            >
              {classes.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{selectedClass.description}</p>
            <p className="mt-1 text-xs font-medium text-slate-600">
              Pre-configured command structure: {selectedClass.roleTemplate.join(", ")}
            </p>
            {selectedClass.requiresDualDeclaration && (
              <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                This class requires DUAL DECLARATION — at least two of [{selectedClass.dualDeclarationRoleKeys.join(", ")}] must
                confirm.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, factual description of what is happening"
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Severity (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="mt-1 block w-24 rounded-lg border border-slate-300 p-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Declaring persona(s)</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {personas.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                  <input type="checkbox" checked={declarerIds.includes(p.id)} onChange={() => toggleDeclarer(p.id)} />
                  <span>
                    {p.name} <span className="text-slate-400">({p.roleKeys.join(", ")})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            disabled={!title || declarerIds.length === 0}
            onClick={() => setConfirmStep(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-40"
          >
            Review declaration
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <p className="font-semibold text-red-900">Confirm crisis declaration</p>
            <p className="mt-1 text-sm text-red-800">
              Class: <strong>{selectedClass.name}</strong> · Severity {severity}
            </p>
            <p className="mt-1 text-sm text-red-800">Title: {title}</p>
            <p className="mt-1 text-sm text-red-800">
              Declarers: {personas.filter((p) => declarerIds.includes(p.id)).map((p) => p.name).join(", ")}
            </p>
            {selectedClass.requiresDualDeclaration && (
              <p className="mt-2 text-xs font-medium text-red-700">
                Dual declaration required and {declarerIds.length >= 2 ? "satisfied." : "NOT YET satisfied — add another declarer."}
              </p>
            )}
          </div>
          {error && <p className="rounded-md bg-red-100 p-2 text-sm text-red-800">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setConfirmStep(false)} className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-800 shadow">
              Back
            </button>
            <button
              disabled={submitting}
              onClick={submit}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Declaring…" : "Confirm & Declare Crisis"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
