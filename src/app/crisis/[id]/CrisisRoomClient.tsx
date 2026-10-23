"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Detail = {
  crisis: {
    id: string;
    title: string;
    state: string;
    severity: number;
    commanderCompromised: boolean;
    currentStatusVersion: number;
    isDrill: boolean;
  };
  klass: { key: string; name: string; roleTemplate: string[]; requiresDualDeclaration: boolean };
  timeline: { id: string; occurredAt: string; actorLabel: string; eventType: string; summary: string }[];
  roles: { id: string; roleKey: string; personaId: string; active: boolean }[];
  decisions: { id: string; title: string; rationale: string; decidedByRoleKey: string; decideBy: string; status: string }[];
  assumptions: { id: string; decisionId: string; statement: string; status: string; reverifyAt: string; escalated: boolean }[];
  comms: { id: string; groupId: string; subject: string; body: string; status: string; channel: string; sendFailureReason?: string }[];
  claims: { id: string; statement: string; status: string; sources: { name: string; type: string; reportedAt: string }[] }[];
  statusUpdates: { id: string; version: number; headline: string; body: string; publishedAt: string }[];
  learnings: { id: string; category: string; statement: string; actionItem: string }[];
};

const ROLE_OPTIONS = [
  "commander",
  "deputy_commander",
  "comms_lead",
  "ops_lead",
  "liaison",
  "scribe",
  "legal",
  "board_liaison",
  "watch_officer",
];

const STATE_NEXT: Record<string, string[]> = {
  normal: ["elevated", "crisis"],
  elevated: ["normal", "crisis"],
  crisis: ["recovery", "crisis"],
  recovery: ["post_mortem", "crisis"],
  post_mortem: ["closed"],
  closed: [],
};

const TABS = ["Timeline", "Roles", "Decisions", "Comms", "Claims", "Status Page", "Learnings"] as const;

export default function CrisisRoomClient({ crisisId }: { crisisId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const [actingRole, setActingRole] = useState("commander");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crisis/${crisisId}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }, [crisisId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount for a Crisis Room dashboard
    load();
  }, [load]);

  if (!detail) {
    return (
      <main className="min-h-screen px-6 py-12">
        <p className="text-slate-600">Loading crisis room…</p>
      </main>
    );
  }

  const isCrisisMode = detail.crisis.state === "crisis";

  async function doTransition(toState: string) {
    const reason = window.prompt(`Reason for transitioning to "${toState}"?`) ?? "";
    const res = await fetch(`/api/crisis/${crisisId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toState, actorRoleKeys: [actingRole], reason }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Transitioned to ${toState}.` : `Blocked: ${data.error}`);
    load();
  }

  async function markCompromised() {
    const note = window.prompt("Note on why the commander is being marked compromised:") ?? "";
    const res = await fetch(`/api/crisis/${crisisId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markCommanderCompromised: true, note }),
    });
    setMessage(res.ok ? "Commander marked compromised. Authority rerouted to deputy_commander/board_liaison." : "Failed.");
    load();
  }

  return (
    <main className={`min-h-screen px-6 py-10 ${isCrisisMode ? "crisis-mode" : ""}`}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/crisis" className={`text-xs ${isCrisisMode ? "text-slate-300" : "text-slate-500"}`}>
              ← All crises
            </Link>
            <h1 className="mt-1 text-2xl font-semibold">{detail.crisis.title}</h1>
            <p className={`text-sm ${isCrisisMode ? "text-slate-300" : "text-slate-600"}`}>
              {detail.klass.name} · severity {detail.crisis.severity} {detail.crisis.isDrill ? "· DRILL" : ""}
            </p>
          </div>
          <span className="crisis-badge rounded-full bg-red-600 px-4 py-2 text-sm font-bold uppercase text-white">
            {detail.crisis.state}
          </span>
        </div>

        {detail.crisis.commanderCompromised && (
          <div className="mt-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
            ⚠ Commander marked COMPROMISED for this crisis. Commander-only authority has been rerouted to
            deputy_commander + board_liaison.
          </div>
        )}

        {message && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${isCrisisMode ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800"}`}>
            {message}
          </div>
        )}

        <div className={`essential-surface mt-6 rounded-2xl border p-4 ${isCrisisMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide opacity-70">Acting as role</label>
            <select
              value={actingRole}
              onChange={(e) => setActingRole(e.target.value)}
              className={`rounded-lg border p-2 text-sm ${isCrisisMode ? "border-slate-600 bg-slate-800 text-white" : "border-slate-300"}`}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {STATE_NEXT[detail.crisis.state]?.map((s) => (
              <button
                key={s}
                onClick={() => doTransition(s)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                → {s}
              </button>
            ))}

            <button onClick={markCompromised} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
              Mark commander compromised
            </button>

            <button
              onClick={async () => {
                const res = await fetch("/api/crisis/assumptions/tick", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ crisisId }),
                });
                const data = await res.json();
                setMessage(`Reverification sweep: checked ${data.checked}, escalated ${data.escalated}.`);
                load();
              }}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Run assumption reverification sweep
            </button>
          </div>
        </div>

        <div className={`mt-6 flex flex-wrap gap-2 border-b ${isCrisisMode ? "border-slate-700" : "border-slate-200"}`}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-semibold ${
                tab === t
                  ? isCrisisMode
                    ? "border-b-2 border-amber-400 text-amber-300"
                    : "border-b-2 border-slate-900 text-slate-900"
                  : isCrisisMode
                    ? "text-slate-400"
                    : "text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={`mt-4 rounded-2xl p-5 ${isCrisisMode ? "bg-slate-900 text-slate-100" : "bg-white shadow"}`}>
          {tab === "Timeline" && (
            <ul className="space-y-3">
              {detail.timeline.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="font-mono text-xs opacity-60">{new Date(e.occurredAt).toLocaleString()}</span>{" "}
                  <span className="font-semibold">[{e.eventType}]</span> {e.summary}{" "}
                  <span className="opacity-60">— {e.actorLabel}</span>
                </li>
              ))}
              {detail.timeline.length === 0 && <p className="text-sm opacity-70">No events yet.</p>}
            </ul>
          )}

          {tab === "Roles" && <RolesPanel crisisId={crisisId} roles={detail.roles} roleTemplate={detail.klass.roleTemplate} reload={load} />}

          {tab === "Decisions" && (
            <DecisionsPanel crisisId={crisisId} decisions={detail.decisions} assumptions={detail.assumptions} reload={load} actingRole={actingRole} />
          )}

          {tab === "Comms" && <CommsPanel crisisId={crisisId} comms={detail.comms} reload={load} actingRole={actingRole} />}

          {tab === "Claims" && <ClaimsPanel crisisId={crisisId} claims={detail.claims} reload={load} />}

          {tab === "Status Page" && (
            <StatusPanel crisisId={crisisId} updates={detail.statusUpdates} reload={load} actingRole={actingRole} />
          )}

          {tab === "Learnings" && <LearningsPanel crisisId={crisisId} learnings={detail.learnings} reload={load} />}
        </div>

        <div className="mt-6 text-right">
          <Link href={`/crisis/${crisisId}/postmortem`} className="text-sm font-semibold underline opacity-80">
            Open Post-Mortem Studio →
          </Link>
        </div>
      </div>
    </main>
  );
}

function RolesPanel({
  crisisId,
  roles,
  roleTemplate,
  reload,
}: {
  crisisId: string;
  roles: Detail["roles"];
  roleTemplate: string[];
  reload: () => void;
}) {
  const [personas, setPersonas] = useState<{ id: string; name: string; roleKeys: string[] }[]>([]);
  const [roleKey, setRoleKey] = useState(roleTemplate[0] ?? "commander");
  const [personaId, setPersonaId] = useState("");

  useEffect(() => {
    fetch(`/api/crisis/${crisisId}/roles`)
      .then((r) => r.json())
      .then((d) => setPersonas(d.personas));
  }, [crisisId]);

  return (
    <div>
      <p className="text-sm font-semibold">Pre-configured roles for this crisis class: {roleTemplate.join(", ")}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {roles.map((r) => (
          <li key={r.id}>
            {r.roleKey}: {personas.find((p) => p.id === r.personaId)?.name ?? r.personaId}
          </li>
        ))}
        {roles.length === 0 && <li className="opacity-70">No roles assigned yet.</li>}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="rounded-lg border p-2 text-sm text-slate-900">
          {roleTemplate.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="rounded-lg border p-2 text-sm text-slate-900">
          <option value="">Select person…</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          disabled={!personaId}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/roles`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roleKey, personaId, actingRoleKeys: ["commander"] }),
            });
            reload();
          }}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Assign
        </button>
      </div>
    </div>
  );
}

function DecisionsPanel({
  crisisId,
  decisions,
  assumptions,
  reload,
  actingRole,
}: {
  crisisId: string;
  decisions: Detail["decisions"];
  assumptions: Detail["assumptions"];
  reload: () => void;
  actingRole: string;
}) {
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [decideByHours, setDecideByHours] = useState(2);
  const [assumptionText, setAssumptionText] = useState("");
  const [reverifyHours, setReverifyHours] = useState(2);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Decision log</h3>
        <ul className="mt-2 space-y-3">
          {decisions.map((d) => (
            <li key={d.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{d.title}</p>
              <p className="opacity-70">{d.rationale}</p>
              <p className="mt-1 text-xs opacity-60">
                Decided by {d.decidedByRoleKey} · decide-by {new Date(d.decideBy).toLocaleString()} · {d.status}
              </p>
              <div className="mt-2 space-y-1">
                {assumptions
                  .filter((a) => a.decisionId === d.id)
                  .map((a) => (
                    <p key={a.id} className={`text-xs ${a.status === "overdue" ? "font-bold text-red-600" : "opacity-70"}`}>
                      Assumption: {a.statement} — reverify at {new Date(a.reverifyAt).toLocaleString()} — status: {a.status}
                      {a.escalated ? " (ESCALATED)" : ""}
                    </p>
                  ))}
              </div>
            </li>
          ))}
          {decisions.length === 0 && <p className="text-sm opacity-70">No decisions recorded yet.</p>}
        </ul>
      </div>

      <div className="rounded-lg border p-3">
        <h4 className="text-sm font-semibold">Record a time-boxed decision</h4>
        <input
          placeholder="Decision title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm text-slate-900"
        />
        <textarea
          placeholder="Rationale (what we know, what we don't)"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm text-slate-900"
        />
        <div className="mt-2 flex items-center gap-2 text-sm">
          <label>Decide-by (hours from now):</label>
          <input
            type="number"
            value={decideByHours}
            onChange={(e) => setDecideByHours(Number(e.target.value))}
            className="w-20 rounded-lg border p-1 text-slate-900"
          />
        </div>
        <div className="mt-3 rounded-md bg-amber-50 p-2 text-slate-900">
          <p className="text-xs font-semibold">Assumption register (deciding on incomplete information)</p>
          <input
            placeholder='e.g. "assumed the outage is isolated to region EU-1"'
            value={assumptionText}
            onChange={(e) => setAssumptionText(e.target.value)}
            className="mt-1 block w-full rounded-lg border p-2 text-sm"
          />
          <div className="mt-1 flex items-center gap-2 text-xs">
            <label>Re-verify at T+</label>
            <input
              type="number"
              value={reverifyHours}
              onChange={(e) => setReverifyHours(Number(e.target.value))}
              className="w-16 rounded-lg border p-1"
            />
            <label>hours</label>
          </div>
        </div>
        <button
          disabled={!title}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/decisions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                rationale,
                decidedByRoleKey: actingRole,
                decideByHoursFromNow: decideByHours,
                assumptions: assumptionText ? [{ statement: assumptionText, confidence: "medium", reverifyHours }] : [],
              }),
            });
            setTitle("");
            setRationale("");
            setAssumptionText("");
            reload();
          }}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Record decision
        </button>
      </div>
    </div>
  );
}

function CommsPanel({
  crisisId,
  comms,
  reload,
  actingRole,
}: {
  crisisId: string;
  comms: Detail["comms"];
  reload: () => void;
  actingRole: string;
}) {
  const [groupKey, setGroupKey] = useState("internal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Comms queue</h3>
        <ul className="mt-2 space-y-3">
          {comms.map((m) => (
            <li key={m.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{m.subject}</p>
              <p className="opacity-70">{m.body}</p>
              <p className="mt-1 text-xs opacity-60">
                status: <strong>{m.status}</strong> {m.channel ? `· channel: ${m.channel}` : ""}
                {m.sendFailureReason ? ` · failure: ${m.sendFailureReason}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                {m.status === "legal_review" && (
                  <>
                    <button
                      onClick={async () => {
                        await fetch(`/api/crisis/${crisisId}/comms`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "legal_review", messageId: m.id, approve: true, note: "Reviewed, OK to send." }),
                        });
                        reload();
                      }}
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Legal: Approve
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/crisis/${crisisId}/comms`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "legal_review", messageId: m.id, approve: false, note: "Needs revision." }),
                        });
                        reload();
                      }}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Legal: Reject
                    </button>
                  </>
                )}
                {(m.status === "approved" || m.status === "draft") && (
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/crisis/${crisisId}/comms`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "send", messageId: m.id, actingRoleKeys: [actingRole] }),
                      });
                      if (!res.ok) {
                        const d = await res.json();
                        window.alert(`Send failed: ${d.error}`);
                      }
                      reload();
                    }}
                    className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                  >
                    Send
                  </button>
                )}
              </div>
            </li>
          ))}
          {comms.length === 0 && <p className="text-sm opacity-70">No messages drafted yet.</p>}
        </ul>
      </div>

      <div className="rounded-lg border p-3 text-slate-900">
        <h4 className="text-sm font-semibold">Compose message</h4>
        <select value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className="mt-2 rounded-lg border p-2 text-sm">
          <option value="internal">Internal</option>
          <option value="customer">Customer</option>
          <option value="regulatory">Regulatory</option>
          <option value="media">Media</option>
        </select>
        <input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <textarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <button
          disabled={!subject || !body}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/comms`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ groupKey, subject, body, actingRoleKeys: [actingRole] }),
            });
            setSubject("");
            setBody("");
            reload();
          }}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Draft message (external audiences route to legal review)
        </button>
      </div>
    </div>
  );
}

function ClaimsPanel({ crisisId, claims, reload }: { crisisId: string; claims: Detail["claims"]; reload: () => void }) {
  const [statement, setStatement] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState("internal");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Rumor control — claims</h3>
        <ul className="mt-2 space-y-3">
          {claims.map((c) => (
            <li key={c.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{c.statement}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                  c.status === "confirmed" ? "bg-emerald-600 text-white" : c.status === "debunked" ? "bg-slate-500 text-white" : "bg-yellow-400 text-yellow-900"
                }`}
              >
                {c.status === "unconfirmed" ? "⚠ UNCONFIRMED — single source quarantine" : c.status}
              </span>
              <ul className="mt-2 text-xs opacity-70">
                {c.sources.map((s, i) => (
                  <li key={i}>
                    {s.name} ({s.type})
                  </li>
                ))}
              </ul>
              <button
                onClick={async () => {
                  const name = window.prompt("Additional source name?");
                  if (!name) return;
                  const type = window.prompt("Source type (official/press/internal/social/rumor)?", "internal") ?? "internal";
                  await fetch(`/api/crisis/${crisisId}/claims`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ claimId: c.id, addSource: { name, type, reportedAt: new Date().toISOString() } }),
                  });
                  reload();
                }}
                className="mt-2 rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
              >
                Add corroborating source
              </button>
            </li>
          ))}
          {claims.length === 0 && <p className="text-sm opacity-70">No claims logged yet.</p>}
        </ul>
      </div>

      <div className="rounded-lg border p-3 text-slate-900">
        <h4 className="text-sm font-semibold">Log a claim/rumor</h4>
        <input
          placeholder="Claim statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <input
            placeholder="First source name"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            className="flex-1 rounded-lg border p-2 text-sm"
          />
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="rounded-lg border p-2 text-sm">
            <option value="internal">internal</option>
            <option value="official">official</option>
            <option value="press">press</option>
            <option value="social">social</option>
            <option value="rumor">rumor</option>
          </select>
        </div>
        <button
          disabled={!statement || !sourceName}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/claims`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ statement, sources: [{ name: sourceName, type: sourceType, reportedAt: new Date().toISOString() }] }),
            });
            setStatement("");
            setSourceName("");
            reload();
          }}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Log claim (single-source will be quarantined automatically)
        </button>
      </div>
    </div>
  );
}

function StatusPanel({
  crisisId,
  updates,
  reload,
  actingRole,
}: {
  crisisId: string;
  updates: Detail["statusUpdates"];
  reload: () => void;
  actingRole: string;
}) {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Status page history (auto-versioned, append-only)</h3>
        <ul className="mt-2 space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">
                v{u.version} — {u.headline}
              </p>
              <p className="opacity-70">{u.body}</p>
              <p className="mt-1 text-xs opacity-60">{new Date(u.publishedAt).toLocaleString()}</p>
            </li>
          ))}
          {updates.length === 0 && <p className="text-sm opacity-70">No status updates published yet.</p>}
        </ul>
      </div>

      <div className="rounded-lg border p-3 text-slate-900">
        <h4 className="text-sm font-semibold">Publish a status update</h4>
        <input
          placeholder="Headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <textarea
          placeholder="Body — only double-sourced/confirmed facts"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <button
          disabled={!headline || !body}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ headline, body, actingRoleKeys: [actingRole] }),
            });
            setHeadline("");
            setBody("");
            reload();
          }}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Publish
        </button>
      </div>
    </div>
  );
}

function LearningsPanel({ crisisId, learnings, reload }: { crisisId: string; learnings: Detail["learnings"]; reload: () => void }) {
  const [statement, setStatement] = useState("");
  const [actionItem, setActionItem] = useState("");
  const [category, setCategory] = useState("process");

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {learnings.map((l) => (
          <li key={l.id} className="rounded-lg border p-3 text-sm">
            <p className="font-semibold">[{l.category}] {l.statement}</p>
            <p className="opacity-70">Action: {l.actionItem}</p>
          </li>
        ))}
        {learnings.length === 0 && <p className="text-sm opacity-70">No learnings captured yet — use the Post-Mortem Studio.</p>}
      </ul>
      <div className="rounded-lg border p-3 text-slate-900">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border p-2 text-sm">
          <option value="process">process</option>
          <option value="tooling">tooling</option>
          <option value="comms">comms</option>
          <option value="authority">authority</option>
          <option value="detection">detection</option>
        </select>
        <input
          placeholder="What did we learn?"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <input
          placeholder="Action item"
          value={actionItem}
          onChange={(e) => setActionItem(e.target.value)}
          className="mt-2 block w-full rounded-lg border p-2 text-sm"
        />
        <button
          disabled={!statement}
          onClick={async () => {
            await fetch(`/api/crisis/${crisisId}/learnings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ category, statement, actionItem, targetSystem: "part12_knowledge_base" }),
            });
            setStatement("");
            setActionItem("");
            reload();
          }}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Capture learning
        </button>
      </div>
    </div>
  );
}
