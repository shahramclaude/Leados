import { useState } from "react";
import { computeFindings } from "../lib/engine";
import type { AppState, Person } from "../lib/types";
import { Button, Card, SeverityBadge } from "./Shell";

function daysSince(iso: string): number {
  return Math.round((Date.now() - Date.parse(iso)) / 86400000);
}

export function RosterView({ state, onChange }: { state: AppState; onChange: (s: AppState) => void }) {
  const [newName, setNewName] = useState("");
  const findings = computeFindings(state);

  function updatePerson(id: string, patch: Partial<Person>) {
    onChange({ ...state, people: state.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function addPerson() {
    if (!newName.trim()) return;
    const id = `p${state.meta.idSeq}`;
    const person: Person = {
      id,
      name: newName.trim(),
      role: "Direct report",
      cadenceDays: 14,
      lastOneOnOne: new Date().toISOString(),
      lastFeedback: null,
      lastFeedbackSentiment: null,
    };
    onChange({ ...state, people: [...state.people, person], meta: { ...state.meta, idSeq: state.meta.idSeq + 1 } });
    setNewName("");
  }

  function removePerson(id: string) {
    onChange({ ...state, people: state.people.filter((p) => p.id !== id) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
        <p className="text-sm text-stone-500">Manage 1:1 cadence and feedback. Changes recompute findings immediately.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a direct report…"
            className="min-w-[200px] flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
          <Button variant="primary" onClick={addPerson}>Add</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {state.people.map((p) => {
          const personFindings = findings.filter((f) => f.sourceIds.includes(p.id));
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-stone-500">{p.role}</div>
                </div>
                <button onClick={() => removePerson(p.id)} className="text-xs text-stone-400 hover:text-rose-600">
                  remove
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-500">
                <div>
                  <dt className="font-medium text-stone-400">Last 1:1</dt>
                  <dd>{daysSince(p.lastOneOnOne)}d ago (cadence {p.cadenceDays}d)</dd>
                </div>
                <div>
                  <dt className="font-medium text-stone-400">Last feedback</dt>
                  <dd>{p.lastFeedback ? `${daysSince(p.lastFeedback)}d ago · ${p.lastFeedbackSentiment}` : "never"}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => updatePerson(p.id, { lastOneOnOne: new Date().toISOString() })}>Log 1:1 today</Button>
                <Button onClick={() => updatePerson(p.id, { lastFeedback: new Date().toISOString(), lastFeedbackSentiment: "positive" })}>+ Positive feedback</Button>
                <Button onClick={() => updatePerson(p.id, { lastFeedback: new Date().toISOString(), lastFeedbackSentiment: "negative" })}>+ Negative feedback</Button>
              </div>

              {personFindings.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3">
                  {personFindings.map((f) => (
                    <li key={f.key} className="flex items-center justify-between text-xs">
                      <span className="text-stone-600">{f.title}</span>
                      <SeverityBadge severity={f.severity} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
