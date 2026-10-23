// Server-side domain service layer — wraps DB reads/writes around the pure
// logic in stateMachine.ts / authority.ts / claims.ts / assumptions.ts /
// dependencies.ts. Every privileged mutation logs a timeline event so the
// authority matrix is "never invisible."

import { db } from "@/db";
import {
  crises,
  crisisClasses,
  timelineEvents,
  roleAssignments,
  authorityGrants,
  decisions,
  assumptions,
  commsMessages,
  stakeholderGroups,
  notificationContacts,
  messageTemplates,
  claims,
  statusPageUpdates,
  dependencies,
  circuitBreakerEvents,
  personas,
  learnings,
  drills,
  drillInjects,
} from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import {
  validateTransition,
  type CrisisState,
  type RoleKey,
  ALLOWED_TRANSITIONS,
} from "./stateMachine";
import { checkAuthority, type CrisisAction, type AuthorityGrant } from "./authority";
import { evaluateClaim, type ClaimSource } from "./claims";
import { routeNotification, type DependencyRecord } from "./dependencies";

export class CrisisServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function logTimeline(
  crisisId: string,
  eventType: string,
  summary: string,
  actorLabel: string,
  payload: Record<string, unknown> = {},
) {
  await db.insert(timelineEvents).values({ crisisId, eventType, summary, actorLabel, payload });
}

export async function getAuthorityMatrix(): Promise<AuthorityGrant[]> {
  const rows = await db.select().from(authorityGrants);
  return rows.map((r) => ({
    roleKey: r.roleKey as RoleKey,
    action: r.action as CrisisAction,
    scope: r.scope as "normal" | "crisis",
    maxCommitUsd: r.maxCommitUsd ? Number(r.maxCommitUsd) : undefined,
    requiresDualControl: r.requiresDualControl,
  }));
}

export async function getRoleKeysForCrisis(crisisId: string): Promise<Map<string, RoleKey[]>> {
  const rows = await db
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.crisisId, crisisId));
  const map = new Map<string, RoleKey[]>();
  for (const r of rows) {
    if (!r.active) continue;
    const existing = map.get(r.personaId) ?? [];
    existing.push(r.roleKey as RoleKey);
    map.set(r.personaId, existing);
  }
  return map;
}

export async function getActiveRoleKeysFlat(crisisId: string): Promise<RoleKey[]> {
  const rows = await db
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.crisisId, crisisId));
  return rows.filter((r) => r.active).map((r) => r.roleKey as RoleKey);
}

export interface DeclareCrisisInput {
  classKey: string;
  title: string;
  severity: number;
  declarerPersonaIds: string[];
  initialAssumption?: { statement: string; confidence: string; reverifyHours: number };
  skipElevated?: boolean; // emergency override normal -> crisis directly
}

export async function declareCrisis(input: DeclareCrisisInput) {
  const [klass] = await db.select().from(crisisClasses).where(eq(crisisClasses.key, input.classKey));
  if (!klass) throw new CrisisServiceError(`Unknown crisis class "${input.classKey}"`, 404);

  const declarers = await db
    .select()
    .from(personas)
    .where(eq(personas.id, input.declarerPersonaIds[0] ?? ""));

  // Gather role keys held by each declaring persona
  const allDeclarers = await Promise.all(
    input.declarerPersonaIds.map((id) => db.select().from(personas).where(eq(personas.id, id))),
  );
  const declarerRoleKeys = allDeclarers.flatMap((rows) => (rows[0]?.roleKeys as string[]) ?? []) as RoleKey[];

  const from: CrisisState = "normal";
  const to: CrisisState = "crisis";

  const validation = validateTransition({
    from,
    to,
    initiatorRoleKeys: declarerRoleKeys,
    requiresDualDeclaration: klass.requiresDualDeclaration,
    declarerCount: input.declarerPersonaIds.length,
  });

  if (!validation.ok) {
    throw new CrisisServiceError(validation.reason ?? "Transition rejected", 403);
  }

  const matrix = await getAuthorityMatrix();
  const authCheck = checkAuthority({ action: "declare_crisis", actingRoleKeys: declarerRoleKeys, matrix });
  if (!authCheck.allowed) {
    throw new CrisisServiceError(authCheck.reason, 403);
  }

  const [crisis] = await db
    .insert(crises)
    .values({
      classId: klass.id,
      title: input.title,
      severity: input.severity,
      state: "crisis",
      declaredByPersonaIds: input.declarerPersonaIds,
    })
    .returning();

  await logTimeline(
    crisis.id,
    "crisis_declared",
    `Crisis declared: "${input.title}" (class: ${klass.name}, severity ${input.severity}).`,
    declarers[0]?.name ?? "unknown",
    { declarerPersonaIds: input.declarerPersonaIds, classKey: klass.key },
  );

  // Pre-configured command structure: assign role template slots as "open"
  // placeholders is out of scope for v1 — instead we record which roles are
  // required so the Crisis Room can show open vs filled seats.
  await logTimeline(
    crisis.id,
    "role_template_applied",
    `Role template applied: ${(klass.roleTemplate as string[]).join(", ")}`,
    "system",
    { roleTemplate: klass.roleTemplate },
  );

  return crisis;
}

export interface TransitionInput {
  crisisId: string;
  toState: CrisisState;
  actorPersonaId?: string;
  actorRoleKeys: RoleKey[];
  reason: string;
}

export async function transitionCrisis(input: TransitionInput) {
  const [crisis] = await db.select().from(crises).where(eq(crises.id, input.crisisId));
  if (!crisis) throw new CrisisServiceError("Crisis not found", 404);

  const validation = validateTransition({
    from: crisis.state as CrisisState,
    to: input.toState,
    initiatorRoleKeys: input.actorRoleKeys,
    commanderCompromised: crisis.commanderCompromised,
  });
  if (!validation.ok) throw new CrisisServiceError(validation.reason ?? "Transition rejected", 403);

  const matrix = await getAuthorityMatrix();
  const action: CrisisAction =
    input.toState === "recovery" ? "declare_recovery" : input.toState === "closed" ? "close_post_mortem" : "transition_state";
  const authCheck = checkAuthority({
    action,
    actingRoleKeys: input.actorRoleKeys,
    matrix,
    commanderCompromised: crisis.commanderCompromised,
  });
  if (!authCheck.allowed) throw new CrisisServiceError(authCheck.reason, 403);

  const updates: Partial<typeof crises.$inferInsert> = { state: input.toState, updatedAt: new Date() };
  if (input.toState === "recovery") updates.recoveryDeclaredAt = new Date();
  if (input.toState === "post_mortem") updates.postMortemStartedAt = new Date();
  if (input.toState === "closed") updates.closedAt = new Date();

  const [updated] = await db.update(crises).set(updates).where(eq(crises.id, input.crisisId)).returning();

  let actorLabel = "system";
  if (input.actorPersonaId) {
    const [p] = await db.select().from(personas).where(eq(personas.id, input.actorPersonaId));
    actorLabel = p?.name ?? actorLabel;
  }

  await logTimeline(
    input.crisisId,
    "state_transition",
    `State changed ${crisis.state} -> ${input.toState}. Reason: ${input.reason}`,
    actorLabel,
    { from: crisis.state, to: input.toState, reason: input.reason },
  );

  return updated;
}

export async function markCommanderCompromised(crisisId: string, note: string) {
  const [updated] = await db
    .update(crises)
    .set({ commanderCompromised: true, updatedAt: new Date() })
    .where(eq(crises.id, crisisId))
    .returning();
  await logTimeline(crisisId, "commander_compromised", `Commander marked compromised: ${note}`, "system", { note });
  return updated;
}

export async function recordDecision(input: {
  crisisId: string;
  title: string;
  rationale: string;
  decidedByRoleKey: RoleKey;
  decidedByPersonaId?: string;
  decideByHoursFromNow: number;
  assumptions: { statement: string; confidence: string; reverifyHours: number }[];
}) {
  const decideBy = new Date(Date.now() + input.decideByHoursFromNow * 3600_000);
  const [decision] = await db
    .insert(decisions)
    .values({
      crisisId: input.crisisId,
      title: input.title,
      rationale: input.rationale,
      decidedByRoleKey: input.decidedByRoleKey,
      decidedByPersonaId: input.decidedByPersonaId,
      decideBy,
      decidedAt: new Date(),
      status: "decided",
    })
    .returning();

  const createdAssumptions = [];
  for (const a of input.assumptions) {
    const reverifyAt = new Date(Date.now() + a.reverifyHours * 3600_000);
    const [row] = await db
      .insert(assumptions)
      .values({ decisionId: decision.id, statement: a.statement, confidence: a.confidence, reverifyAt })
      .returning();
    createdAssumptions.push(row);
  }

  await logTimeline(
    input.crisisId,
    "decision_recorded",
    `Decision recorded: "${input.title}" (decide-by window honored; ${createdAssumptions.length} assumption(s) registered).`,
    input.decidedByRoleKey,
    { decisionId: decision.id, assumptions: createdAssumptions.map((a) => a.statement) },
  );

  return { decision, assumptions: createdAssumptions };
}

export async function tickAssumptions(crisisId?: string) {
  const { evaluateAssumptionTick } = await import("./assumptions");
  const allDecisions = crisisId
    ? await db.select().from(decisions).where(eq(decisions.crisisId, crisisId))
    : await db.select().from(decisions);
  const decisionIds = new Set(allDecisions.map((d) => d.id));
  const allAssumptions = await db.select().from(assumptions);
  const relevant = allAssumptions.filter((a) => decisionIds.has(a.decisionId));

  const now = new Date();
  const escalations: { assumptionId: string; decisionId: string; crisisId: string; statement: string }[] = [];

  for (const a of relevant) {
    const result = evaluateAssumptionTick(
      { id: a.id, status: a.status, reverifyAt: new Date(a.reverifyAt) },
      now,
    );
    if (result.newStatus !== a.status) {
      await db
        .update(assumptions)
        .set({ status: result.newStatus, escalated: result.shouldEscalate, escalatedAt: result.shouldEscalate ? now : undefined })
        .where(eq(assumptions.id, a.id));

      if (result.shouldEscalate) {
        const decision = allDecisions.find((d) => d.id === a.decisionId);
        if (decision) {
          escalations.push({ assumptionId: a.id, decisionId: a.decisionId, crisisId: decision.crisisId, statement: a.statement });
          await logTimeline(
            decision.crisisId,
            "assumption_overdue_escalated",
            `Assumption overdue, escalated to commander: "${a.statement}"`,
            "system",
            { assumptionId: a.id, decisionId: a.decisionId },
          );
        }
      }
    }
  }

  return { checked: relevant.length, escalated: escalations.length, escalations };
}

export async function submitClaim(crisisId: string, statement: string, sources: ClaimSource[]) {
  const evalResult = evaluateClaim(sources);
  const [claim] = await db
    .insert(claims)
    .values({ crisisId, statement, sources, status: evalResult.status })
    .returning();

  await logTimeline(
    crisisId,
    "claim_submitted",
    `Claim submitted (${evalResult.status}): "${statement}" — ${evalResult.reason}`,
    "system",
    { claimId: claim.id, sources },
  );

  return { claim, evaluation: evalResult };
}

export async function addClaimSource(claimId: string, source: ClaimSource) {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new CrisisServiceError("Claim not found", 404);

  const newSources = [...(claim.sources as ClaimSource[]), source];
  const evalResult = evaluateClaim(newSources);

  const [updated] = await db
    .update(claims)
    .set({ sources: newSources, status: evalResult.status, updatedAt: new Date() })
    .where(eq(claims.id, claimId))
    .returning();

  await logTimeline(
    claim.crisisId,
    "claim_source_added",
    `Source added to claim "${claim.statement}" — now ${evalResult.status} (${evalResult.independentSourceCount} independent source(s)).`,
    "system",
    { claimId, source },
  );

  return { claim: updated, evaluation: evalResult };
}

export async function getDependencyRecords(): Promise<DependencyRecord[]> {
  const rows = await db.select().from(dependencies);
  return rows.map((r) => ({ key: r.key, status: r.status }));
}

export async function setDependencyStatus(key: string, status: "up" | "degraded" | "down", note: string) {
  const [dep] = await db.select().from(dependencies).where(eq(dependencies.key, key));
  if (!dep) throw new CrisisServiceError(`Unknown dependency "${key}"`, 404);

  const [updated] = await db
    .update(dependencies)
    .set({ status, lastCheckedAt: new Date() })
    .where(eq(dependencies.id, dep.id))
    .returning();

  await db.insert(circuitBreakerEvents).values({ dependencyId: dep.id, fromStatus: dep.status, toStatus: status, note });

  return updated;
}

export async function composeAndSendComms(input: {
  crisisId: string;
  groupKey: string;
  subject: string;
  body: string;
  actingRoleKeys: RoleKey[];
  actorPersonaId?: string;
  legalApprovedAlready?: boolean;
}) {
  const [group] = await db.select().from(stakeholderGroups).where(eq(stakeholderGroups.key, input.groupKey));
  if (!group) throw new CrisisServiceError(`Unknown stakeholder group "${input.groupKey}"`, 404);

  const [message] = await db
    .insert(commsMessages)
    .values({
      crisisId: input.crisisId,
      groupId: group.id,
      subject: input.subject,
      body: input.body,
      status: group.requiresLegalReview ? "legal_review" : "draft",
      createdByPersonaId: input.actorPersonaId,
    })
    .returning();

  await logTimeline(
    input.crisisId,
    "comms_drafted",
    `Comms drafted for "${group.name}": "${input.subject}" (${group.requiresLegalReview ? "requires legal review" : "no legal review required"}).`,
    "system",
    { messageId: message.id, groupKey: input.groupKey },
  );

  return message;
}

export async function legalReviewComms(messageId: string, approve: boolean, note: string, legalPersonaId?: string) {
  const [message] = await db.select().from(commsMessages).where(eq(commsMessages.id, messageId));
  if (!message) throw new CrisisServiceError("Message not found", 404);

  const matrix = await getAuthorityMatrix();
  const authCheck = checkAuthority({ action: "approve_external_comms", actingRoleKeys: ["legal"], matrix });
  if (!authCheck.allowed) throw new CrisisServiceError(authCheck.reason, 403);

  const [updated] = await db
    .update(commsMessages)
    .set({
      status: approve ? "approved" : "rejected",
      legalReviewedByPersonaId: legalPersonaId,
      legalReviewedAt: new Date(),
      legalReviewNote: note,
    })
    .where(eq(commsMessages.id, messageId))
    .returning();

  await logTimeline(
    message.crisisId,
    "comms_legal_reviewed",
    `Legal review ${approve ? "APPROVED" : "REJECTED"} message "${message.subject}": ${note}`,
    "legal",
    { messageId },
  );

  return updated;
}

export async function sendComms(messageId: string, actingRoleKeys: RoleKey[]) {
  const [message] = await db.select().from(commsMessages).where(eq(commsMessages.id, messageId));
  if (!message) throw new CrisisServiceError("Message not found", 404);

  if (message.status !== "approved" && message.status !== "draft") {
    throw new CrisisServiceError(`Message is in status "${message.status}" and cannot be sent.`, 409);
  }

  const matrix = await getAuthorityMatrix();
  const authCheck = checkAuthority({ action: "send_comms", actingRoleKeys, matrix });
  if (!authCheck.allowed) throw new CrisisServiceError(authCheck.reason, 403);

  const group = (await db.select().from(stakeholderGroups).where(eq(stakeholderGroups.id, message.groupId)))[0];
  const contacts = await db.select().from(notificationContacts).where(eq(notificationContacts.groupId, message.groupId));
  const deps = await getDependencyRecords();

  const routing = routeNotification(
    contacts.map((c) => ({ id: c.id, name: c.name, channel: c.channel, dependencyKey: c.dependencyKey, escalationOrder: c.escalationOrder })),
    deps,
  );

  if (!routing.ok) {
    await db
      .update(commsMessages)
      .set({ status: "send_failed", sendFailureReason: routing.reason })
      .where(eq(commsMessages.id, messageId));

    await logTimeline(
      message.crisisId,
      "comms_send_failed",
      `Send failed for "${message.subject}" to ${group?.name}: ${routing.reason}`,
      "system",
      { messageId, skipped: routing.skipped.map((s) => s.contact.name) },
    );

    throw new CrisisServiceError(`Could not send: ${routing.reason}`, 503);
  }

  const [updated] = await db
    .update(commsMessages)
    .set({ status: "sent", sentAt: new Date(), channel: routing.contact!.channel })
    .where(eq(commsMessages.id, messageId))
    .returning();

  await logTimeline(
    message.crisisId,
    "comms_sent",
    `Sent "${message.subject}" to ${group?.name} via ${routing.contact!.name} (${routing.contact!.channel}).${routing.skipped.length ? ` Fallback used after ${routing.skipped.length} channel(s) unavailable.` : ""}`,
    "system",
    { messageId, routedVia: routing.contact!.name, skipped: routing.skipped.map((s) => s.contact.name) },
  );

  return updated;
}

export async function publishStatusUpdate(input: {
  crisisId: string;
  headline: string;
  body: string;
  severity: number;
  actingRoleKeys: RoleKey[];
  actorPersonaId?: string;
}) {
  const matrix = await getAuthorityMatrix();
  const authCheck = checkAuthority({ action: "publish_status_update", actingRoleKeys: input.actingRoleKeys, matrix });
  if (!authCheck.allowed) throw new CrisisServiceError(authCheck.reason, 403);

  const [crisis] = await db.select().from(crises).where(eq(crises.id, input.crisisId));
  if (!crisis) throw new CrisisServiceError("Crisis not found", 404);

  const nextVersion = crisis.currentStatusVersion + 1;

  const [update] = await db
    .insert(statusPageUpdates)
    .values({
      crisisId: input.crisisId,
      version: nextVersion,
      headline: input.headline,
      body: input.body,
      severity: input.severity,
      publishedByPersonaId: input.actorPersonaId,
    })
    .returning();

  await db.update(crises).set({ currentStatusVersion: nextVersion }).where(eq(crises.id, input.crisisId));

  await logTimeline(
    input.crisisId,
    "status_page_published",
    `Status page v${nextVersion} published: "${input.headline}"`,
    "system",
    { version: nextVersion },
  );

  return update;
}

export async function getCrisisDetail(crisisId: string) {
  const [crisis] = await db.select().from(crises).where(eq(crises.id, crisisId));
  if (!crisis) return null;
  const [klass] = await db.select().from(crisisClasses).where(eq(crisisClasses.id, crisis.classId));
  const timeline = await db
    .select()
    .from(timelineEvents)
    .where(eq(timelineEvents.crisisId, crisisId))
    .orderBy(asc(timelineEvents.occurredAt));
  const roles = await db.select().from(roleAssignments).where(eq(roleAssignments.crisisId, crisisId));
  const crisisDecisions = await db.select().from(decisions).where(eq(decisions.crisisId, crisisId));
  const decisionIds = crisisDecisions.map((d) => d.id);
  const allAssumptions = decisionIds.length
    ? (await db.select().from(assumptions)).filter((a) => decisionIds.includes(a.decisionId))
    : [];
  const comms = await db.select().from(commsMessages).where(eq(commsMessages.crisisId, crisisId));
  const crisisClaims = await db.select().from(claims).where(eq(claims.crisisId, crisisId));
  const statusUpdates = await db
    .select()
    .from(statusPageUpdates)
    .where(eq(statusPageUpdates.crisisId, crisisId))
    .orderBy(desc(statusPageUpdates.version));
  const crisisLearnings = await db.select().from(learnings).where(eq(learnings.crisisId, crisisId));

  return {
    crisis,
    klass,
    timeline,
    roles,
    decisions: crisisDecisions,
    assumptions: allAssumptions,
    comms,
    claims: crisisClaims,
    statusUpdates,
    learnings: crisisLearnings,
  };
}

export async function addLearning(input: {
  crisisId: string;
  category: string;
  statement: string;
  actionItem: string;
  ownerRoleKey?: RoleKey;
  targetSystem: string;
}) {
  const [row] = await db.insert(learnings).values(input).returning();
  await logTimeline(input.crisisId, "learning_captured", `Learning captured: "${input.statement}"`, "scribe", { learningId: row.id });
  return row;
}

export { db, crises, crisisClasses, drills, drillInjects };
