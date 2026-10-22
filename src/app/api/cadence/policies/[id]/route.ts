import { NextResponse } from "next/server";
import { db } from "@/db";
import { cadencePolicies } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface PatchBody {
  active?: boolean;
  description?: string;
  rule?: unknown;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as PatchBody;
  const [updated] = await db
    .update(cadencePolicies)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(cadencePolicies.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "policy not found" }, { status: 404 });
  return NextResponse.json({ policy: updated });
}
