import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult } from "@/lib/api-result";
import { getFinding } from "@/services/findings";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);

    const { id } = await context.params;
    const row = await getFinding(session, id);
    if (!row) return fail("NOT_FOUND", "Finding not found in this org", 404);
    return ok(row);
  });
}
