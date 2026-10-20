import { ok, withRouteErrors } from "@/lib/server/http";
import { listRoster } from "@/lib/server/repositories/roster";

export const dynamic = "force-dynamic";

export const GET = withRouteErrors(async (req) => {
  const sp = req.nextUrl.searchParams;
  const team = sp.get("team") ?? undefined;
  const search = sp.get("search") ?? undefined;
  const { rows, total } = await listRoster({ team, search });
  return ok({ rows, total });
});
