"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Persona {
  id: string;
  name: string;
  roleKeys: string[];
}

interface TranscriptEntry {
  sequence: number;
  type: string;
  startedAt: string;
  finishedAt: string;
  outcome: string;
  detail: string;
  productFlowFailed: boolean;
  productFlowFailureNote?: string;
}

export default function DrillsClient() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [drills, setDrills] = useState<{ drill: { id: string; name: string; status: string }; klass: { name: string } }[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ transcript: TranscriptEntry[]; crisis: { id: string } } | null>(null);

  async function loadDrills() {
    const res = await fetch("/api/drills");
    const data = await res.json();
    setDrills(data.drills);
  }

  useEffect(() => {
    fetch("/api/crisis/classes")
      .then((r) => r.json())
      .then((d) => setPersonas(d.personas));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount for a drill dashboard
    loadDrills();
  }, []);

  async function runStandardDrill() {
    setRunning(true);
    setResult(null);

    const commander = personas.find((p) => p.roleKeys.includes("commander"));
    const deputy = personas.find((p) => p.roleKeys.includes("deputy_commander"));

    const createRes = await fetch("/api/drills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Full org drill ${new Date().toISOString()}`,
        classKey: "operational_outage",
        injects: [
          {
            type: "signal_storm",
            payload: {
              signals: [
                { source: "monitoring_feed", severity: 2, independentSources: 1 },
                { source: "support_ticket_volume", severity: 2, independentSources: 1 },
                { source: "status_page_watchers", severity: 3, independentSources: 1 },
                { source: "on_call_page", severity: 5, independentSources: 2 },
              ],
            },
          },
          { type: "dependency_outage", payload: { dependencyKey: "email_provider", newStatus: "down" } },
          {
            type: "false_rumor",
            payload: {
              statement: "Rumor: customer data was exfiltrated.",
              sources: [{ name: "anonymous social post", type: "social", reportedAt: new Date().toISOString() }],
            },
          },
          {
            type: "comms_error",
            payload: {
              groupKey: "customer",
              subject: "Service disruption update",
              body: "We are investigating an issue. Updates to follow.",
            },
          },
        ],
      }),
    });
    const { drill } = await createRes.json();

    const runRes = await fetch(`/api/drills/${drill.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declarerPersonaIds: [commander?.id, deputy?.id].filter(Boolean) }),
    });
    const data = await runRes.json();
    setResult(data);
    setRunning(false);
    loadDrills();
  }

  return (
    <div className="space-y-6">
      <button
        onClick={runStandardDrill}
        disabled={running}
        className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {running ? "Running drill…" : "Run standard 4-inject drill (signal storm, dependency outage, false rumor, comms error)"}
      </button>

      {result && (
        <div className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-semibold">
            Transcript —{" "}
            <Link href={`/crisis/${result.crisis.id}`} className="underline">
              open drill crisis room
            </Link>
          </h2>
          <ol className="mt-3 space-y-3">
            {result.transcript.map((t) => (
              <li key={t.sequence} className={`rounded-lg border p-3 text-sm ${t.productFlowFailed ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
                <p className="font-semibold">
                  #{t.sequence} {t.type} — {t.outcome}
                  {t.productFlowFailed && <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-xs text-white">PRODUCT FLOW FAILED</span>}
                </p>
                <p className="text-slate-700">{t.detail}</p>
                {t.productFlowFailureNote && <p className="mt-1 text-xs font-semibold text-red-700">{t.productFlowFailureNote}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Past drills</h2>
        <ul className="mt-2 space-y-2">
          {drills.map(({ drill, klass }) => (
            <li key={drill.id} className="rounded-lg bg-white p-3 text-sm shadow">
              {drill.name} — {klass.name} — {drill.status}
            </li>
          ))}
          {drills.length === 0 && <li className="text-sm text-slate-500">No drills run yet.</li>}
        </ul>
      </div>
    </div>
  );
}
