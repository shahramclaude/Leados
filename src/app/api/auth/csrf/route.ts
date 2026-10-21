import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/apiUtils";
import { issueCsrfToken } from "@/lib/csrf";

// Public by design (registry: GET /api/auth/csrf) — issues a double-submit
// token so the client can authenticate the *next* mutating request. Reading
// this endpoint grants no access on its own.
export const GET = secureRoute({
  method: "GET",
  path: "/api/auth/csrf",
  handler: async () => {
    const token = await issueCsrfToken();
    return NextResponse.json({ csrfToken: token });
  },
});
