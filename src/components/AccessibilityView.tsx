import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { detect } from "../lib/a11y";

export function AccessibilityView({
  dyslexiaFriendly,
  setDyslexiaFriendly,
  cognitiveReduction,
  setCognitiveReduction,
}: {
  dyslexiaFriendly: boolean;
  setDyslexiaFriendly: (v: boolean) => void;
  cognitiveReduction: boolean;
  setCognitiveReduction: (v: boolean) => void;
}) {
  const [screenReaderSelfReport, setScreenReaderSelfReport] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const signals = detect(screenReaderSelfReport);

  function announce(msg: string) {
    setAnnouncement(""); // force re-announce even for repeated text
    requestAnimationFrame(() => setAnnouncement(msg));
  }

  function openModal() {
    lastFocused.current = document.activeElement as HTMLElement;
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    lastFocused.current?.focus();
  }

  useEffect(() => {
    if (!modalOpen) return;
    const node = dialogRef.current;
    const focusables = node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusables?.[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab" && focusables && focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  return (
    <div className="space-y-6">
      <Card title="Live-detected signals (via window.matchMedia — real, not simulated)">
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <SignalRow label="prefers-reduced-motion" on={signals.reducedMotion} />
          <SignalRow label="prefers-color-scheme: dark" on={signals.darkMode} />
          <SignalRow label="prefers-contrast: more" on={signals.highContrast} />
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={screenReaderSelfReport} onChange={(e) => setScreenReaderSelfReport(e.target.checked)} />
          I use a screen reader (manual self-report — this can't be reliably auto-detected from JS)
        </label>
      </Card>

      <Card title="Manual adaptations">
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dyslexiaFriendly} onChange={(e) => setDyslexiaFriendly(e.target.checked)} />
            Dyslexia-friendly mode (wider letter/word spacing, left-aligned text)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cognitiveReduction} onChange={(e) => setCognitiveReduction(e.target.checked)} />
            Cognitive-reduction mode (hides secondary/low-severity hints across the app)
          </label>
        </div>
      </Card>

      <Card title="Live region announcer test">
        <button
          onClick={() => announce("This message was just announced via an aria-live region.")}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Announce test message
        </button>
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <div className="mb-1 font-medium text-slate-600">Sighted mirror of the live region (demo aid only):</div>
          {announcement || <span className="italic text-slate-400">nothing announced yet</span>}
        </div>
      </Card>

      <Card title="Focus trap demo">
        <button onClick={openModal} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Open focus-trapped modal
        </button>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            >
              <h4 id="modal-title" className="mb-2 text-sm font-semibold">
                Focus-trapped dialog
              </h4>
              <p className="mb-4 text-sm text-slate-600">Tab cycles only within this dialog. Escape closes it.</p>
              <div className="flex justify-end gap-2">
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={closeModal}>
                  Cancel
                </button>
                <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={closeModal}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SignalRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
      <span className="text-slate-600">{label}</span>
      <span className={on ? "font-semibold text-emerald-600" : "text-slate-400"}>{on ? "ON" : "off"}</span>
    </li>
  );
}
