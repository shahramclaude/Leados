// src/lib/people/repository.ts
//
// Server-only data access for the people-analytics API routes. This is the
// single place that reads Postgres for this part — every API route goes
// through here, and every read here is expected to be wrapped with
// `checkAccess` (peopleScope.ts) by the caller before the data leaves the
// server. Skill/role/compensation-band CATALOGS are static ontology data
// (seeded into the DB for audit purposes, but read here from the same
// source-of-truth TypeScript constants the fairness tests use, so app
// behavior and test behavior can never drift apart).

// Server-only by construction: this module imports `@/db` (a Node Postgres
// pool) and is only ever imported from API route handlers / server
// components, never from client components or the pure test suites.
import { db } from "@/db";
import { compensationBands, corrections, employeeCompensation, employees, personSkillEvidence, teamComposerFeedback } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Person, SkillEvidence } from "./types";
import type { CompensationBand, EmployeeCompensation } from "./compensation";
import type { CorrectionRecord } from "./contestation";
import type { ScopeDirectory } from "./peopleScope";
import type { PeopleScope } from "./peopleScope";

export async function listEmployees(): Promise<Person[]> {
  const rows = await db.select().from(employees);
  return rows.map((r) => ({ id: r.id, name: r.name, title: r.title, teamId: r.teamId, managerId: r.managerId }));
}

export async function getEmployee(id: string): Promise<Person | undefined> {
  const rows = await db.select().from(employees).where(eq(employees.id, id));
  const r = rows[0];
  return r ? { id: r.id, name: r.name, title: r.title, teamId: r.teamId, managerId: r.managerId } : undefined;
}

export async function getScopeDirectory(): Promise<ScopeDirectory> {
  const rows = await db.select({ id: employees.id, managerId: employees.managerId }).from(employees);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    isManagerOf(viewerId, subjectId) {
      return byId.get(subjectId)?.managerId === viewerId;
    },
  };
}

export async function getEvidenceForPerson(personId: string): Promise<SkillEvidence[]> {
  const rows = await db.select().from(personSkillEvidence).where(eq(personSkillEvidence.personId, personId));
  return rows.map(mapEvidenceRow);
}

export async function getEvidenceForPeople(personIds: string[]): Promise<Record<string, SkillEvidence[]>> {
  const rows = await db.select().from(personSkillEvidence);
  const result: Record<string, SkillEvidence[]> = {};
  for (const id of personIds) result[id] = [];
  for (const row of rows) {
    if (result[row.personId]) result[row.personId].push(mapEvidenceRow(row));
  }
  return result;
}

export async function getAllEvidence(): Promise<SkillEvidence[]> {
  const rows = await db.select().from(personSkillEvidence);
  return rows.map(mapEvidenceRow);
}

export async function insertEvidence(evidence: SkillEvidence): Promise<void> {
  await db.insert(personSkillEvidence).values({
    id: evidence.id,
    personId: evidence.personId,
    skillId: evidence.skillId,
    source: evidence.source,
    level: evidence.level,
    recordedAt: new Date(evidence.recordedAt),
    evidenceRef: evidence.evidenceRef ?? null,
    recordedBy: evidence.recordedBy ?? null,
    invalidated: evidence.invalidated ?? false,
  });
}

export async function invalidateEvidence(evidenceId: string, supersededBy: string | undefined): Promise<void> {
  await db
    .update(personSkillEvidence)
    .set({ invalidated: true, supersededBy: supersededBy ?? null })
    .where(eq(personSkillEvidence.id, evidenceId));
}

export async function getCompensationForEmployee(employeeId: string): Promise<EmployeeCompensation | undefined> {
  const rows = await db.select().from(employeeCompensation).where(eq(employeeCompensation.employeeId, employeeId));
  return rows[0];
}

export async function getAllCompensation(): Promise<EmployeeCompensation[]> {
  return db.select().from(employeeCompensation);
}

export async function getCompensationBands(): Promise<CompensationBand[]> {
  const rows = await db.select().from(compensationBands);
  return rows.map((r) => ({ id: r.id, roleId: r.roleId, level: r.level, min: r.min, mid: r.mid, max: r.max, currency: r.currency }));
}

export async function insertCorrection(record: CorrectionRecord): Promise<void> {
  await db.insert(corrections).values({
    id: record.id,
    subjectId: record.subjectId,
    surface: record.surface,
    claim: record.claim,
    evidenceRef: record.evidenceRef ?? null,
    targetEvidenceId: record.targetEvidenceId ?? null,
    status: record.status,
    filedEventId: record.filedEventId,
  });
}

export async function updateCorrection(record: CorrectionRecord): Promise<void> {
  await db
    .update(corrections)
    .set({
      status: record.status,
      resolverId: record.resolverId ?? null,
      resolutionNote: record.resolutionNote ?? null,
      resolvedEventId: record.resolvedEventId ?? null,
      resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
    })
    .where(eq(corrections.id, record.id));
}

export async function getCorrection(id: string): Promise<CorrectionRecord | undefined> {
  const rows = await db.select().from(corrections).where(eq(corrections.id, id));
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    subjectId: r.subjectId,
    surface: r.surface,
    claim: r.claim,
    evidenceRef: r.evidenceRef ?? undefined,
    targetEvidenceId: r.targetEvidenceId ?? undefined,
    status: r.status as CorrectionRecord["status"],
    resolverId: r.resolverId ?? undefined,
    resolutionNote: r.resolutionNote ?? undefined,
    filedEventId: r.filedEventId,
    resolvedEventId: r.resolvedEventId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
  };
}

export async function listCorrectionsForSubject(subjectId: string): Promise<CorrectionRecord[]> {
  const rows = await db.select().from(corrections).where(eq(corrections.subjectId, subjectId));
  return rows.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    surface: r.surface,
    claim: r.claim,
    evidenceRef: r.evidenceRef ?? undefined,
    targetEvidenceId: r.targetEvidenceId ?? undefined,
    status: r.status as CorrectionRecord["status"],
    resolverId: r.resolverId ?? undefined,
    resolutionNote: r.resolutionNote ?? undefined,
    filedEventId: r.filedEventId,
    resolvedEventId: r.resolvedEventId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
  }));
}

export async function insertTeamComposerFeedback(params: { id: string; teamId: string; proposalId: string; rejectedBy: string; reason: string }): Promise<void> {
  await db.insert(teamComposerFeedback).values(params);
}

function mapEvidenceRow(row: typeof personSkillEvidence.$inferSelect): SkillEvidence {
  return {
    id: row.id,
    personId: row.personId,
    skillId: row.skillId,
    source: row.source as SkillEvidence["source"],
    level: row.level as SkillEvidence["level"],
    recordedAt: row.recordedAt.toISOString(),
    evidenceRef: row.evidenceRef ?? undefined,
    recordedBy: row.recordedBy ?? undefined,
    supersededBy: row.supersededBy ?? undefined,
    invalidated: row.invalidated,
  };
}

/**
 * Reads the temporary viewer-identity headers used by this sandbox in place
 * of real authentication (there is no auth part wired into this repository
 * snapshot yet). `x-viewer-id` / `x-viewer-role` / `x-purpose`. Defaults to
 * self-viewing nobody, which will fail closed on any real lookup.
 */
export function parseScopeFromHeaders(headers: Headers): PeopleScope {
  const viewerId = headers.get("x-viewer-id") ?? "anonymous";
  const viewerRole = (headers.get("x-viewer-role") ?? "self") as PeopleScope["viewerRole"];
  const purpose = headers.get("x-purpose") ?? "unspecified";
  return { viewerId, viewerRole, purpose };
}
