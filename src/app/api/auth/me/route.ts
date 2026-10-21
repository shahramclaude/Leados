import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrgById, listPermissionOverrides } from "@/db/repositories/orgs";
import { effectivePermissionMatrix } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const org = await getOrgById(user.orgId);
  const overrides = await listPermissionOverrides(user.orgId);
  const matrix = effectivePermissionMatrix(overrides);
  return NextResponse.json({ user, org, permissions: matrix[user.role] });
}
