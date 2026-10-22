"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client/api";

interface OrgUser {
  id: string;
  email: string;
  role: string;
}

interface AuditEvent {
  id: string;
  seq: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorEmail: string | null;
  createdAt: string | Date;
}

export function AdminPanel({
  users,
  initialEvents,
  currentUserId,
}: {
  users: OrgUser[];
  initialEvents: AuditEvent[];
  currentUserId: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function changeRole(userId: string, role: string) {
    const reason = window.prompt(`Why are you changing this user's role to ${role}? (required, min 3 chars)`);
    if (!reason || reason.trim().length < 3) return;
    const res = await apiFetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role, reason }),
    });
    if (res.ok) {
      setMessage(`Role updated. ${users.find((u) => u.id === userId)?.email}'s existing sessions were revoked.`);
    } else {
      const data = await res.json().catch(() => null);
      setMessage(data?.error?.message ?? "Could not change role");
    }
  }

  async function toggleBanner() {
    const res = await apiFetch("/api/admin/incident-banner", {
      method: "PATCH",
      body: JSON.stringify({ enabled: !bannerEnabled, message: bannerMessage }),
    });
    if (res.ok) setBannerEnabled(!bannerEnabled);
  }

  async function verifyChain() {
    const res = await apiFetch("/api/audit/verify");
    const data = await res.json();
    setVerifyResult(data.valid ? `Chain valid (${data.checked} events checked).` : `TAMPER DETECTED at seq ${data.brokenAtSeq}: ${data.reason}`);
  }

  async function refreshAudit() {
    const res = await apiFetch("/api/audit");
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-950">Admin</h1>
      {message && <p className="rounded-md bg-slate-900/5 p-2 text-sm text-slate-700">{message}</p>}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Incident mode</h2>
        <div className="mt-2 flex items-center gap-3">
          <input
            value={bannerMessage}
            onChange={(e) => setBannerMessage(e.target.value)}
            placeholder="Message shown to all users"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button onClick={toggleBanner} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
            {bannerEnabled ? "Turn off" : "Turn on"}
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Users &amp; roles</h2>
        <table className="mt-2 w-full text-left text-sm">
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="py-2">
                  {u.email} {u.id === currentUserId && <span className="text-slate-400">(you)</span>}
                </td>
                <td className="py-2">{u.role}</td>
                <td className="py-2">
                  {["admin", "manager", "member", "viewer"]
                    .filter((r) => r !== u.role)
                    .map((r) => (
                      <button
                        key={r}
                        onClick={() => changeRole(u.id, r)}
                        className="mr-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                      >
                        Make {r}
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Audit log (hash-chained, tamper-evident)</h2>
          <div className="flex gap-2">
            <button onClick={refreshAudit} className="rounded-md border border-slate-300 px-3 py-1 text-xs">
              Refresh
            </button>
            <button onClick={verifyChain} className="rounded-md border border-slate-300 px-3 py-1 text-xs">
              Verify chain
            </button>
          </div>
        </div>
        {verifyResult && <p className="mt-2 text-sm font-medium text-slate-800">{verifyResult}</p>}
        <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-xs text-slate-600">
          {events.map((e) => (
            <li key={e.id}>
              #{e.seq} [{new Date(e.createdAt).toISOString()}] {e.actorEmail ?? "system"} → {e.action} ({e.resourceType}
              {e.resourceId ? `:${e.resourceId}` : ""})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
