// LEADOS — Part 38: nightly assurance report generator.
//
// Produces one versioned document per report date: check results, drift
// trends, remediation actions taken, open findings, and a MANDATORY
// blind-spot appendix. A "zero-filler lint" runs over the generated content
// before it is persisted — every section must either contain concrete items
// or an explicit "No events in this period" statement; generic placeholder
// text ("TBD", "N/A", "lorem", etc.) fails the lint and the report is
// rejected rather than silently published with filler.

import { db } from "@/db";
import {
  assuranceRuns,
  boardPackRollups,
  driftSeries,
  findings,
  nightlyReports,
  remediationActions,
} from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { SYSTEM_BLIND_SPOTS } from "@/lib/assurance/blindSpots";
import { appendAudit } from "@/lib/audit";

const FILLER_PATTERNS = [/\bTBD\b/i, /\bN\/A\b/i, /\blorem ipsum\b/i, /\bplaceholder\b/i, /\bcoming soon\b/i];

export interface ReportSection<T> {
  title: string;
  items: T[];
  emptyStatement: string | null; // non-null only when items is empty AND that absence is itself stated
}

export interface NightlyReportContent {
  reportDate: string;
  generatedAt: string;
  checkResults: ReportSection<{ checkId: string; name: string; domain: string; status: string; summary: string }>;
  driftFlags: ReportSection<{ checkId: string; metricKey: string; value: number; baseline: number }>;
  remediationActions: ReportSection<{ checkId: string; tier: string; action: string; status: string }>;
  openFindings: ReportSection<{ id: number; checkId: string | null; severity: string; title: string }>;
  blindSpotAppendix: {
    perCheck: Array<{ checkId: string; blindSpots: string[] }>;
    systemLevel: Array<{ id: string; description: string; whyUnavoidable: string; mitigation: string }>;
  };
}

export function lintReportForFiller(content: NightlyReportContent): string[] {
  const problems: string[] = [];
  const serialized = JSON.stringify(content);
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(serialized)) {
      problems.push(`Filler text matching ${pattern} found in report content.`);
    }
  }
  const sections: Array<ReportSection<unknown>> = [
    content.checkResults,
    content.driftFlags,
    content.remediationActions,
    content.openFindings,
  ];
  for (const section of sections) {
    if (section.items.length === 0 && !section.emptyStatement) {
      problems.push(`Section '${section.title}' is empty but has no explicit empty-statement.`);
    }
  }
  if (content.blindSpotAppendix.perCheck.length === 0 && content.blindSpotAppendix.systemLevel.length === 0) {
    problems.push("Blind-spot appendix is empty — every nightly report must carry a blind-spot appendix.");
  }
  for (const entry of content.blindSpotAppendix.perCheck) {
    if (!entry.blindSpots || entry.blindSpots.length === 0) {
      problems.push(`Check '${entry.checkId}' has no blind spots listed in the appendix.`);
    }
  }
  return problems;
}

export async function buildNightlyReportContent(reportDate: string): Promise<NightlyReportContent> {
  const dayStart = new Date(`${reportDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${reportDate}T23:59:59.999Z`);

  const runs = await db
    .select()
    .from(assuranceRuns)
    .where(and(gte(assuranceRuns.runAt, dayStart), lte(assuranceRuns.runAt, dayEnd)));

  const checkResultsItems = runs.map((r) => {
    const check = CHECK_REGISTRY.find((c) => c.id === r.checkId);
    return {
      checkId: r.checkId,
      name: check?.name ?? r.checkId,
      domain: check?.domain ?? "unknown",
      status: r.status,
      summary:
        (r.details as { summary?: string } | null)?.summary ??
        `Run completed with status '${r.status}'.`,
    };
  });

  const drifts = await db
    .select()
    .from(driftSeries)
    .where(and(eq(driftSeries.flagged, true), gte(driftSeries.windowEnd, dayStart), lte(driftSeries.windowEnd, dayEnd)));

  const remediations = await db
    .select()
    .from(remediationActions)
    .where(and(gte(remediationActions.createdAt, dayStart), lte(remediationActions.createdAt, dayEnd)));

  const openFindingsRows = await db.select().from(findings).where(eq(findings.status, "open"));

  const touchedCheckIds = new Set<string>([
    ...checkResultsItems.filter((c) => c.status !== "pass").map((c) => c.checkId),
    ...drifts.map((d) => d.checkId),
  ]);

  return {
    reportDate,
    generatedAt: new Date().toISOString(),
    checkResults: {
      title: "Check results",
      items: checkResultsItems,
      emptyStatement: checkResultsItems.length === 0 ? "No checks executed in this period." : null,
    },
    driftFlags: {
      title: "Drift trends flagged",
      items: drifts.map((d) => ({ checkId: d.checkId, metricKey: d.metricKey, value: d.value, baseline: d.baseline })),
      emptyStatement: drifts.length === 0 ? "No statistical drift (EWMA/CUSUM) flagged in this period." : null,
    },
    remediationActions: {
      title: "Remediation actions taken",
      items: remediations.map((r) => ({ checkId: r.checkId, tier: r.tier, action: r.action, status: r.status })),
      emptyStatement: remediations.length === 0 ? "No remediation actions were triggered in this period." : null,
    },
    openFindings: {
      title: "Open findings",
      items: openFindingsRows.map((f) => ({ id: f.id, checkId: f.checkId, severity: f.severity, title: f.title })),
      emptyStatement: openFindingsRows.length === 0 ? "No open findings as of report generation." : null,
    },
    blindSpotAppendix: {
      perCheck: CHECK_REGISTRY.filter((c) => touchedCheckIds.has(c.id) || true).map((c) => ({
        checkId: c.id,
        blindSpots: c.blindSpots,
      })),
      systemLevel: SYSTEM_BLIND_SPOTS.map((s) => ({
        id: s.id,
        description: s.description,
        whyUnavoidable: s.whyUnavoidable,
        mitigation: s.mitigation,
      })),
    },
  };
}

export async function generateNightlyReport(reportDate: string) {
  const content = await buildNightlyReportContent(reportDate);
  const lintProblems = lintReportForFiller(content);
  if (lintProblems.length > 0) {
    throw new Error(`Zero-filler lint failed for ${reportDate}: ${lintProblems.join("; ")}`);
  }

  const existingVersions = await db
    .select()
    .from(nightlyReports)
    .where(eq(nightlyReports.reportDate, reportDate))
    .orderBy(desc(nightlyReports.version));

  const version = (existingVersions[0]?.version ?? 0) + 1;

  const [row] = await db
    .insert(nightlyReports)
    .values({ reportDate, version, content: content as unknown as object })
    .returning();

  await appendAudit({
    actor: "assurance-system",
    action: "report.generate",
    entityType: "nightly_report",
    entityId: `${reportDate}#v${version}`,
    afterState: { id: row.id, reportDate, version },
  });

  return row;
}

export async function getLatestReport(reportDate?: string) {
  const query = db.select().from(nightlyReports);
  const rows = reportDate
    ? await query.where(eq(nightlyReports.reportDate, reportDate)).orderBy(desc(nightlyReports.version))
    : await query.orderBy(desc(nightlyReports.reportDate), desc(nightlyReports.version));
  return rows[0] ?? null;
}

export async function generateMonthlyRollup(monthKey: string) {
  const reports = await db.select().from(nightlyReports);
  const inMonth = reports.filter((r) => r.reportDate.startsWith(monthKey));

  const summary = {
    monthKey,
    nightlyReportsCount: inMonth.length,
    breachDays: inMonth.filter((r) => {
      const content = r.content as unknown as NightlyReportContent;
      return content.checkResults.items.some((c) => c.status === "breach");
    }).length,
    totalRemediations: inMonth.reduce((acc, r) => {
      const content = r.content as unknown as NightlyReportContent;
      return acc + content.remediationActions.items.length;
    }, 0),
    blindSpotCount: SYSTEM_BLIND_SPOTS.length + CHECK_REGISTRY.reduce((a, c) => a + c.blindSpots.length, 0),
    note:
      inMonth.length === 0
        ? "No nightly reports were generated in this month — rollup reflects an empty period, not system health."
        : `Rolled up from ${inMonth.length} nightly report(s) for Part 32's board pack.`,
  };

  const existing = await db
    .select()
    .from(boardPackRollups)
    .where(eq(boardPackRollups.monthKey, monthKey))
    .orderBy(desc(boardPackRollups.version));
  const version = (existing[0]?.version ?? 0) + 1;

  const [row] = await db
    .insert(boardPackRollups)
    .values({ monthKey, version, summary })
    .returning();

  await appendAudit({
    actor: "assurance-system",
    action: "report.monthly_rollup",
    entityType: "board_pack_rollup",
    entityId: `${monthKey}#v${version}`,
    afterState: { id: row.id, monthKey, version },
  });

  return row;
}
