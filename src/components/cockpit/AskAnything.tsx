import { useEffect, useMemo, useRef, useState } from "react";
import { QUESTION_ONTOLOGY, type QuestionDef } from "../../lib/questionOntology";
import { cn } from "../../utils/cn";

// "Ask the product anything" — mirrors the repo's `CommandPalette.tsx`
// pattern (Cmd+K open, debounced filter, arrow-key navigation, Enter to
// select). Decomposes free text to one of the 20 ontology questions; there
// is no 21st path, so an unmatched query gets an honest "not in the
// ontology yet" result instead of a fabricated answer.
export function AskAnything({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (q: QuestionDef) => void }) {
  const [raw, setRaw] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRaw("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = raw.trim().toLowerCase();
    if (!q) return QUESTION_ONTOLOGY;
    return QUESTION_ONTOLOGY.filter((item) => item.text.toLowerCase().includes(q) || item.domain.includes(q) || item.shortLabel.toLowerCase().includes(q));
  }, [raw]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
        }
        return;
      }
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === "Enter" && results[active]) {
        onSelect(results[active]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, onClose, onSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-24" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setActive(0);
          }}
          placeholder="Ask anything… e.g. “are we on plan”, “attrition”, “runway”"
          className="w-full border-b border-slate-200 px-5 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-slate-400">
              Not in the 20-question ontology yet — no fabricated answer will be shown.
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r)}
                className={cn("flex w-full items-center justify-between px-5 py-2.5 text-left text-sm", i === active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50")}
              >
                <span>{r.text}</span>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{r.domain}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-400">↑↓ navigate · ↵ select · esc close</div>
      </div>
    </div>
  );
}
