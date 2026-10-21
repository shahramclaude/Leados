// Shared logic between the `/` server-rendered Now surface and the
// `/api/now` JSON endpoint (used by client-side refreshes), so both stay in
// lockstep and there is exactly one implementation of "what matters now".

import { db } from "@/db";
import { approvals, findings, lastVisit } from "@/db/schema";
import { visibleDomainsForRole } from "@/lib/scoping";
import { countEventsSince, latestEventId } from "@/lib/eventStore";
import { eq, inArray, ne } from "drizzle-orm";

function urgencyScore(urgencyHours: number): number {
  return 100 / Math.max(1, urgencyHours);
}

export interface Decision {
  kind: "finding" | "approval";
  id: string;
  title: string;
  domain: string;
  severity: number;
  score: number;
  entityRef: string | null;
  evidence: string;
}

export interface NowSurfaceData {
  topDecisions: Decision[];
  recommendedAction: Decision | null;
  pendingApprovals: Array<typeof approvals.$inferSelect>;
  delta: {
    isFirstVisit: boolean;
    totalChanges: number;
    byDomain: Record<string, number>;
    byType: Record<string, number>;
    recentTitles: Array<{ type: string; domain: string; entityRef: string | null; createdAt: string }>;
  };
  isEmptyOrg: boolean;
}

export async function loadNowSurface(userId: string, role: string, recordVisit = true): Promise<NowSurfaceData> {
  const domains = await visibleDomainsForRole(role);
  const domainList = [...domains];
  const seesAll = domainList.includes("*");

  const [openFindings, pendingApprovalsRaw] = await Promise.all([
    db
      .select()
      .from(findings)
      .where(seesAll ? ne(findings.status, "__never__") : inArray(findings.domain, domainList.length ? domainList : ["__none__"])),
    db
      .select()
      .from(approvals)
      .where(seesAll ? ne(approvals.status, "__never__") : inArray(approvals.domain, domainList.length ? domainList : ["__none__"])),
  ]);

  const openFindingsFiltered = openFindings.filter((f) => f.status === "open");
  const pendingApprovalsFiltered = pendingApprovalsRaw.filter((a) => a.status === "pending");

  const decisions: Decision[] = [
    ...openFindingsFiltered.map((f) => ({
      kind: "finding" as const,
      id: f.id,
      title: f.title,
      domain: f.domain,
      severity: f.severity,
      score: f.severity * urgencyScore(f.urgencyHours),
      entityRef: f.entityRef,
      evidence: f.evidence,
    })),
    ...pendingApprovalsFiltered.map((a) => ({
      kind: "approval" as const,
      id: a.id,
      title: a.title,
      domain: a.domain,
      severity: a.severity,
      score: a.severity * urgencyScore(a.severity >= 5 ? 2 : 48),
      entityRef: a.entityRef,
      evidence: `Requested for role: ${a.requestedForRole}`,
    })),
  ].sort((a, b) => b.score - a.score);

  const top3 = decisions.slice(0, 3);
  const recommended = top3[0] ?? null;

  const [existingVisit] = await db.select().from(lastVisit).where(eq(lastVisit.userId, userId)).limit(1);
  const since = existingVisit?.lastEventId ?? 0;
  const changedEvents = await countEventsSince(since, [role]);

  const byDomain = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const e of changedEvents) {
    byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + 1);
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  }

  const delta = {
    isFirstVisit: !existingVisit,
    totalChanges: changedEvents.length,
    byDomain: Object.fromEntries(byDomain),
    byType: Object.fromEntries(byType),
    recentTitles: changedEvents.slice(-5).reverse().map((e) => ({
      type: e.type,
      domain: e.domain,
      entityRef: e.entityRef,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
    })),
  };

  if (recordVisit) {
    const current = await latestEventId();
    if (existingVisit) {
      await db.update(lastVisit).set({ lastEventId: current, lastVisitedAt: new Date() }).where(eq(lastVisit.userId, userId));
    } else {
      await db.insert(lastVisit).values({ userId, lastEventId: current });
    }
  }

  return {
    topDecisions: top3,
    recommendedAction: recommended,
    pendingApprovals: pendingApprovalsFiltered,
    delta,
    isEmptyOrg: openFindingsFiltered.length === 0 && pendingApprovalsFiltered.length === 0,
  };
}
