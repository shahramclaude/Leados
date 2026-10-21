"use client";

import { toastStore, useToasts } from "@/lib/state/toastStore";

const TONE_STYLE = {
  info: "bg-slate-900 text-white",
  error: "bg-rose-700 text-white",
  success: "bg-emerald-700 text-white",
};

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm shadow-lg ${TONE_STYLE[t.tone]}`}>
          <span>{t.message}</span>
          <button onClick={() => toastStore.dismiss(t.id)} className="text-xs opacity-80 hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
