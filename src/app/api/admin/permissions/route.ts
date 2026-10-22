import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { PERMISSION_REGISTRY, REGISTRY_ROLES, REGISTRY_SCOPES } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// This route is the single source the admin UI reads from. Because it
// re-exports PERMISSION_REGISTRY verbatim (no hand-copied matrix), the UI
// and the CI-enforced registry can never drift — that IS the consistency
// guarantee, checked again in scripts/permission-matrix-consistency.ts.
export async function GET() {
  const result = await requireContext("GET", "/api/admin/permissions");
  if ("error" in result) return result.error;

  return NextResponse.json({ roles: REGISTRY_ROLES, scopes: REGISTRY_SCOPES, entries: PERMISSION_REGISTRY });
}
