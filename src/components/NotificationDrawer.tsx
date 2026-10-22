"use client";

// LEADOS Part 14 — NotificationDrawer
// Chain views (root + children), bulk triage with undo, and per-class mute
// with a required reason. Listens to the realtime stream to refresh live.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActor } from "./ActorProvider";
import { useRealtimeIntelligence } from "@/hooks/useRealtimeIntelligence";
import { relativeTimeFrom, useNowTick } from "@/hooks/useNowTick";

interface NotificationRow {
  id: string;
  class: string;
  severity: number;
  title: string;
  body: string;
  state: string;
  dedupeKey: string;
  decisionReason: string;
  deliveredImmediately: boolean;
  createdAt: string;
  chainLength: number;
}

interface PrefRow {
  class: string;
  muted: boolean;
  muteReason: string;
  optedInImmediate: boolean;
}

const CLASS_COLORS: Record<string, string> = {
  alert: "bg-rose-100 text-rose-700 border-rose-200",
  action: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-slate-100 text-slate-700 border-slate-200",
  digest: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { actor } = useActor();
  const now = useNowTick();
  const { state } = useRealtimeIntelligence(actor?.userId ?? null, actor?.role);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, NotificationRow[]>>({});
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [undoState, setUndoState] = useState<{ previousStates: Record<string, string> } | null>(null);
  const [muteTarget, setMuteTarget] = useState<string | null>(null);
  const [muteReason, setMuteReason] = useState("");

  const qs = useMemo(() => (actor ? `userId=${actor.userId}` : ""), [actor]);

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!actor) return;
      const res = await fetch(`/api/notifications?${qs}${cursor ? `&cursor=${cursor}` : ""}`);
      const data = await res.json();
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    },
    [actor, qs],
  );

  const loadPrefs = useCallback(async () => {
    if (!actor) return;
    const res = await fetch(`/api/notifications/prefs?${qs}`);
    const data = await res.json();
    setPrefs(data.prefs);
  }, [actor, qs]);

  useEffect(() => {
    if (open) {
      void load();
      void loadPrefs();
    }
  }, [open, load, loadPrefs]);

  // Live refresh when a notification_state frame arrives.
  const lastFrameId = state.frames.at(-1)?.id;
  useEffect(() => {
    if (!open || !lastFrameId) return;
    void load();
  }, [lastFrameId, open, load]);

  async function toggleChain(id: string) {
    if (expanded[id]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/notifications/${id}`);
    const data = await res.json();
    setExpanded((prev) => ({ ...prev, [id]: data.children }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkTriage(action: "read-all" | "archive") {
    if (!actor) return;
    if (action === "read-all") {
      const ids = selected.size > 0 ? [...selected] : undefined;
      const res = await fetch(`/api/notifications/read-all?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      setUndoState({ previousStates: data.previousStates });
      setSelected(new Set());
      void load();
    } else {
      const previousStates: Record<string, string> = {};
      for (const id of selected) {
        const item = items.find((i) => i.id === id);
        if (item) previousStates[id] = item.state;
        await fetch(`/api/notifications/${id}?${qs}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive" }),
        });
      }
      setUndoState({ previousStates });
      setSelected(new Set());
      void load();
    }
  }

  async function undo() {
    if (!undoState || !actor) return;
    await fetch(`/api/notifications/undo?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previousStates: undoState.previousStates }),
    });
    setUndoState(null);
    void load();
  }

  async function saveMute(klass: string, muted: boolean) {
    if (!actor) return;
    if (muted && !muteReason.trim()) return;
    await fetch(`/api/notifications/prefs?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: klass, muted, muteReason: muted ? muteReason.trim() : "" }),
    });
    setMuteTarget(null);
    setMuteReason("");
    void loadPrefs();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-2 text-xs text-slate-500">
          <span className={`inline-block h-2 w-2 rounded-full ${state.connectionState === "open" ? "bg-emerald-500" : state.connectionState === "polling" ? "bg-amber-500" : "bg-slate-300"}`} />
          {state.connectionState === "open" ? "live" : state.connectionState === "polling" ? "polling fallback" : state.connectionState}
          {state.lagNotices > 0 && <span className="text-amber-600">• {state.lagNotices} lag notice(s)</span>}
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-2">
          <div className="flex gap-2">
            <button onClick={() => bulkTriage("read-all")} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
              Mark read{selected.size > 0 ? ` (${selected.size})` : " all"}
            </button>
            <button onClick={() => bulkTriage("archive")} disabled={selected.size === 0} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40">
              Archive selected
            </button>
          </div>
          {undoState && (
            <button onClick={undo} className="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200">
              Undo
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No notifications yet.</p>}
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CLASS_COLORS[item.class] ?? ""}`}>{item.class}</span>
                      <span className="text-[10px] text-slate-400">sev {item.severity}</span>
                      {item.state === "unread" && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                      {item.chainLength > 1 && (
                        <button onClick={() => toggleChain(item.id)} className="text-[10px] text-indigo-600 underline">
                          {expanded[item.id] ? "hide" : "show"} chain ({item.chainLength})
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.body}</p>
                    <p className="mt-1 text-[11px] italic text-slate-400">{item.decisionReason}</p>
                    <p className="text-[11px] text-slate-400">{relativeTimeFrom(item.createdAt, now)}</p>
                    {expanded[item.id] && (
                      <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                        {expanded[item.id].map((child) => (
                          <li key={child.id} className="text-xs text-slate-500">
                            {relativeTimeFrom(child.createdAt, now)} — {child.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="px-5 py-3 text-center">
              <button onClick={() => load(nextCursor)} className="text-xs font-medium text-indigo-600 hover:underline">
                Load more
              </button>
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 px-5 py-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Mute by class (reason required)</p>
          <div className="space-y-1">
            {prefs.map((p) => (
              <div key={p.class} className="flex items-center justify-between text-xs">
                <span className="capitalize text-slate-700">{p.class}</span>
                {p.muted ? (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400" title={p.muteReason}>muted: {p.muteReason}</span>
                    <button onClick={() => saveMute(p.class, false)} className="text-indigo-600 underline">
                      unmute
                    </button>
                  </div>
                ) : muteTarget === p.class ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={muteReason}
                      onChange={(e) => setMuteReason(e.target.value)}
                      placeholder="reason…"
                      className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    />
                    <button onClick={() => saveMute(p.class, true)} className="text-indigo-600 underline">
                      save
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setMuteTarget(p.class)} className="text-slate-400 underline">
                    mute
                  </button>
                )}
              </div>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
