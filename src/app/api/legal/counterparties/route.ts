import { db } from "@/db";
import { contracts, parties } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: parties.id,
      name: parties.name,
      jurisdiction: parties.jurisdiction,
      ecosystemNodeId: parties.ecosystemNodeId,
      contractCount: sql<number>`count(${contracts.id})`.mapWith(Number),
    })
    .from(parties)
    .leftJoin(contracts, eq(contracts.counterpartyPartyId, parties.id))
    .where(eq(parties.partyType, "counterparty"))
    .groupBy(parties.id);

  return Response.json({ counterparties: rows });
}
