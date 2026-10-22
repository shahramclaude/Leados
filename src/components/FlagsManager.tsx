"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/format";

type Flag = { id: string; key: string; enabled: boolean; updatedAt: string };
type AuditEntry = { id: string; flagKey: string; action: string; createdAt: string };

export function FlagsManager({ flags, audit }: { flags: Flag[]; audit: AuditEntry[] }) {
  const { locale } = useApp();
  const router = useRouter();
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFlag() {
    if (!newKey.trim()) return;
    setBusy(true);
    await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey.trim() }),
    });
    setNewKey("");
    setBusy(false);
    router.refresh();
  }

  async function toggle(key: string, enabled: boolean) {
    setBusy(true);
    await fetch("/api/admin/flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: !enabled }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="lx-surface rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">{t(locale, "admin.flags.title")}</h2>
        <p className="lx-muted text-sm text-slate-600">{t(locale, "admin.flags.hint")}</p>

        <ul className="mt-4 grid gap-3">
          {flags.map((flag) => (
            <li key={flag.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <span className="font-mono text-sm text-slate-800">{flag.key}</span>
              <button
                type="button"
                onClick={() => toggle(flag.key, flag.enabled)}
                disabled={busy}
                className={`lx-tap-target rounded-lg px-4 py-2 text-xs font-semibold ${
                  flag.enabled ? "bg-green-600 text-white" : "border border-slate-300 text-slate-700"
                }`}
              >
                {flag.enabled ? t(locale, "admin.flags.disable") : t(locale, "admin.flags.enable")}
              </button>
            </li>
          ))}
          {flags.length === 0 && <li className="lx-muted text-sm text-slate-500">{t(locale, "common.noResults")}</li>}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="feature.key"
            className="lx-tap-target flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createFlag}
            disabled={busy}
            className="lx-tap-target rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            {t(locale, "common.save")}
          </button>
        </div>
      </div>

      <div className="lx-surface rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">{t(locale, "admin.flags.auditTitle")}</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {audit.map((entry) => (
            <li key={entry.id}>
              {t(locale, "admin.flags.auditEntry", {
                actor: "admin",
                action: entry.action,
                flag: entry.flagKey,
                relativeTime: formatRelativeTime(locale, entry.createdAt),
              })}
            </li>
          ))}
          {audit.length === 0 && <li className="lx-muted text-slate-500">{t(locale, "common.noResults")}</li>}
        </ul>
      </div>
    </div>
  );
}
