import { db } from "@/db";
import { maDeals } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const deals = await db.select().from(maDeals).orderBy(desc(maDeals.createdAt));
  return Response.json({ deals });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name || !body.targetCompany) {
    return Response.json({ ok: false, error: "name and targetCompany are required" }, { status: 400 });
  }
  const [deal] = await db
    .insert(maDeals)
    .values({
      name: body.name,
      targetCompany: body.targetCompany,
      phase: "diligence",
      closeDate: body.closeDate ? new Date(body.closeDate) : null,
    })
    .returning();
  return Response.json({ ok: true, deal });
}
