"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/httpClient";
import { useSession } from "@/components/SessionProvider";

interface AuditEvent {
  id: string;
  seq: number;
  correlationId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorEmail: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
  hash: string;
  prevHash: string | null;
}

export default function AuditPage() {
  const { user, loading: sessionLoading } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && (!user || user.role !== "admin")) router.replace("/dashboard");
  }, [sessionLoading, user, router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch("/api/audit?limit=100")) as { events: AuditEvent[] };
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleVerify() {
    setVerifyResult(null);
    try {
      const data = (await apiFetch("/api/audit/verify")) as { valid: boolean; checked: number };
      setVerifyResult(
        data.valid
          ? `Chain verified — ${data.checked} events, no tampering detected.`
          : `TAMPER DETECTED after checking ${data.checked} events.`,
      );
    } catch (err) {
      setVerifyResult(err instanceof Error ? err.message : "Verification failed.");
    }
  }

  if (sessionLoading || !user || user.role !== "admin") return null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-950">Audit log</h1>
        <div className="flex gap-2">
          <button
            onClick={handleVerify}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Verify hash chain
          </button>
          <a
            href="/api/audit/export"
            className="rounded-lg bg-slate-950 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            Export CSV
          </a>
        </div>
      </div>
      {verifyResult && <p className="mt-2 text-sm text-slate-700">{verifyResult}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Seq</th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Hash</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-2 text-slate-500" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td className="px-3 py-2 text-slate-500" colSpan={7}>
                  No events yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{e.seq}</td>
                <td className="px-3 py-2">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{e.actorEmail ?? "system"}</td>
                <td className="px-3 py-2 font-medium">{e.action}</td>
                <td className="px-3 py-2">
                  {e.resourceType}
                  {e.resourceId ? `#${e.resourceId.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2">{e.ip ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{e.hash.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
