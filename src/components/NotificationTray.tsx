"use client";

// LEADOS Part 14 — NotificationTray
// Bell trigger with unread count + visible interrupt-budget spend + a Focus
// Mode toggle (visibly reversible — the badge and banner make the state
// obvious whenever it's on).
import { useCallback, useEffect, useState } from "react";
import { useActor } from "./ActorProvider";
import { NotificationDrawer } from "./NotificationDrawer";
import { useRealtimeIntelligence } from "@/hooks/useRealtimeIntelligence";

interface BudgetStatus {
  spent: number;
  budget: number;
  remaining: number;
  exhausted: boolean;
  quietHours: { inQuietHours: boolean };
}

export function NotificationTray() {
  const { actor, loading, switchRole } = useActor();
  const { state } = useRealtimeIntelligence(actor?.userId ?? null, actor?.role);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [focusEnabled, setFocusEnabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!actor) return;
    const [nRes, bRes, fRes] = await Promise.all([
      fetch(`/api/notifications?userId=${actor.userId}&state=unread&limit=100`),
      fetch(`/api/notifications/budget?userId=${actor.userId}`),
      fetch(`/api/focus-mode?userId=${actor.userId}`),
    ]);
    const n = await nRes.json();
    setUnread(n.items?.length ?? 0);
    setBudget(await bRes.json());
    const f = await fRes.json();
    setFocusEnabled(!!f.enabled);
  }, [actor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lastFrameId = state.frames.at(-1)?.id;
  useEffect(() => {
    if (lastFrameId) void refresh();
  }, [lastFrameId, refresh]);

  async function toggleFocus() {
    if (!actor) return;
    const next = !focusEnabled;
    await fetch(`/api/focus-mode?userId=${actor.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next, allowedClasses: ["action"], reason: next ? "user enabled focus mode" : "" }),
    });
    setFocusEnabled(next);
  }

  if (loading || !actor) return null;

  return (
    <div className="flex items-center gap-3">
      {focusEnabled && (
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
          Focus mode on
          <button onClick={toggleFocus} className="ml-2 underline">
            turn off
          </button>
        </span>
      )}
      {!focusEnabled && (
        <button onClick={toggleFocus} className="text-xs font-medium text-slate-500 hover:text-slate-800">
          Enable focus mode
        </button>
      )}

      <select
        value={actor.role}
        onChange={(e) => switchRole(e.target.value as "manager" | "analyst")}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
      >
        <option value="analyst">as analyst</option>
        <option value="manager">as manager</option>
      </select>

      {budget && (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${budget.exhausted ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}
          title="daily interrupt budget spend"
        >
          {budget.spent}/{budget.budget} interrupts today
        </span>
      )}

      <button onClick={() => setOpen(true)} className="relative rounded-full border border-slate-300 bg-white p-2 hover:bg-slate-50" aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      <NotificationDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
