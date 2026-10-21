"use client";

import { useEffect, useState } from "react";
import { TeamHealthView } from "@/components/TeamHealthView";

interface Team {
  id: string;
  name: string;
}

export default function TeamHealthPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data: { teams: Team[] }) => {
        setTeams(data.teams);
        setTeamId(data.teams[0]?.id ?? null);
      });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Team health</h1>
      <p className="mt-1 text-sm text-slate-600">
        Engagement, workload, velocity, quality (capability proxy) and retention signal combined into one radar, with
        drill-downs and playbook-engine recommendations (Part 11 seam).
      </p>
      <div className="mt-4">
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={teamId ?? ""}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-6">{teamId && <TeamHealthView teamId={teamId} />}</div>
    </main>
  );
}
