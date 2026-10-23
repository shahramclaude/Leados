"use client";

import { useEffect, useState } from "react";
import { useActor, useActorFetch } from "../ActorContext";

interface Consent {
  shareAggregateOnly: boolean;
  allowManagerView: boolean;
}

interface AuditEntry {
  id: string;
  actorId: string;
  targetUserId: string | null;
  resource: string;
  allowed: boolean;
  reason: string;
  createdAt: string;
}

export default function PrivacyPage() {
  const { actorId, actor, users } = useActor();
  const actorFetch = useActorFetch();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [log, setLog] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId) return;
    actorFetch("/api/time-economics/privacy/consent")
      .then((r) => r.json())
      .then((d) => setConsent(d.consent));
  }, [actorId, actorFetch]);

  useEffect(() => {
    if (!actorId) return;
    actorFetch("/api/time-economics/privacy/audit-log")
      .then((r) => r.json())
      .then((d) => (d.error ? setLog(null) : setLog(d.log)));
  }, [actorId, actorFetch]);

  async function save(next: Consent) {
    setError(null);
    const res = await actorFetch("/api/time-economics/privacy/consent", { method: "POST", body: JSON.stringify(next) });
    const data = await res.json();
    if (data.error) setError(data.error);
    else setConsent(data.consent);
  }

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="m-0 text-lg font-semibold text-slate-950">Privacy &amp; Consent</h2>
        <p className="mt-1 text-sm text-slate-600">
          Individual time data (your interaction events, per-meeting personal cost, strategy-mirror evidence) is <strong>self-owned</strong>{" "}
          by default. Nobody — including admins — can see your individual detail unless you explicitly opt in here, and every attempt is
          logged.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {consent && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="m-0 mb-3 text-sm font-semibold">Consent for {actor?.name}</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent.shareAggregateOnly}
              onChange={(e) => save({ ...consent, shareAggregateOnly: e.target.checked })}
            />
            Only ever include me in k-anonymized aggregates (default: on)
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent.allowManagerView}
              onChange={(e) => save({ ...consent, allowManagerView: e.target.checked })}
            />
            Allow my manager/admin to view my individual time detail (default: off)
          </label>
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 mb-3 text-sm font-semibold">Privacy audit log (admin only)</h3>
        {log === null ? (
          <p className="text-sm text-slate-500">Switch to an admin user to view the audit log (every access attempt, allowed or denied).</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">When</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Resource</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1.5">{new Date(l.createdAt).toLocaleString()}</td>
                  <td>{nameById[l.actorId] ?? l.actorId.slice(0, 8)}</td>
                  <td>{l.targetUserId ? nameById[l.targetUserId] ?? l.targetUserId.slice(0, 8) : "—"}</td>
                  <td>{l.resource}</td>
                  <td className={l.allowed ? "text-emerald-700" : "text-red-700"}>{l.allowed ? "allowed" : "denied"}</td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-slate-500">
                    No access attempts logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
