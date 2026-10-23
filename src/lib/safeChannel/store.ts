// Safe channel storage with confidentiality by construction:
//  - identity (and body) are encrypted at rest (AES-256-GCM, src/lib/crypto.ts)
//  - access to identity is restricted to SAFE_CHANNEL_IDENTITY_ROLES only
//  - EVERY access attempt — granted or denied — is logged
//  - every DENIED attempt additionally raises an alert row
// This is the "test-or-ship" absolute bar: unauthorized access must be
// denied AND alerted, with no silent failure mode in either direction.

import { db } from "@/db";
import { safeChannelReports, safeChannelAccessLog, safeChannelAlerts, safeChannelCaseEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptField, decryptField, hashSecret, randomCaseRef, randomToken } from "@/lib/crypto";
import { SAFE_CHANNEL_IDENTITY_ROLES, SAFE_CHANNEL_CASE_ROLES, Actor } from "@/lib/roles";
import { recordAudit } from "@/lib/audit";

export class SafeChannelAccessDenied extends Error {}

export async function submitReport(params: {
  category: string;
  body: string;
  reporterIdentity?: string; // empty/undefined => fully anonymous
}) {
  const caseRef = randomCaseRef();
  const lookupSecret = randomToken(12);
  const identity = encryptField(params.reporterIdentity ?? "");
  const body = encryptField(params.body);

  const [row] = await db
    .insert(safeChannelReports)
    .values({
      caseRef,
      category: params.category,
      reporterIdentityCiphertext: identity.ciphertext,
      reporterIdentityIv: identity.iv,
      reporterIdentityTag: identity.tag,
      isAnonymous: !params.reporterIdentity,
      bodyCiphertext: body.ciphertext,
      bodyIv: body.iv,
      bodyTag: body.tag,
      lookupSecretHash: hashSecret(lookupSecret),
      status: "open",
    })
    .returning();

  await recordAudit({
    action: "safe_channel.report_submitted",
    resourceType: "safe_channel_case",
    resourceId: row.id,
    metadata: { caseRef, isAnonymous: row.isAnonymous },
  });

  // The lookup secret is returned ONCE to the reporter and never stored in
  // plaintext — only its hash is kept, so losing it means losing the ability
  // to self-check status, by design (nobody else can impersonate the lookup).
  return { caseRef, lookupSecret, caseId: row.id };
}

async function logAccess(params: {
  caseId: number;
  accessor: Actor;
  field: "identity" | "body" | "metadata";
  granted: boolean;
  reason: string;
}) {
  const [log] = await db
    .insert(safeChannelAccessLog)
    .values({
      caseId: params.caseId,
      accessorPersonId: params.accessor.personId,
      accessorRole: params.accessor.role,
      fieldAccessed: params.field,
      granted: params.granted,
      reason: params.reason,
    })
    .returning();

  await recordAudit({
    actorId: params.accessor.personId,
    actorRole: params.accessor.role,
    action: params.granted ? "safe_channel.access_granted" : "safe_channel.access_denied",
    resourceType: "safe_channel_case",
    resourceId: params.caseId,
    metadata: { field: params.field, reason: params.reason },
  });

  if (!params.granted) {
    await db.insert(safeChannelAlerts).values({
      accessLogId: log.id,
      alertType: params.field === "identity" ? "unauthorized_identity_access_attempt" : "unauthorized_channel_access_attempt",
      message:
        `Access to ${params.field} on case #${params.caseId} was denied for role ` +
        `"${params.accessor.role ?? "unknown"}" (person ${params.accessor.personId ?? "unknown"}). ` +
        `Reason: ${params.reason}`,
    });
  }

  return log;
}

/** Case metadata/body access — restricted to the case-handling roles (not identity). */
export async function getCaseForRole(caseId: number, accessor: Actor) {
  const [row] = await db.select().from(safeChannelReports).where(eq(safeChannelReports.id, caseId));
  if (!row) throw new Error("Case not found");

  const allowed = accessor.role != null && SAFE_CHANNEL_CASE_ROLES.includes(accessor.role);
  await logAccess({
    caseId,
    accessor,
    field: "metadata",
    granted: allowed,
    reason: allowed ? "role authorized for case handling" : "role not in SAFE_CHANNEL_CASE_ROLES",
  });

  if (!allowed) {
    throw new SafeChannelAccessDenied("You are not authorized to view this case.");
  }

  return {
    id: row.id,
    caseRef: row.caseRef,
    category: row.category,
    isAnonymous: row.isAnonymous,
    status: row.status,
    body: decryptField({ ciphertext: row.bodyCiphertext, iv: row.bodyIv, tag: row.bodyTag }),
    createdAt: row.createdAt,
  };
}

/**
 * Reveal reporter identity. This is the single highest-sensitivity operation
 * in the whole system: access is restricted to SAFE_CHANNEL_IDENTITY_ROLES
 * ONLY — explicitly not admin/CEO/manager — and every attempt (granted or
 * not) is logged, with denials additionally alerted.
 */
export async function revealIdentity(caseId: number, accessor: Actor) {
  const [row] = await db.select().from(safeChannelReports).where(eq(safeChannelReports.id, caseId));
  if (!row) throw new Error("Case not found");

  const allowed = accessor.role != null && SAFE_CHANNEL_IDENTITY_ROLES.includes(accessor.role);

  await logAccess({
    caseId,
    accessor,
    field: "identity",
    granted: allowed,
    reason: allowed
      ? "role authorized under SAFE_CHANNEL_IDENTITY_ROLES"
      : `role "${accessor.role ?? "unknown"}" is not named in SAFE_CHANNEL_IDENTITY_ROLES`,
  });

  if (!allowed) {
    throw new SafeChannelAccessDenied(
      "Denied and alerted: reporter identity may only be accessed by the ombudsman or ethics officer roles, " +
        "regardless of organizational seniority.",
    );
  }

  if (row.isAnonymous) {
    return { identity: null, note: "This report was submitted anonymously; no identity was ever captured." };
  }

  const identity = decryptField({
    ciphertext: row.reporterIdentityCiphertext,
    iv: row.reporterIdentityIv,
    tag: row.reporterIdentityTag,
  });
  return { identity, note: "Access granted under named-role confidentiality policy; this access has been logged." };
}

export async function checkStatusByLookup(caseRef: string, lookupSecret: string) {
  const [row] = await db.select().from(safeChannelReports).where(eq(safeChannelReports.caseRef, caseRef));
  if (!row) return null;
  if (hashSecret(lookupSecret) !== row.lookupSecretHash) return null;
  return { caseRef: row.caseRef, status: row.status, createdAt: row.createdAt };
}

export async function listAccessLog(caseId: number) {
  return db.select().from(safeChannelAccessLog).where(eq(safeChannelAccessLog.caseId, caseId));
}

export async function listAlerts() {
  return db.select().from(safeChannelAlerts);
}

export async function listCaseEvents(caseId: number) {
  return db.select().from(safeChannelCaseEvents).where(eq(safeChannelCaseEvents.caseId, caseId));
}
