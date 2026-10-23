// Anti-retaliation signal monitor — aggregate-only. Adverse-action signals
// (role change, negative review, exclusion, compensation cut, termination)
// occurring after a safe-channel report are recorded against a hashed
// person reference and surfaced as FLAGGED, never CONCLUDED. This module
// deliberately never asserts retaliation happened — it raises a signal for
// human investigation.

import { db } from "@/db";
import { antiRetaliationSignals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashSecret } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";

const FLAG_THRESHOLD = 2; // 2+ adverse signals in the window => flagged for human review

export async function recordSignal(params: {
  caseId: number;
  personIdentifier: string; // e.g. employee id/email, hashed before storage
  signalType: string;
  recordedByPersonId?: number;
}) {
  const [row] = await db
    .insert(antiRetaliationSignals)
    .values({
      caseId: params.caseId,
      personHash: hashSecret(params.personIdentifier, "anti-retaliation"),
      signalType: params.signalType,
      recordedByPersonId: params.recordedByPersonId ?? null,
    })
    .returning();

  await recordAudit({
    actorId: params.recordedByPersonId,
    action: "anti_retaliation.signal_recorded",
    resourceType: "safe_channel_case",
    resourceId: params.caseId,
    metadata: { signalType: params.signalType },
  });

  return row;
}

export interface AggregateResult {
  caseId: number;
  signalCount: number;
  flagged: boolean;
  status: "flagged" | "not_flagged";
  note: string;
}

export async function aggregateForCase(caseId: number): Promise<AggregateResult> {
  const rows = await db.select().from(antiRetaliationSignals).where(eq(antiRetaliationSignals.caseId, caseId));
  const flagged = rows.length >= FLAG_THRESHOLD;
  return {
    caseId,
    signalCount: rows.length,
    flagged,
    status: flagged ? "flagged" : "not_flagged",
    note: flagged
      ? `${rows.length} adverse-action signal(s) recorded after this report. This is FLAGGED for human ` +
        `investigation — it is not a conclusion that retaliation occurred.`
      : `${rows.length} adverse-action signal(s) recorded; below the review threshold of ${FLAG_THRESHOLD}.`,
  };
}
