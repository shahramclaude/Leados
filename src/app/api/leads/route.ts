import { withDeprecationHeaders } from "@/lib/api/deprecation";
import { GET as v1GET, POST as v1POST } from "@/app/api/v1/leads/route";

// Deprecated shim — see docs/API.md "Deprecated endpoint mapping". Preserves
// exact old behavior by delegating to the v1 handler, just adds
// Deprecation/Sunset/Link headers so existing integrations keep working
// until the documented sunset date.
export async function GET(req: Request) {
  return withDeprecationHeaders(await v1GET(req), "/api/v1/leads");
}

export async function POST(req: Request) {
  return withDeprecationHeaders(await v1POST(req), "/api/v1/leads");
}
