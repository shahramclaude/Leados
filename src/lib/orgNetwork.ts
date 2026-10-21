// Part 09-F: org network & collaboration health, computed EXCLUSIVELY from
// interaction metadata (who worked with whom, when, in what category of
// interaction, for how long). HARD RULE: no message/meeting/document CONTENT
// is ever read, stored, or analyzed here. The `collaborations` table has no
// content/body/subject/transcript column (enforced by assertMetadataOnlySchema
// below and exercised in scripts/verify.ts), and this module must never be
// extended to accept free text beyond the closed `context` enum.

import { db } from "@/db";
import { collaborations, people, actors } from "@/db/schema";
import { eq, or, gte, sql } from "drizzle-orm";
import { type Actor, canReadTeamAggregate, assertAccess } from "./accessControl";

export const ALLOWED_COLLABORATION_CONTEXTS = ["meeting", "review", "project", "one_on_one"] as const;
export type CollaborationContext = (typeof ALLOWED_COLLABORATION_CONTEXTS)[number];

const BANNED_COLUMN_NAME_FRAGMENTS = ["content", "body", "subject", "transcript", "message", "text"];

/**
 * Runtime guard asserting the live `collaborations` table has not grown a
 * content-bearing column. Run in scripts/verify.ts on every CI run.
 */
export async function assertMetadataOnlySchema(): Promise<void> {
  const result = await db.execute(
    sql`select column_name from information_schema.columns where table_name = 'collaborations'`,
  );
  const rows = result.rows as Array<{ column_name: string }>;
  const offenders = rows
    .map((r) => r.column_name)
    .filter((name) => BANNED_COLUMN_NAME_FRAGMENTS.some((frag) => name.toLowerCase().includes(frag)));
  if (offenders.length > 0) {
    throw new Error(
      `collaborations table has content-shaped column(s): ${offenders.join(", ")}. ` +
        `Org-network analytics must remain metadata-only (Part 09-F hard rule).`,
    );
  }
}

export interface CollaborationLoad {
  personId: string;
  distinctCounterparts: number;
  totalInteractions: number;
  estimatedWeeklyMeetingMinutes: number;
}

export async function collaborationLoad(actor: Actor, teamId: string): Promise<CollaborationLoad[]> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} may not read collaboration load`);
  const members = await db.select().from(people).where(eq(people.teamId, teamId));
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const results: CollaborationLoad[] = [];
  for (const m of members) {
    const rows = await db
      .select()
      .from(collaborations)
      .where(or(eq(collaborations.personId, m.id), eq(collaborations.counterpartId, m.id)));
    const recent = rows.filter((r) => r.occurredAt >= since);
    const counterparts = new Set(recent.map((r) => (r.personId === m.id ? r.counterpartId : r.personId)));
    const minutes = recent.reduce((s, r) => s + (r.durationMinutes ?? 30), 0);
    results.push({
      personId: m.id,
      distinctCounterparts: counterparts.size,
      totalInteractions: recent.length,
      estimatedWeeklyMeetingMinutes: Math.round(minutes / 4),
    });
  }
  return results;
}

export interface BusFactorResult {
  teamId: string;
  busFactor: number; // minimum number of people whose departure would leave a skill/role uncovered
  soleOwners: { personId: string; name: string; reason: string }[];
}

/** Bus factor approximated from collaboration-graph centrality + role uniqueness within the team. */
export async function busFactor(actor: Actor, teamId: string): Promise<BusFactorResult> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} may not read bus factor`);
  const members = await db.select().from(people).where(eq(people.teamId, teamId));
  const roleCounts = new Map<string, number>();
  for (const m of members) roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1);

  const soleOwners: { personId: string; name: string; reason: string }[] = [];
  for (const m of members) {
    if ((roleCounts.get(m.role) ?? 0) === 1) {
      const [actorRow] = await db.select().from(actors).where(eq(actors.id, m.id)).limit(1);
      soleOwners.push({
        personId: m.id,
        name: actorRow?.name ?? m.id,
        reason: `Only team member in role "${m.role}" (metadata-only org-structure signal).`,
      });
    }
  }

  // Standard bus-factor framing applied to roles: the size of the smallest
  // role group is the number of departures that would leave that role
  // uncovered on this team.
  const minRoleCount = roleCounts.size > 0 ? Math.min(...roleCounts.values()) : 0;

  return {
    teamId,
    busFactor: minRoleCount,
    soleOwners,
  };
}

export interface Bottleneck {
  personId: string;
  name: string;
  shareOfTeamInteractions: number;
}

/** Flags people who are a counterparty in an unusually large share of the
 * team's recorded interactions — a workload/dependency signal, not a
 * performance judgement. */
export async function communicationBottlenecks(actor: Actor, teamId: string): Promise<Bottleneck[]> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} may not read bottleneck analysis`);
  const members = await db.select().from(people).where(eq(people.teamId, teamId));
  const memberIds = new Set(members.map((m) => m.id));
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(collaborations).where(gte(collaborations.occurredAt, since));
  const relevant = rows.filter((r) => memberIds.has(r.personId) && memberIds.has(r.counterpartId));
  if (relevant.length === 0) return [];

  const counts = new Map<string, number>();
  for (const r of relevant) {
    counts.set(r.counterpartId, (counts.get(r.counterpartId) ?? 0) + 1);
  }
  const total = relevant.length;
  const results: Bottleneck[] = [];
  for (const [personId, count] of counts.entries()) {
    const share = count / total;
    if (share >= 0.3) {
      const [actorRow] = await db.select().from(actors).where(eq(actors.id, personId)).limit(1);
      results.push({ personId, name: actorRow?.name ?? personId, shareOfTeamInteractions: Number(share.toFixed(2)) });
    }
  }
  return results.sort((a, b) => b.shareOfTeamInteractions - a.shareOfTeamInteractions);
}
