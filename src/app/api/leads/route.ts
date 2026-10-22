// Deprecated pre-v1 shim. Forwards to /api/v1/leads with identical behavior.
// See docs/API.md "Deprecation policy" — removal no sooner than the Sunset date.
import { GET as v1GET, POST as v1POST } from "@/app/api/v1/leads/route";
import { withDeprecation } from "@/lib/api/shim";

export const dynamic = "force-dynamic";

export const GET = withDeprecation(v1GET, "/api/v1/leads");
export const POST = withDeprecation(v1POST, "/api/v1/leads");
