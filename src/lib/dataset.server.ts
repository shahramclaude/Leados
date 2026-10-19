import "server-only";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { DOMAINS } from "./types";
import type { DomainKey, Severity } from "./types";
import type {
  OrchestrationDataset,
  PersonRow,
  EventRow,
  OneOnOneRow,
  DecisionRow,
  ScenarioRow,
  ProjectRow,
  MilestoneRow,
  BlockerRow,
  HypothesisRow,
  OkrRow,
  NotificationRow,
  FinanceSnapshot,
} from "./dataset";

const DEFAULT_FINANCE: FinanceSnapshot = {
  startingCash: 1_000_000,
  monthlyBurn: 100_000,
  burnStdDev: 20_000,
  monthlyRevenue: 50_000,
  revenueGrowthRate: 0.05,
};

function toDomainKey(value: string): DomainKey {
  return (DOMAINS as readonly string[]).includes(value) ? (value as DomainKey) : "execution";
}

function toSeverity(value: number): Severity {
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 5 ? (rounded as Severity) : 3;
}

function toEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Fetches every table this app uses and maps raw Postgres rows into the pure,
 * validated OrchestrationDataset contract that runFullOrchestration expects.
 * Every "stringly typed" DB column (domain, status) is validated against its
 * known literal union here, at the one seam where untyped data enters the
 * typed core — nothing downstream ever has to guess about shape again.
 */
export async function fetchOrchestrationDataset(): Promise<OrchestrationDataset> {
  const [
    peopleRows,
    eventRows,
    oneOnOneRows,
    decisionRows,
    scenarioRows,
    projectRows,
    milestoneRows,
    blockerRows,
    hypothesisRows,
    okrRows,
    notificationRows,
    financeRows,
  ] = await Promise.all([
    db.select().from(schema.people),
    db.select().from(schema.events),
    db.select().from(schema.oneOnOnes),
    db.select().from(schema.decisions),
    db.select().from(schema.scenarios),
    db.select().from(schema.projects),
    db.select().from(schema.milestones),
    db.select().from(schema.blockers),
    db.select().from(schema.hypotheses),
    db.select().from(schema.okrs),
    db.select().from(schema.notifications),
    db.select().from(schema.financeSnapshots).orderBy(desc(schema.financeSnapshots.createdAt)).limit(1),
  ]);

  const people: PersonRow[] = peopleRows.map((p) => ({ id: p.id, name: p.name, role: p.role, team: p.team }));

  const events: EventRow[] = eventRows.map((e) => ({
    id: e.id,
    personId: e.personId,
    type: e.type,
    weight: e.weight,
    createdAt: e.createdAt.toISOString(),
  }));

  const oneOnOnes: OneOnOneRow[] = oneOnOneRows.map((o) => ({
    id: o.id,
    personId: o.personId,
    occurredAt: o.occurredAt.toISOString(),
    actionItemsTotal: o.actionItemsTotal,
    actionItemsCompleted: o.actionItemsCompleted,
  }));

  const decisions: DecisionRow[] = decisionRows.map((d) => ({
    id: d.id,
    title: d.title,
    domain: toDomainKey(d.domain),
    status: toEnum(d.status, ["open", "closed"] as const, "open"),
    sev: toSeverity(d.sev),
    createdAt: d.createdAt.toISOString(),
  }));

  const scenarios: ScenarioRow[] = scenarioRows.map((s) => ({
    id: s.id,
    title: s.title,
    domain: toDomainKey(s.domain),
    status: toEnum(s.status, ["active", "archived"] as const, "active"),
    sev: toSeverity(s.sev),
    createdAt: s.createdAt.toISOString(),
  }));

  const projects: ProjectRow[] = projectRows.map((p) => ({ id: p.id, name: p.name, dependsOn: p.dependsOn ?? [] }));

  const milestones: MilestoneRow[] = milestoneRows.map((m) => ({
    id: m.id,
    projectId: m.projectId,
    dueDate: m.dueDate.toISOString(),
    completed: m.completed,
  }));

  const blockers: BlockerRow[] = blockerRows.map((b) => ({
    id: b.id,
    title: b.title,
    domain: toDomainKey(b.domain),
    projectId: b.projectId,
    status: toEnum(b.status, ["open", "resolved"] as const, "open"),
    sev: toSeverity(b.sev),
    createdAt: b.createdAt.toISOString(),
  }));

  const hypotheses: HypothesisRow[] = hypothesisRows.map((h) => ({
    id: h.id,
    personId: h.personId,
    type: h.type,
    title: h.title,
    sev: toSeverity(h.sev),
    status: toEnum(h.status, ["open", "dismissed", "confirmed"] as const, "open"),
    dedupeKey: h.dedupeKey,
    createdAt: h.createdAt.toISOString(),
  }));

  const okrs: OkrRow[] = okrRows.map((o) => ({
    id: o.id,
    title: o.title,
    domain: toDomainKey(o.domain),
    progress: o.progress,
    timeElapsed: o.timeElapsed,
  }));

  const notifications: NotificationRow[] = notificationRows.map((n) => ({
    id: n.id,
    domain: toDomainKey(n.domain),
    title: n.title,
    message: n.message,
    sev: toSeverity(n.sev),
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  const finance: FinanceSnapshot = financeRows[0]
    ? {
        startingCash: financeRows[0].startingCash,
        monthlyBurn: financeRows[0].monthlyBurn,
        burnStdDev: financeRows[0].burnStdDev,
        monthlyRevenue: financeRows[0].monthlyRevenue,
        revenueGrowthRate: financeRows[0].revenueGrowthRate,
      }
    : DEFAULT_FINANCE;

  return { people, events, oneOnOnes, decisions, scenarios, projects, milestones, blockers, hypotheses, okrs, notifications, finance };
}

export async function markAllNotificationsRead(): Promise<number> {
  const result = await db
    .update(schema.notifications)
    .set({ read: true })
    .where(eq(schema.notifications.read, false))
    .returning({ id: schema.notifications.id });
  return result.length;
}
