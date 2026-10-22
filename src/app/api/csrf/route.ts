import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/apiUtils";
import { issueCsrfToken } from "@/lib/csrf";

export const GET = secureRoute({
  method: "GET",
  path: "/api/csrf",
  handler: async () => {
    const token = await issueCsrfToken();
    return NextResponse.json({ csrfToken: token });
  },
});
