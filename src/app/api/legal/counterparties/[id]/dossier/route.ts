// Compiles (POST) or fetches the latest (GET) negotiation-prep dossier for a counterparty.
// ACCESS NOTE: dossiers concentrate sensitive leverage info (Phase 5 answer #3). In this reference
// implementation access is enforced at the UI layer via src/lib/legal/access.ts; a production
// deployment must also enforce it server-side with real session/role data.
import { db } from "@/db";
import { dossiers } from "@/db/schema";
import { compileDossier } from "@/lib/legal/dossier";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const counterpartyId = Number(id);
  if (!Number.isFinite(counterpartyId)) {
    return Response.json({ error: "Invalid counterparty id" }, { status: 400 });
  }
  const [latest] = await db
    .select()
    .from(dossiers)
    .where(eq(dossiers.counterpartyPartyId, counterpartyId))
    .orderBy(desc(dossiers.generatedAt))
    .limit(1);

  if (!latest) return Response.json({ dossier: null });
  return Response.json({ dossier: latest });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const counterpartyId = Number(id);
  if (!Number.isFinite(counterpartyId)) {
    return Response.json({ error: "Invalid counterparty id" }, { status: 400 });
  }
  try {
    const { dossier, lintReport } = await compileDossier(counterpartyId);
    return Response.json({ dossier, lintReport });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
