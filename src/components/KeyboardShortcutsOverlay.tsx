"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/providers/LocaleProvider";

const SHORTCUTS: Array<{ keys: string; labelKey: string; path?: string }> = [
  { keys: "g d", labelKey: "shortcut.goDashboard", path: "/dashboard" },
  { keys: "g s", labelKey: "shortcut.goSettings", path: "/admin/settings" },
  { keys: "/", labelKey: "shortcut.openPalette" },
  { keys: "?", labelKey: "shortcut.toggleShortcuts" },
];

/**
 * Keyboard-shortcut discoverability: pressing `?` anywhere opens an overlay
 * listing every shortcut (nothing hidden, nothing hover-only).
 */
export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setPendingG(false);
        return;
      }
      if (e.key === "g") {
        setPendingG(true);
        window.setTimeout(() => setPendingG(false), 1200);
        return;
      }
      if (pendingG && e.key === "d") {
        setPendingG(false);
        router.push("/dashboard");
      }
      if (pendingG && e.key === "s") {
        setPendingG(false);
        router.push("/admin/settings");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingG, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("a11y.shortcuts.open")}
        className="fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-semibold text-slate-700 shadow-md sm:bottom-4 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        ?
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("a11y.shortcuts.title")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("a11y.shortcuts.title")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t("a11y.shortcuts.close")}
              </button>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{t(s.labelKey)}</span>
                  <kbd className="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
