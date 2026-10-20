// Dev/bootstrap helper for minting API tokens. In a real deployment this
// route would sit behind the authenticated admin/settings UI (session auth),
// not be open to the internet — gate it here with TOKEN_BOOTSTRAP_SECRET so
// the platform is still usable out of the box in dev/CI without a secret
// configured, but safely lockable in production.
import { ApiTokenCreateSchema } from "@/lib/openapi/schemas";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { ApiError } from "@/lib/platform/envelope";
import { withApiPublic } from "@/lib/platform/handler";
import { generateToken } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export const POST = withApiPublic(async (req) => {
  const bootstrapSecret = process.env.TOKEN_BOOTSTRAP_SECRET;
  if (bootstrapSecret) {
    const provided = req.headers.get("x-bootstrap-secret");
    if (provided !== bootstrapSecret) {
      throw new ApiError("UNAUTHORIZED", "Invalid or missing X-Bootstrap-Secret header");
    }
  }

  const json = await req.json().catch(() => null);
  const parsed = ApiTokenCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid token request", parsed.error.flatten());
  }

  const { raw, prefix, hash } = generateToken();

  const [row] = await db
    .insert(apiTokens)
    .values({
      orgId: parsed.data.orgId,
      name: parsed.data.name,
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute ?? 120,
    })
    .returning();

  return Response.json(
    {
      id: row.id,
      name: row.name,
      token: raw,
      prefix,
      scopes: row.scopes,
      rateLimitPerMinute: row.rateLimitPerMinute,
    },
    { status: 201 },
  );
});
