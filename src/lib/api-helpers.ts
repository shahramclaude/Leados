import "server-only";
import { NextResponse } from "next/server";
import { getOrgContext, type OrgContext } from "@/lib/org-context";
import { assertPermission, canAccessDomain } from "@/lib/rbac";
import type { DomainScope } from "@/db/schema";

export type ApiResult = { ctx: OrgContext } | { error: NextResponse };

/**
 * Single chokepoint used by every tenant API route: resolves the session,
 * then checks the route→permission registry (RBAC) by method+path. Routes
 * never do their own ad-hoc role checks.
 */
export async function requireContext(method: string, requestPath: string, orgId?: string): Promise<ApiResult> {
  const ctx = await getOrgContext(orgId);
  if (!ctx) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }

  const check = assertPermission({ role: ctx.role, scopes: ctx.scopes }, method, requestPath);
  if (!check.ok) {
    return { error: NextResponse.json({ error: check.status === 404 ? "no-such-route" : "forbidden" }, { status: check.status }) };
  }

  return { ctx };
}

export function requireDomainScope(ctx: OrgContext, domain: DomainScope, mode: "read" | "write"): NextResponse | null {
  if (!canAccessDomain({ role: ctx.role, scopes: ctx.scopes }, domain, mode)) {
    return NextResponse.json({ error: "forbidden-scope" }, { status: 403 });
  }
  return null;
}

/** Cross-tenant guard: the orgId in the URL must match the caller's session org. */
export function requireMatchingOrg(ctx: OrgContext, orgIdFromUrl: string): NextResponse | null {
  if (ctx.orgId !== orgIdFromUrl) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return null;
}
