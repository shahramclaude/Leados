// Deprecated pre-v1 shim. Forwards to /api/v1/deals with identical behavior.
import { GET as v1GET, POST as v1POST } from "@/app/api/v1/deals/route";
import { withDeprecation } from "@/lib/api/shim";

export const dynamic = "force-dynamic";

export const GET = withDeprecation(v1GET, "/api/v1/deals");
export const POST = withDeprecation(v1POST, "/api/v1/deals");
