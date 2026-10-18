"use client";

import { useMemo, useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface OneOnOneRow {
  id: number;
  occurredAt: string;
  notes: string;
  sentiment: number;
}

interface PersonRow {
  id: number;
  name: string;
  role: string;
  team: string;
  managerId: number | null;
  lastOneOnOneAt: string | null;
  recentOneOnOnes: OneOnOneRow[];
}

export default function PeopleView() {
  const { orgNetwork, loading, refetch, toast } = useAppContext();
  const { data: people, refetch: refetchPeople, setData } = useFetchResource<PersonRow[]>("/api/people");
  const [drawerPersonId, setDrawerPersonId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [sentiment, setSentiment] = useState(0);

  const centralityById = useMemo(() => {
    const map = new Map<number, number>();
    orgNetwork.nodes.forEach((n) => map.set(n.id, n.centrality));
    return map;
  }, [orgNetwork]);

  const isolatedById = useMemo(() => {
    const map = new Map<number, boolean>();
    orgNetwork.nodes.forEach((n) => map.set(n.id, n.isolationRisk));
    return map;
  }, [orgNetwork]);

  const drawerPerson = people?.find((p) => p.id === drawerPersonId) ?? null;

  const submitPerson = async () => {
    if (name.trim() === "" || role.trim() === "" || team.trim() === "") {
      setFormError("Name, role, and team are all required.");
      return;
    }
    setFormError(null);
    const optimistic: PersonRow = {
      id: -Date.now(),
      name,
      role,
      team,
      managerId: null,
      lastOneOnOneAt: null,
      recentOneOnOnes: [],
    };
    setData((prev) => (prev ? [...prev, optimistic] : [optimistic]));
    try {
      await postJson("/api/people", { name, role, team });
      toast("Person added", 1);
      setName("");
      setRole("");
      setTeam("");
      setFormOpen(false);
      void refetchPeople();
      refetch();
    } catch (err) {
      setData((prev) => prev?.filter((p) => p.id !== optimistic.id) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to add person", 4);
    }
  };

  const submitOneOnOne = async () => {
    if (!drawerPerson || noteText.trim() === "") return;
    try {
      await postJson(`/api/people/${drawerPerson.id}/one-on-ones`, { notes: noteText, sentiment });
      toast("1:1 logged", 1);
      setNoteText("");
      setSentiment(0);
      void refetchPeople();
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to log 1:1", 4);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">People</h1>
          <p className="text-sm text-slate-500">
            {orgNetwork.isolatedCount} at isolation risk · avg span of control {orgNetwork.avgSpanOfControl}
          </p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
        >
          {formOpen ? "Cancel" : "Add person"}
        </button>
      </header>

      {formOpen && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
            <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team" className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
          </div>
          {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
          <button onClick={() => void submitPerson()} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            Save
          </button>
        </div>
      )}

      {loading && !people ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(people ?? []).map((p) => {
            const centrality = centralityById.get(p.id) ?? 0;
            const isolated = isolatedById.get(p.id) ?? false;
            return (
              <button
                key={p.id}
                onClick={() => setDrawerPersonId(p.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  isolated ? "border-amber-700/50 bg-amber-950/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-100">{p.name}</p>
                  {isolated && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">overdue 1:1</span>}
                </div>
                <p className="text-xs text-slate-500">
                  {p.role} · {p.team}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Centrality {Math.round(centrality * 100)}%</span>
                  <span>
                    {p.lastOneOnOneAt
                      ? `Last 1:1 ${Math.floor((Date.now() - new Date(p.lastOneOnOneAt).getTime()) / 86400000)}d ago`
                      : "No 1:1 logged"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {drawerPerson && (
        <div className="fixed inset-0 z-[150] flex justify-end bg-black/50" onClick={() => setDrawerPersonId(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-[#10131a] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">{drawerPerson.name}</h2>
              <button onClick={() => setDrawerPersonId(null)} className="text-slate-500 hover:text-slate-200">
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {drawerPerson.role} · {drawerPerson.team}
            </p>

            <div className="mt-5">
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Log a 1:1</h3>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Notes from this 1:1…"
                className="mt-2 h-24 w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-slate-500">Sentiment</label>
                <input type="range" min={-2} max={2} value={sentiment} onChange={(e) => setSentiment(Number(e.target.value))} className="accent-indigo-500" />
                <span className="text-xs text-slate-400">{sentiment}</span>
                <button onClick={() => void submitOneOnOne()} className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500">
                  Save 1:1
                </button>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs uppercase tracking-wide text-slate-500">Recent 1:1s</h3>
              <div className="mt-2 flex flex-col gap-2">
                {drawerPerson.recentOneOnOnes.length === 0 && <p className="text-xs text-slate-500">No 1:1s logged yet.</p>}
                {drawerPerson.recentOneOnOnes.map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
                    <p className="text-slate-500">{new Date(o.occurredAt).toLocaleDateString()} · sentiment {o.sentiment}</p>
                    <p className="mt-1">{o.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
