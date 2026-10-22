import { ensureDemoOrg } from "@/lib/demo";
import { handleRouteError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// Dev/demo-only bootstrap endpoint. Returns 403 in production (see
// src/lib/demo.ts). Used by the dashboard home page to get a working org +
// demo API key without a real auth system (auth is an explicit stub — see
// FEATURES.md).
export async function GET() {
  try {
    const demo = await ensureDemoOrg();
    return Response.json({ ok: true, ...demo });
  } catch (err) {
    return handleRouteError(err);
  }
}
