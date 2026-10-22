import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { createRecord, listRecords } from "@/lib/repo/engineRecords";
import { markOnboardingComplete } from "@/lib/repo/orgs";

export const dynamic = "force-dynamic";

const SAMPLE_SET: { type: "briefing" | "finding" | "playbook"; domain: "people" | "finance" | "strategy"; templateKey: string; params: Record<string, string | number> }[] = [
  {
    type: "briefing",
    domain: "people",
    templateKey: "briefing.weekly",
    params: { weekStart: "2026-01-05", headlineCount: 3, metricName: "retention", trendDirection: "up", trendValue: 4 },
  },
  {
    type: "finding",
    domain: "finance",
    templateKey: "finding.metric",
    params: { metricName: "operating margin", value: 18, unit: "%", trendDirection: "up", trendValue: 2, affectedCount: 4 },
  },
  {
    type: "playbook",
    domain: "strategy",
    templateKey: "playbook.action",
    params: { playbookName: "Q1 focus reset", teamName: "Growth", actionCount: 3, metricName: "pipeline coverage", windowDays: 14 },
  },
];

export async function POST() {
  const result = await requireContext("POST", "/api/onboarding/seed");
  if ("error" in result) return result.error;
  const { ctx } = result;

  const existing = await listRecords(ctx.orgId);
  if (existing.length === 0) {
    for (const sample of SAMPLE_SET) {
      await createRecord(ctx.orgId, { ...sample, createdBy: ctx.userId, seeded: true });
    }
  }
  await markOnboardingComplete(ctx.orgId);

  return NextResponse.json({ ok: true, added: existing.length === 0 ? SAMPLE_SET.length : 0 });
}
