import { NextResponse } from "next/server";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { verifyAuditChain } from "@/lib/audit";
import { roleHasPermission } from "@/lib/authz/permissions";

// Thin HTTP wrapper around the same chain verification used by
// `npm run audit:verify` (scripts/audit-verify.mjs), for an in-app "verify
// integrity" button on the admin audit view. Restricted beyond the base
// `audit:read` permission check to owner/admin only, since a non-admin
// triggering a full-table scan repeatedly is itself a minor DoS/cost
// concern worth an extra gate.
export const GET = secureRoute({
  method: "GET",
  path: "/api/audit/verify",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");
    if (!["owner", "admin"].includes(session.role) || !roleHasPermission(session.role, "audit:read")) {
      return jsonError(403, "Forbidden");
    }
    const result = await verifyAuditChain();
    return NextResponse.json(result);
  },
});
