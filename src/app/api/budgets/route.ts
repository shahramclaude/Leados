import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult } from "@/lib/api-result";
import { listBudgets } from "@/services/budgets";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);
    return ok(await listBudgets(session));
  });
}
