// Public API (Part 14 lineage).
//
// Tenancy (Part 13) and the permission registry (Part 17) both apply here:
// the org is resolved exclusively from the API key, and the key's scopes are
// checked against PUBLIC_API_ROUTES, the same registry the UI and internal
// routes use.

import { NextRequest } from "next/server";
import { resolveApiKeyContext } from "@/lib/tenancy";
import { ok, withApiResult } from "@/lib/api-result";
import { listPublicFindings } from "@/services/public-findings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withApiResult(async () => {
    const ctx = await resolveApiKeyContext(request.headers.get("authorization"));
    const rows = await listPublicFindings(ctx);
    return ok(rows);
  });
}
