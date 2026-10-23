import { db } from "@/db";
import { clauses, contracts, obligations, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const dynamic = "force-dynamic";

const ownerParty = alias(parties, "owner_party");

export async function GET() {
  const rows = await db
    .select({
      id: obligations.id,
      description: obligations.description,
      status: obligations.status,
      severity: obligations.severity,
      dueDate: obligations.dueDate,
      cadence: obligations.cadence,
      jurisdictionTags: obligations.jurisdictionTags,
      confirmedAt: obligations.confirmedAt,
      clauseId: obligations.clauseId,
      clauseType: clauses.clauseType,
      clauseStatus: clauses.status,
      documentId: clauses.documentId,
      spanStart: clauses.spanStart,
      spanEnd: clauses.spanEnd,
      contractId: contracts.id,
      contractTitle: contracts.title,
      ownerName: ownerParty.name,
    })
    .from(obligations)
    .innerJoin(clauses, eq(clauses.id, obligations.clauseId))
    .innerJoin(contracts, eq(contracts.id, obligations.contractId))
    .leftJoin(ownerParty, eq(ownerParty.id, obligations.ownerPartyId))
    .orderBy(obligations.dueDate);

  return Response.json({ obligations: rows });
}
