import { db } from "@/db";
import { industrySegments } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const segments = await db.select().from(industrySegments);
  return Response.json({ segments });
}
