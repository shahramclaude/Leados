import { ok, withRouteErrors } from "@/lib/server/http";
import { markAllRead } from "@/lib/server/repositories/notifications";

export const dynamic = "force-dynamic";

export const POST = withRouteErrors(async () => {
  const updated = await markAllRead();
  return ok({ updated });
});
