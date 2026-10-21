import "@/lib/kernel/bootstrap";
import { db } from "@/db";
import { kernelBudgets, kernelCircuitBreakers } from "@/db/schema";
import { todayKey } from "@/lib/kernel/ids";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const day = todayKey();
  const budgets = await db.select().from(kernelBudgets).where(eq(kernelBudgets.day, day));
  const breakers = await db.select().from(kernelCircuitBreakers);
  return Response.json({ day, budgets, circuitBreakers: breakers });
}
