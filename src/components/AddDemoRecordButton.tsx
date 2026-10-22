"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { performOrQueueWrite } from "@/lib/offline/queue";
import type { DomainScope, EngineRecordType } from "@/db/schema";

const TEMPLATES: Record<DomainScope, { type: EngineRecordType; templateKey: string; params: Record<string, string | number> }> = {
  people: {
    type: "finding",
    templateKey: "finding.metric",
    params: { metricName: "retention", value: 92, unit: "%", trendDirection: "up", trendValue: 1, affectedCount: 3 },
  },
  finance: {
    type: "finding",
    templateKey: "finding.metric",
    params: { metricName: "operating margin", value: 19, unit: "%", trendDirection: "flat", trendValue: 0, affectedCount: 2 },
  },
  strategy: {
    type: "playbook",
    templateKey: "playbook.action",
    params: { playbookName: "New initiative", teamName: "Core team", actionCount: 2, metricName: "pipeline coverage", windowDays: 7 },
  },
  operations: {
    type: "finding",
    templateKey: "finding.metric",
    params: { metricName: "on-time delivery", value: 88, unit: "%", trendDirection: "down", trendValue: 2, affectedCount: 1 },
  },
};

export function AddDemoRecordButton({ orgId, domain }: { orgId: string; domain: DomainScope }) {
  const { locale } = useApp();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [queued, setQueued] = useState(false);

  async function add() {
    setPending(true);
    setQueued(false);
    const template = TEMPLATES[domain];
    const result = await performOrQueueWrite({
      method: "POST",
      url: `/api/orgs/${orgId}/records`,
      body: { ...template, domain },
      description: `New ${domain} record`,
    });
    if (result.status === "queued") {
      setQueued(true);
    } else {
      router.refresh();
    }
    setPending(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="lx-tap-target rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white"
      >
        {pending ? t(locale, "common.loading") : "+ Add demo record"}
      </button>
      {queued && (
        <p className="lx-muted mt-2 text-xs text-amber-700" role="status">
          {t(locale, "common.offline")}
        </p>
      )}
    </div>
  );
}
