"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Citation {
  evidenceId: string;
  title: string;
  snippet: string;
}

interface Contradiction {
  priorTurnId: string;
  priorClaim: string;
  resolution: string;
}

interface ActionGate {
  tier: "T1" | "T2" | "T3";
  status: "drafted" | "blocked_needs_confirmation";
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  intent?: string;
  citations?: Citation[];
  abstained?: boolean;
  abstentionReason?: string | null;
  contradiction?: Contradiction | null;
  actionGate?: ActionGate | null;
  activeContext?: { timeframe?: string; metric?: string; scope?: string };
}

const ASK_EVENT = "leados:ask-followup";

/** Fire-and-forget helper any surface in the product can call to open the
 * palette pre-filled with a contextual follow-up question. */
export function askLeados(prefill: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { prefill } }));
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onAsk(e: Event) {
      const detail = (e as CustomEvent<{ prefill: string }>).detail;
      setOpen(true);
      setInput(detail.prefill);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  const pinnedContext = lastAssistant?.activeContext;

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setTurns((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", text }]);

    try {
      let convId = conversationId;
      if (!convId) {
        const res = await fetch("/api/conversations", { method: "POST", body: JSON.stringify({}) });
        const data = await res.json();
        convId = data.conversation.id;
        setConversationId(convId);
      }
      const res = await fetch(`/api/conversations/${convId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) {
        setTurns((prev) => [...prev, data.turn]);
      } else {
        setTurns((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "assistant", text: data.error ?? "Something went wrong.", abstained: true },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }, [input, busy, conversationId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
      >
        <span aria-hidden>💬</span> Ask LEADOS
        <kbd className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-16" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ask LEADOS</p>
                <p className="text-xs text-slate-500">
                  Grounded answers only — cites evidence or says it doesn&apos;t know.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                ✕
              </button>
            </div>

            {pinnedContext && (pinnedContext.timeframe || pinnedContext.metric) ? (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs">
                <span className="text-slate-500">Context:</span>
                {pinnedContext.metric ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">{pinnedContext.metric}</span>
                ) : null}
                {pinnedContext.timeframe ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">{pinnedContext.timeframe}</span>
                ) : null}
              </div>
            ) : null}

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {turns.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Try: &quot;what is our Q2 revenue?&quot; then follow up with &quot;and for Q3?&quot;
                </p>
              ) : null}
              {turns.map((t) => (
                <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      "max-w-[85%] rounded-xl px-4 py-2 text-sm " +
                      (t.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900")
                    }
                  >
                    {t.contradiction ? (
                      <p className="mb-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                        ⚠ Self-correction: {t.contradiction.resolution}
                      </p>
                    ) : null}
                    {t.actionGate?.status === "blocked_needs_confirmation" ? (
                      <p className="mb-2 rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800">
                        🔒 {t.actionGate.tier} action — drafted only, requires human confirmation before anything happens.
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{t.text}</p>
                    {t.abstained ? (
                      <p className="mt-1 text-xs italic text-slate-500">Abstained — no fabricated answer given.</p>
                    ) : null}
                    {t.citations && t.citations.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-500">
                        {t.citations.map((c, i) => (
                          <li key={c.evidenceId}>
                            [{i + 1}] {c.title}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <form
              className="flex items-center gap-2 border-t border-slate-200 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question, compare, or draft something…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
