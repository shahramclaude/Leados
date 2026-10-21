import { eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets } from "@/db/schema";
import { can } from "@/lib/permissions";
import { ensureBudget, currentPeriod } from "@/lib/budget";
import { ForbiddenServiceError } from "@/lib/errors";
import type { SessionContext } from "@/lib/demo-auth";

export async function listBudgets(session: SessionContext) {
  if (!can(session.role, "budget:read")) {
    throw new ForbiddenServiceError("Role lacks budget:read");
  }
  await ensureBudget(session.orgId, currentPeriod());
  return db.select().from(budgets).where(eq(budgets.orgId, session.orgId));
}
