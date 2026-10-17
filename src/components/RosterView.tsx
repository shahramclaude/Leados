import { useState } from 'react';
import { AppState } from '../lib/types';
import { Card, Button, Label, inputCls, SectionHeading } from './ui';

export function RosterView({ state, onAdd }: { state: AppState; onAdd: (name: string, role: string, reportsTo: string | null) => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [reportsTo, setReportsTo] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), role.trim() || 'Team member', reportsTo || null);
    setName('');
    setRole('');
    setReportsTo('');
  }

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Prerequisite for every rule" title="Roster" desc="LeadOS cannot evaluate cadence, decisions, or crisis rules for people it doesn't know about." />
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Add a person</h3>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label>Name</Label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <Label>Role</Label>
            <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Senior Engineer" />
          </div>
          <div>
            <Label>Reports to (optional)</Label>
            <select className={inputCls} value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
              <option value="">— none —</option>
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">Add person</Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.people.map((p) => (
          <Card key={p.id}>
            <p className="text-sm font-semibold text-slate-900">{p.name}</p>
            <p className="text-xs text-slate-500">{p.role}</p>
            {p.reportsTo && (
              <p className="mt-1 text-xs text-slate-400">Reports to: {state.people.find((x) => x.id === p.reportsTo)?.name ?? 'unknown'}</p>
            )}
          </Card>
        ))}
        {state.people.length === 0 && <Card className="text-sm text-slate-500">No one on the roster yet.</Card>}
      </div>
    </div>
  );
}
