"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useActor, actorFetch } from "@/lib/actorContext";

interface RosterPerson {
  id: string;
  name: string;
  title: string;
}

interface MobilityRow {
  personId: string;
  name: string;
  bestTargetRole: string | null;
  bestCoverage: number;
}

/**
 * "High potential" here means something narrow and evidence-linked: the
 * person's demonstrated (declared+observed) skills already cover ≥60% of a
 * DIFFERENT role's declared requirements. It is NOT a rating of attitude,
 * leadership "presence", ambition, or any trait LEADOS has no evidence for.
 * See docs/FAIRNESS.md "What this view deliberately does not claim".
 */
export function HighPotentialView() {
  const { currentActorId } = useActor();
  const [rows, setRows] = useState<MobilityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentActorId) return;
    let cancelled = false;
    setRows(null);
    setError(null);

    (async () => {
      try {
        const rosterRes = await actorFetch(currentActorId, "/api/people");
        if (!rosterRes.ok) throw new Error((await rosterRes.json()).error ?? "Failed to load roster");
        const roster: { people: RosterPerson[] } = await rosterRes.json();

        const results: MobilityRow[] = [];
        for (const p of roster.people) {
          const res = await actorFetch(currentActorId, `/api/people/${p.id}/mobility`);
          if (!res.ok) continue; // skip people this actor cannot read mobility for
          const data: { suggestions: { targetRole: string; coverage: number }[] } = await res.json();
          const best = data.suggestions[0];
          if (best) {
            results.push({ personId: p.id, name: p.name, bestTargetRole: best.targetRole, bestCoverage: best.coverage });
          }
        }
        results.sort((a, b) => b.bestCoverage - a.bestCoverage);
        if (!cancelled) setRows(results);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentActorId]);

  return (
    <div>
      <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
        This list shows evidence-based skill-coverage toward a <em>different</em> role, from declared and observed
        skills only. It does not measure ambition, leadership potential, or anything LEADOS has no data for — see{" "}
        <code>docs/FAIRNESS.md</code>.
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Strongest adjacent role</th>
                <th className="px-3 py-2">Skill coverage</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.personId}>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2 text-slate-600">{r.bestTargetRole ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{(r.bestCoverage * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/people/${r.personId}`} className="text-indigo-600 hover:underline">
                      Open profile →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                    No candidates meet the 60% coverage threshold yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
