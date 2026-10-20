"use client";

import { useT } from "@/components/providers/LocaleProvider";

export default function OfflinePage() {
  const t = useT();
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("pwa.offline.title")}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("pwa.offline.body")}</p>
      </div>
    </main>
  );
}
