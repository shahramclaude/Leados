import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { PUBLIC_API_ROUTES } from "@/lib/permissions";
import { ForbiddenServiceError } from "@/lib/errors";
import type { ApiKeyContext } from "@/lib/tenancy";

/** Public API read, scoped strictly by the API key's resolved orgId — never
 * by any value the caller supplies. See tests/seams/tenancy-public-api.test.ts
 * and tests/seams/permission-registry-routes.test.ts. */
export async function listPublicFindings(ctx: ApiKeyContext) {
  const requiredScope = PUBLIC_API_ROUTES["GET /api/public/v1/findings"];
  if (!ctx.scopes.includes(requiredScope)) {
    throw new ForbiddenServiceError(`API key lacks scope ${requiredScope}`);
  }

  return db
    .select({
      id: findings.id,
      domain: findings.domain,
      title: findings.title,
      summary: findings.summary,
      explanation: findings.explanation,
      causalConfidence: findings.causalConfidence,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .where(eq(findings.orgId, ctx.orgId))
    .orderBy(desc(findings.createdAt));
}
