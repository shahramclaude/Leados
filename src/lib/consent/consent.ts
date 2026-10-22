// Consent & privacy contract (Part 09 dignity rules, reconstructed minimal
// surface for Part 42): recording participation is opt-in per person. Every
// participant starts `pending` (treated as non-consenting for redaction
// purposes — silence is never treated as consent).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetingParticipants } from "@/db/schema";

export type ConsentStatus = "pending" | "opted_in" | "opted_out";

export function isConsenting(status: ConsentStatus): boolean {
  return status === "opted_in";
}

export async function getConsentMap(meetingId: string): Promise<Map<string, ConsentStatus>> {
  const rows = await db
    .select()
    .from(meetingParticipants)
    .where(eq(meetingParticipants.meetingId, meetingId));
  return new Map(rows.map((r) => [r.id, r.consentStatus as ConsentStatus]));
}

export async function setConsent(participantId: string, status: ConsentStatus) {
  const [updated] = await db
    .update(meetingParticipants)
    .set({ consentStatus: status, consentUpdatedAt: new Date() })
    .where(eq(meetingParticipants.id, participantId))
    .returning();
  return updated;
}

export async function listParticipants(meetingId: string) {
  return db.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId));
}
