// Deprecated pre-v1 shim. Forwards to /api/v1/deals/{id} with identical behavior.
import { GET as v1GET, PATCH as v1PATCH } from "@/app/api/v1/deals/[id]/route";
import { withDeprecation } from "@/lib/api/shim";

export const dynamic = "force-dynamic";

export const GET = withDeprecation(v1GET, "/api/v1/deals/{id}");
export const PATCH = withDeprecation(v1PATCH, "/api/v1/deals/{id}");
