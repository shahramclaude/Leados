"use client";

import { useEffect, useMemo, useState } from "react";
import type { Finding } from "@/db/schema";
import type { Role } from "@/lib/domain/types";
import { useT } from "@/components/providers/LocaleProvider";
import { useA11y } from "@/components/providers/A11yProvider";
import { SeverityBadge } from "@/components/SeverityBadge";
import { EmptyState, WhatIsThis } from "@/components/EmptyState";
import { PermissionGate } from "@/components/PermissionGate";
import { briefingNarrative, findingNarrative, renderNarrative } from "@/lib/domain/narratives";
import { resolveTerm } from "@/lib/domain/terminology";
import { enqueueMutation, getConflicts, getQueue, resolveConflict, type ConflictRecord } from "@/lib/offlineQueue";

interface DashboardOrg {
  id: string;
  name: string;
  terminology: Record<string, string>;
  accentColor: string;
}

export function DashboardClient({
  role,
  org,
  user,
  initialFindings,
}: {
  role: Role;
  org: DashboardOrg;
  user: { name: string };
  initialFindings: Finding[];
}) {
  const t = useT();
  const { plainLanguage } = useA11y();
  const [findings, setFindings] = useState<Finding[]>(initialFindings);
  const [queuedCount, setQueuedCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", team: resolveTerm("team", org.terminology), severity: 3, summary: "" });

  const teamLabel = resolveTerm("team", org.terminology);
  const findingLabel = resolveTerm("finding", org.terminology);

  useEffect(() => {
    function refresh() {
      setQueuedCount(getQueue().length);
      setConflicts(getConflicts());
    }
    refresh();
    window.addEventListener("leados:offline-queue-changed", refresh);
    return () => window.removeEventListener("leados:offline-queue-changed", refresh);
  }, []);

  const openCount = findings.filter((f) => f.status === "open").length;
  const criticalCount = findings.filter((f) => f.status === "open" && f.severity >= 4).length;

  const briefingText = useMemo(
    () => renderNarrative(briefingNarrative(openCount, criticalCount, org.terminology, plainLanguage), t),
    [openCount, criticalCount, org.terminology, plainLanguage, t],
  );

  async function submitFinding(e: React.FormEvent) {
    e.preventDefault();
    const clientMutationId = crypto.randomUUID();
    const body = { ...form, domain: "general", clientMutationId };

    const optimistic: Finding = {
      id: `pending-${clientMutationId}`,
      orgId: org.id,
      title: form.title,
      domain: "general",
      team: form.team,
      severity: form.severity,
      status: "open",
      summary: form.summary,
      isSample: false,
      clientMutationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setFindings((prev) => [optimistic, ...prev]);
    setForm({ title: "", team: teamLabel, severity: 3, summary: "" });

    if (!navigator.onLine) {
      enqueueMutation({ id: clientMutationId, method: "POST", url: "/api/findings", body });
      return;
    }

    try {
      const res = await fetch("/api/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setFindings((prev) => prev.map((f) => (f.id === optimistic.id ? data.finding : f)));
      } else if (res.status === 401) {
        setSessionError(t("error.unauthorized"));
      } else {
        enqueueMutation({ id: clientMutationId, method: "POST", url: "/api/findings", body });
      }
    } catch {
      enqueueMutation({ id: clientMutationId, method: "POST", url: "/api/findings", body });
    }
  }

  async function resolveFinding(finding: Finding) {
    const body = { id: finding.id, expectedUpdatedAt: finding.updatedAt };
    try {
      const res = await fetch("/api/findings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflicts((prev) => [...prev, { mutation: { id: finding.id, method: "PATCH", url: "/api/findings", body, createdAt: new Date().toISOString() }, serverRecord: data.finding }]);
        return;
      }
      if (res.ok) {
        setFindings((prev) => prev.map((f) => (f.id === finding.id ? data.finding : f)));
      }
    } catch {
      enqueueMutation({ id: finding.id, method: "PATCH", url: "/api/findings", body });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
      <WhatIsThis title={t("dashboard.whatIsThis.title")} body={t("dashboard.whatIsThis.body", { orgName: org.name })} />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("dashboard.briefing.title")}</h2>
        <p className="mt-1 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {t("dashboard.welcome", { name: user.name })} — {briefingText}
        </p>
      </section>

      {queuedCount > 0 ? (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t("dashboard.findings.offline.queued")} ({queuedCount})
        </p>
      ) : null}

      {sessionError ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {sessionError}
        </p>
      ) : null}

      {conflicts.map((c) => (
        <div
          key={c.mutation.id}
          role="alertdialog"
          aria-label={t("error.conflict")}
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-950"
        >
          <p className="font-semibold text-red-800 dark:text-red-200">{t("dashboard.findings.conflict.title")}</p>
          <p className="mt-1 text-red-700 dark:text-red-300">{t("dashboard.findings.conflict.body")}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                resolveConflict(c.mutation.id, "mine");
                setConflicts((prev) => prev.filter((x) => x.mutation.id !== c.mutation.id));
              }}
              className="min-h-[44px] rounded-lg border border-red-400 px-3 py-2 text-red-800 dark:text-red-200"
            >
              {t("dashboard.findings.conflict.keepMine")}
            </button>
            <button
              type="button"
              onClick={() => {
                resolveConflict(c.mutation.id, "server");
                setConflicts((prev) => prev.filter((x) => x.mutation.id !== c.mutation.id));
              }}
              className="min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-white"
            >
              {t("dashboard.findings.conflict.keepServer")}
            </button>
          </div>
        </div>
      ))}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("dashboard.findings.title")} ({findingLabel})
          </h2>
        </div>

        {findings.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={t("dashboard.findings.empty.title")}
              body={t("dashboard.findings.empty.body", { team: teamLabel })}
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {findings.map((finding) => {
              const narrative = renderNarrative(
                findingNarrative(finding, org.terminology, plainLanguage),
                t,
              );
              return (
                <li
                  key={finding.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={finding.severity} />
                      {finding.isSample ? (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          {t("dashboard.sample.badge")}
                        </span>
                      ) : null}
                      {finding.status === "resolved" ? (
                        <span className="text-xs font-medium text-emerald-700">{t("dashboard.form.resolved")}</span>
                      ) : null}
                    </div>
                    {finding.status === "open" ? (
                      <PermissionGate role={role} permission="findings:resolve" hideWhenDenied>
                        <button
                          type="button"
                          onClick={() => resolveFinding(finding)}
                          className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                        >
                          {t("dashboard.form.resolve")}
                        </button>
                      </PermissionGate>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">{narrative}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("dashboard.findings.new")}</h2>
        <PermissionGate role={role} permission="findings:create">
          <form onSubmit={submitFinding} className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("dashboard.form.title")}
              <input
                className="field"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("dashboard.form.team", { teamLabel })}
              <input
                className="field"
                value={form.team}
                onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("dashboard.form.severity")}
              <input
                type="range"
                min={1}
                max={5}
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: Number(e.target.value) }))}
                className="h-[44px]"
              />
              <SeverityBadge severity={form.severity} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("dashboard.form.summary")}
              <textarea
                className="field min-h-[80px]"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              />
            </label>
            <button type="submit" className="min-h-[44px] self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              {t("dashboard.form.submit")}
            </button>
          </form>
        </PermissionGate>
      </section>
    </div>
  );
}
