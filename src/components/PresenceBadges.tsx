"use client";

// Presence metadata only: who else is currently viewing this entity. Sends
// a lightweight heartbeat while mounted and polls for other viewers. No
// message content is ever read here.

import { useEffect, useState } from "react";

interface Viewer {
  userId: string;
  name: string;
  status: string;
}

export function PresenceBadges({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    let cancelled = false;

    const heartbeat = async () => {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, status: "viewing" }),
      }).catch(() => {});
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/presence?entityType=${entityType}&entityId=${entityId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { viewers: Viewer[] };
        if (!cancelled) setViewers(data.viewers);
      } catch {
        // ignore transient failures
      }
    };

    heartbeat();
    poll();
    const heartbeatId = setInterval(heartbeat, 20_000);
    const pollId = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(heartbeatId);
      clearInterval(pollId);
    };
  }, [entityType, entityId]);

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-[11px] text-slate-500">
      <span aria-hidden>👀</span>
      {viewers.map((v) => v.name).join(", ")} viewing
    </div>
  );
}
