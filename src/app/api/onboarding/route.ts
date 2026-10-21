import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { tenants } from "@/db/schema";
import { onboardingSchema } from "@/lib/validation";
import { handleRouteError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = onboardingSchema.parse(body);
    const apiKey = randomBytes(24).toString("hex");
    const db = getDb();
    const [row] = await db.insert(tenants).values({ name: input.name, apiKey }).returning();
    return Response.json({ id: row.id, name: row.name, apiKey: row.apiKey }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
