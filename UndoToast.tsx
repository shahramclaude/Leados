import { useEffect, useState } from "react";
import type { UndoableToast } from "../automation/undo";
import { Button } from "./shared";

export function UndoToast({ toast, onUndo, onDismiss }: { toast: UndoableToast | null; onUndo: () => void; onDismiss: () => void }) {
  const [remaining, setRemaining] = useState(60);

  useEffect(() => {
    if (!toast) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((toast.expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [toast]);

  useEffect(() => {
    if (toast && remaining <= 0) onDismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Undo last event: {toast.eventType} — {toast.summary}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            Undo is permanent for events older than 60s — the event log is append-only by design. ({remaining}s left)
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={onUndo} className="border-slate-500 bg-slate-800 text-white hover:bg-slate-700">
            Undo ↩
          </Button>
          <button onClick={onDismiss} className="text-slate-400 hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
