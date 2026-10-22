import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { ApiError } from "@/lib/api/errors";
import { requireAdmin, generateApiKey } from "@/lib/api/auth";
import { ApiKeyCreateSchema } from "@/lib/api/schemas";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

/**
 * Admin-only. This is the single most dangerous route in the surface: it mints
 * new credentials. See docs/API.md "Security notes" / Phase 5 self-review for
 * why it is scope-gated to 'admin' and never returns an existing key's secret.
 */
export const POST = withApi("admin", async (req, { correlationId, key, rl }) => {
  try {
    requireAdmin(key);
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = ApiKeyCreateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "API key payload failed validation", parsed.error.flatten());

    const result = await handleIdempotentCreate(req, "POST /v1/api-keys", rawBody, async () => {
      const generated = generateApiKey();
      const [row] = await db
        .insert(apiKeys)
        .values({
          name: parsed.data.name,
          hashedKey: generated.hashed,
          prefix: generated.prefix,
          scopes: parsed.data.scopes,
          isAdmin: parsed.data.scopes.includes("admin"),
        })
        .returning();
      await recordAudit({ actor: key.id, action: "api_key.created", resource: "api_key", resourceId: row.id, correlationId });
      return {
        status: 201,
        body: { id: row.id, name: row.name, scopes: row.scopes, prefix: row.prefix, apiKey: generated.raw, createdAt: row.createdAt.toISOString() },
      };
    });

    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
