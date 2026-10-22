// LEADOS Part 25 — the cadence graph is DATA, not hard-coded cron.
// This module seeds a default graph (daily brief -> weekly review -> monthly
// business review -> quarterly strategy -> annual plan) into the `rituals`
// table and provides a read helper that returns nodes + dependency edges for
// the Rhythm Board. Nothing here is a cron job: every node is a row an org
// admin can edit, delete, or add to via POST /api/cadence/rituals.
import { db } from "@/db";
import { rituals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ArtifactRef, Ritual, RitualAnchor, RitualKind, SignalRef } from "./types";

export interface RitualRow {
  id: string;
  orgId: string;
  kind: RitualKind;
  name: string;
  participantRoles: string[];
  inputsSpec: SignalRef[];
  outputsSpec: ArtifactRef[];
  durationMinutes: number;
  quorum: number;
  timezone: string;
  anchor: RitualAnchor;
  dependsOnRitualId: string | null;
  active: boolean;
}

function rowToRitual(row: typeof rituals.$inferSelect): Ritual {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind as RitualKind,
    name: row.name,
    participantRoles: row.participantRoles as string[],
    inputs: row.inputsSpec as SignalRef[],
    outputs: row.outputsSpec as ArtifactRef[],
    durationMinutes: row.durationMinutes,
    quorum: row.quorum,
    timezone: row.timezone,
    anchor: row.anchor as RitualAnchor,
    dependsOnRitualId: row.dependsOnRitualId,
    active: row.active,
  };
}

export async function listRituals(orgId: string): Promise<Ritual[]> {
  const rows = await db.select().from(rituals).where(eq(rituals.orgId, orgId));
  return rows.map(rowToRitual);
}

export async function getRitual(ritualId: string): Promise<Ritual | null> {
  const [row] = await db.select().from(rituals).where(eq(rituals.id, ritualId)).limit(1);
  return row ? rowToRitual(row) : null;
}

export async function createRitual(input: Omit<Ritual, "id">): Promise<Ritual> {
  const [row] = await db
    .insert(rituals)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      name: input.name,
      participantRoles: input.participantRoles,
      inputsSpec: input.inputs,
      outputsSpec: input.outputs,
      durationMinutes: input.durationMinutes,
      quorum: input.quorum,
      timezone: input.timezone,
      anchor: input.anchor,
      dependsOnRitualId: input.dependsOnRitualId,
      active: input.active,
    })
    .returning();
  return rowToRitual(row);
}

/** Nodes + dependency edges, for the Rhythm Board's graph rendering. */
export async function getCadenceGraph(orgId: string): Promise<{
  nodes: Ritual[];
  edges: Array<{ from: string; to: string }>; // from feeds into to (weekly -> monthly)
}> {
  const nodes = await listRituals(orgId);
  const edges = nodes
    .filter((n) => n.dependsOnRitualId)
    .map((n) => ({ from: n.dependsOnRitualId as string, to: n.id }));
  return { nodes, edges };
}

/** Seeds the canonical default graph for a fresh org, idempotently (checks
 * for an existing ritual of each kind first — this is a convenience
 * bootstrap, not a migration). Returns the created/found rituals keyed by kind. */
export async function seedDefaultCadenceGraph(orgId: string, timezone = "UTC"): Promise<Record<RitualKind, Ritual>> {
  async function findOrCreate(kind: RitualKind, build: (dependsOnRitualId: string | null) => Omit<Ritual, "id">, dependsOnRitualId: string | null): Promise<Ritual> {
    const [existing] = await db.select().from(rituals).where(and(eq(rituals.orgId, orgId), eq(rituals.kind, kind))).limit(1);
    if (existing) return rowToRitual(existing);
    return createRitual(build(dependsOnRitualId));
  }

  const daily = await findOrCreate(
    "daily_brief",
    () => ({
      orgId,
      kind: "daily_brief",
      name: "Daily Brief",
      participantRoles: ["lead", "manager"],
      inputs: [
        { kind: "action_due_date", label: "Actions due today or overdue" },
        { kind: "sensor_signal", label: "Overnight anomalies" },
      ],
      outputs: [{ kind: "agenda", label: "Daily brief agenda" }],
      durationMinutes: 15,
      quorum: 1,
      timezone,
      anchor: { hour: 9, minute: 0 },
      dependsOnRitualId: null,
      active: true,
    }),
    null,
  );

  const weekly = await findOrCreate(
    "weekly_review",
    () => ({
      orgId,
      kind: "weekly_review",
      name: "Weekly Review",
      participantRoles: ["manager", "ic"],
      inputs: [
        { kind: "decision_trigger_watch", label: "Decisions near trigger threshold" },
        { kind: "sensor_signal", label: "Anomalies since last review" },
        { kind: "action_due_date", label: "Overdue action items" },
      ],
      outputs: [
        { kind: "agenda", label: "Weekly review agenda" },
        { kind: "capture_record", label: "Weekly review capture" },
      ],
      durationMinutes: 30,
      quorum: 2,
      timezone,
      anchor: { weekday: 1, hour: 10, minute: 0 }, // Monday 10:00
      dependsOnRitualId: null,
      active: true,
    }),
    null,
  );

  const monthly = await findOrCreate(
    "monthly_business_review",
    (dependsOnRitualId) => ({
      orgId,
      kind: "monthly_business_review",
      name: "Monthly Business Review",
      participantRoles: ["manager", "exec"],
      inputs: [
        { kind: "key_result", label: "KR drift" },
        { kind: "budget_line", label: "Budget variance" },
        { kind: "team_pulse_aggregate", label: "Team pulse (aggregate)" },
        { kind: "dependent_ritual_occurrence", label: "Weekly reviews held this month" },
      ],
      outputs: [
        { kind: "agenda", label: "MBR agenda" },
        { kind: "capture_record", label: "MBR capture" },
      ],
      durationMinutes: 60,
      quorum: 3,
      timezone,
      anchor: { dayOfMonth: 1, hour: 10, minute: 0 },
      dependsOnRitualId,
      active: true,
    }),
    weekly.id,
  );

  const quarterly = await findOrCreate(
    "quarterly_strategy",
    (dependsOnRitualId) => ({
      orgId,
      kind: "quarterly_strategy",
      name: "Quarterly Strategy Review",
      participantRoles: ["exec"],
      inputs: [
        { kind: "key_result", label: "KR drift (quarter)" },
        { kind: "budget_line", label: "Budget variance (quarter)" },
        { kind: "dependent_ritual_occurrence", label: "MBRs held this quarter" },
      ],
      outputs: [
        { kind: "agenda", label: "Quarterly strategy agenda" },
        { kind: "capture_record", label: "Quarterly strategy capture" },
      ],
      durationMinutes: 120,
      quorum: 3,
      timezone,
      anchor: { dayOfMonth: 1, hour: 9, minute: 0 },
      dependsOnRitualId,
      active: true,
    }),
    monthly.id,
  );

  const annual = await findOrCreate(
    "annual_plan",
    (dependsOnRitualId) => ({
      orgId,
      kind: "annual_plan",
      name: "Annual Plan",
      participantRoles: ["exec"],
      inputs: [{ kind: "dependent_ritual_occurrence", label: "Quarterly strategy reviews held this year" }],
      outputs: [
        { kind: "agenda", label: "Annual plan agenda" },
        { kind: "capture_record", label: "Annual plan capture" },
      ],
      durationMinutes: 240,
      quorum: 3,
      timezone,
      anchor: { month: 1, dayOfMonth: 15, hour: 9, minute: 0 },
      dependsOnRitualId,
      active: true,
    }),
    quarterly.id,
  );

  return {
    daily_brief: daily,
    weekly_review: weekly,
    monthly_business_review: monthly,
    quarterly_strategy: quarterly,
    annual_plan: annual,
  };
}
