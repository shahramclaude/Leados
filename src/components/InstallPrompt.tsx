"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/providers/LocaleProvider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const t = useT();

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred) return null;

  return (
    <div className="fixed bottom-20 left-4 right-20 z-40 flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-lg sm:bottom-4 sm:left-4 sm:right-auto sm:w-80 dark:border-slate-600 dark:bg-slate-900">
      <div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">{t("pwa.install.title")}</p>
        <p className="text-slate-600 dark:text-slate-400">{t("pwa.install.body")}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
        className="min-h-[44px] shrink-0 rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white"
      >
        {t("pwa.install.action")}
      </button>
    </div>
  );
}
