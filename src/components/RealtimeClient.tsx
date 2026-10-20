"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lightweight "realtime" client: polls for events newer than the last seen
 * timestamp with exponential backoff on transient failures, instead of
 * holding an always-on connection. Dynamically imported from the dashboard
 * (see CockpitDashboard.tsx) so it never ships in the initial bundle for
 * users who never need the live counter.
 */
export function RealtimeClient() {
  const [newCount, setNewCount] = useState(0);
  const [status, setStatus] = useState<"live" | "retrying" | "offline">("live");
  const sinceRef = useRef(new Date().toISOString());
  const backoffRef = useRef(2000);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/notifications?since=${encodeURIComponent(sinceRef.current)}&limit=50`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.items.length > 0) {
          setNewCount((c) => c + data.items.length);
          sinceRef.current = data.serverTime;
        }
        setStatus("live");
        backoffRef.current = 2000;
        timeoutId = setTimeout(poll, backoffRef.current);
      } catch {
        if (cancelled) return;
        setStatus((prev) => (prev === "live" ? "retrying" : "offline"));
        backoffRef.current = Math.min(30000, backoffRef.current * 2);
        timeoutId = setTimeout(poll, backoffRef.current);
      }
    }

    timeoutId = setTimeout(poll, backoffRef.current);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const color = status === "live" ? "bg-emerald-500" : status === "retrying" ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{status === "live" ? "Live" : status === "retrying" ? "Reconnecting…" : "Offline"}</span>
      {newCount > 0 && <span className="font-semibold text-slate-700">+{newCount} new</span>}
    </div>
  );
}

export default RealtimeClient;
