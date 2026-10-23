import { db } from "@/db";
import {
  users,
  decisions,
  decisionEvents,
  signals,
  cadenceMeetings,
  agentRuns,
  leaderStateEntries,
  type NewDecision,
  type NewSignal,
  type NewCadenceMeeting,
  type NewAgentRun,
  type NewLeaderStateEntry,
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers() {
  return db.select().from(users).orderBy(users.name);
}

export async function getDefaultUser() {
  const [user] = await db.select().from(users).orderBy(users.id).limit(1);
  return user ?? null;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function listDecisions() {
  return db
    .select({
      id: decisions.id,
      title: decisions.title,
      description: decisions.description,
      status: decisions.status,
      impact: decisions.impact,
      confidence: decisions.confidence,
      rationale: decisions.rationale,
      createdAt: decisions.createdAt,
      decidedAt: decisions.decidedAt,
      ownerId: decisions.ownerId,
      ownerName: users.name,
    })
    .from(decisions)
    .leftJoin(users, eq(decisions.ownerId, users.id))
    .orderBy(desc(decisions.createdAt));
}

export async function getDecision(id: number) {
  const [row] = await db
    .select({
      id: decisions.id,
      title: decisions.title,
      description: decisions.description,
      status: decisions.status,
      impact: decisions.impact,
      confidence: decisions.confidence,
      rationale: decisions.rationale,
      createdAt: decisions.createdAt,
      decidedAt: decisions.decidedAt,
      ownerId: decisions.ownerId,
      ownerName: users.name,
    })
    .from(decisions)
    .leftJoin(users, eq(decisions.ownerId, users.id))
    .where(eq(decisions.id, id));
  return row ?? null;
}

export async function listDecisionEvents(decisionId: number) {
  return db
    .select()
    .from(decisionEvents)
    .where(eq(decisionEvents.decisionId, decisionId))
    .orderBy(desc(decisionEvents.createdAt));
}

export async function createDecision(input: NewDecision) {
  const [row] = await db.insert(decisions).values(input).returning();
  await db.insert(decisionEvents).values({
    decisionId: row.id,
    type: "created",
    actor: "user",
    payload: { title: row.title, impact: row.impact, status: row.status },
  });
  return row;
}

export async function addDecisionEvent(
  decisionId: number,
  type: string,
  actor: string,
  payload: Record<string, unknown>,
) {
  const [row] = await db
    .insert(decisionEvents)
    .values({ decisionId, type, actor, payload })
    .returning();
  return row;
}

export async function updateDecisionStatus(
  id: number,
  status: "proposed" | "under_review" | "committed" | "reversed",
  actor = "user",
) {
  const decidedAt = status === "committed" ? new Date() : undefined;
  const [row] = await db
    .update(decisions)
    .set({ status, ...(decidedAt ? { decidedAt } : {}) })
    .where(eq(decisions.id, id))
    .returning();
  if (row) {
    await addDecisionEvent(id, "status_changed", actor, { status });
  }
  return row ?? null;
}

export async function addDecisionComment(id: number, comment: string, actor = "user") {
  return addDecisionEvent(id, "comment", actor, { comment });
}

export async function countDecisionsByStatus() {
  return db
    .select({ status: decisions.status, count: sql<number>`count(*)::int` })
    .from(decisions)
    .groupBy(decisions.status);
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export async function listSignals() {
  return db.select().from(signals).orderBy(desc(signals.createdAt));
}

export async function createSignal(input: NewSignal) {
  const [row] = await db.insert(signals).values(input).returning();
  return row;
}

export async function updateSignalStatus(
  id: number,
  status: "new" | "investigating" | "resolved" | "dismissed",
) {
  const [row] = await db
    .update(signals)
    .set({ status, updatedAt: new Date() })
    .where(eq(signals.id, id))
    .returning();
  return row ?? null;
}

export async function countOpenSignalsBySeverity() {
  return db
    .select({ severity: signals.severity, count: sql<number>`count(*)::int` })
    .from(signals)
    .where(sql`${signals.status} not in ('resolved', 'dismissed')`)
    .groupBy(signals.severity);
}

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export async function listCadenceMeetings() {
  return db
    .select({
      id: cadenceMeetings.id,
      title: cadenceMeetings.title,
      type: cadenceMeetings.type,
      status: cadenceMeetings.status,
      nextOccurrence: cadenceMeetings.nextOccurrence,
      effectivenessScore: cadenceMeetings.effectivenessScore,
      notes: cadenceMeetings.notes,
      createdAt: cadenceMeetings.createdAt,
      ownerId: cadenceMeetings.ownerId,
      ownerName: users.name,
    })
    .from(cadenceMeetings)
    .leftJoin(users, eq(cadenceMeetings.ownerId, users.id))
    .orderBy(cadenceMeetings.nextOccurrence);
}

export async function createCadenceMeeting(input: NewCadenceMeeting) {
  const [row] = await db.insert(cadenceMeetings).values(input).returning();
  return row;
}

export async function updateCadenceMeeting(
  id: number,
  patch: Partial<{
    status: "scheduled" | "completed" | "skipped";
    effectivenessScore: number | null;
    nextOccurrence: Date;
  }>,
) {
  const [row] = await db
    .update(cadenceMeetings)
    .set(patch)
    .where(eq(cadenceMeetings.id, id))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------

export async function listAgentRuns() {
  return db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt));
}

export async function createAgentRun(input: NewAgentRun) {
  const [row] = await db.insert(agentRuns).values(input).returning();
  return row;
}

export async function updateAgentRun(
  id: number,
  patch: Partial<{
    status: "queued" | "running" | "succeeded" | "failed";
    output: Record<string, unknown>;
    summary: string;
    startedAt: Date;
    finishedAt: Date;
  }>,
) {
  const [row] = await db.update(agentRuns).set(patch).where(eq(agentRuns.id, id)).returning();
  return row ?? null;
}

// Simulates a lightweight autonomous agent executing a named playbook.
export async function runAgentPlaybook(name: string, input: Record<string, unknown>) {
  const run = await createAgentRun({
    name,
    status: "running",
    input,
    output: {},
    summary: `Agent "${name}" started.`,
    startedAt: new Date(),
  });

  const playbooks: Record<string, () => { summary: string; output: Record<string, unknown> }> = {
    "signal-triage": () => ({
      summary: "Scanned open signals, flagged highest severity items for executive review.",
      output: { reviewed: Math.floor(Math.random() * 12) + 3, escalated: Math.floor(Math.random() * 3) },
    }),
    "cadence-optimizer": () => ({
      summary: "Analyzed meeting cadence effectiveness and proposed consolidation of low-value recurring meetings.",
      output: { meetingsAnalyzed: Math.floor(Math.random() * 10) + 5, consolidationCandidates: Math.floor(Math.random() * 3) },
    }),
    "decision-digest": () => ({
      summary: "Compiled a digest of decisions pending executive commit, ranked by impact and confidence.",
      output: { pendingDecisions: Math.floor(Math.random() * 8) + 1 },
    }),
    "leader-load-check": () => ({
      summary: "Computed rolling decision-load index across leadership team; no critical overload detected.",
      output: { averageLoad: Math.floor(Math.random() * 40) + 30 },
    }),
  };

  const handler = playbooks[name] ?? (() => ({ summary: `Agent "${name}" completed with no registered playbook.`, output: {} }));
  const result = handler();

  const finished = await updateAgentRun(run.id, {
    status: "succeeded",
    output: result.output,
    summary: result.summary,
    finishedAt: new Date(),
  });

  return finished ?? run;
}

// ---------------------------------------------------------------------------
// Leader state
// ---------------------------------------------------------------------------

export async function listLeaderStateEntries(userId?: number) {
  const query = db
    .select({
      id: leaderStateEntries.id,
      userId: leaderStateEntries.userId,
      userName: users.name,
      date: leaderStateEntries.date,
      decisionLoadScore: leaderStateEntries.decisionLoadScore,
      stressIndex: leaderStateEntries.stressIndex,
      focusHours: leaderStateEntries.focusHours,
      notes: leaderStateEntries.notes,
    })
    .from(leaderStateEntries)
    .leftJoin(users, eq(leaderStateEntries.userId, users.id))
    .orderBy(desc(leaderStateEntries.date));

  if (userId) {
    return query.where(eq(leaderStateEntries.userId, userId));
  }
  return query;
}

export async function createLeaderStateEntry(input: NewLeaderStateEntry) {
  const [row] = await db.insert(leaderStateEntries).values(input).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Cockpit aggregates
// ---------------------------------------------------------------------------

export async function getCockpitSummary() {
  const [decisionStatusCounts, openSignalCounts, upcomingCadence, recentRuns, recentDecisions, recentSignals] =
    await Promise.all([
      countDecisionsByStatus(),
      countOpenSignalsBySeverity(),
      db
        .select({
          id: cadenceMeetings.id,
          title: cadenceMeetings.title,
          type: cadenceMeetings.type,
          nextOccurrence: cadenceMeetings.nextOccurrence,
          status: cadenceMeetings.status,
        })
        .from(cadenceMeetings)
        .where(eq(cadenceMeetings.status, "scheduled"))
        .orderBy(cadenceMeetings.nextOccurrence)
        .limit(5),
      db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(5),
      listDecisions(),
      listSignals(),
    ]);

  return {
    decisionStatusCounts,
    openSignalCounts,
    upcomingCadence,
    recentRuns,
    totalDecisions: recentDecisions.length,
    openDecisions: recentDecisions.filter((d) => d.status !== "committed" && d.status !== "reversed").length,
    criticalSignals: recentSignals.filter(
      (s) => s.severity === "critical" && s.status !== "resolved" && s.status !== "dismissed",
    ).length,
    recentDecisions: recentDecisions.slice(0, 5),
    recentSignals: recentSignals.slice(0, 5),
  };
}
