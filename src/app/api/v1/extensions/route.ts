import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { extensions } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { requireAdmin } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { getExtension, listExtensions } from "@/lib/api/extensions/registry";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { CreateExtensionSchema } from "@/lib/api/schemas";
import { serializeExtension } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

export const GET = withApiRoute("extensions:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(extensions.orgId, ctx.auth.orgId)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(extensions.createdAt, new Date(cursor.v)),
        and(eq(extensions.createdAt, new Date(cursor.v)), op(extensions.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(extensions)
    .where(and(...conditions))
    .orderBy(dir(extensions.createdAt), dir(extensions.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeExtension);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  const availableTypes = listExtensions().map((d) => ({
    kind: d.kind,
    type: d.type,
    description: d.description,
    requiredCapability: d.requiredCapability,
  }));
  return jsonOk({ data: page, availableTypes, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

// Registering a third-party extension instance is admin-gated: the config is
// validated against the extension type's own zod schema (Section E) and the
// declared `requiredCapability` is checked against Part 07's capability
// registry before the row is ever persisted, so a malicious/broken config
// can never be silently activated.
export const POST = withApiRoute("extensions:write", async (req, ctx) => {
  requireAdmin(ctx.auth);
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = CreateExtensionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const def = getExtension(parsed.data.kind, parsed.data.type);
  if (!def) {
    throw new ApiError("VALIDATION_ERROR", `Unknown extension type "${parsed.data.kind}:${parsed.data.type}".`);
  }
  const configResult = def.configSchema.safeParse(parsed.data.config ?? {});
  if (!configResult.success) {
    throw new ApiError("VALIDATION_ERROR", "Extension config failed validation against its type schema.", configResult.error.flatten());
  }

  const [created] = await db
    .insert(extensions)
    .values({
      orgId: ctx.auth.orgId,
      kind: parsed.data.kind,
      type: parsed.data.type,
      key: parsed.data.key,
      config: configResult.data as object,
    })
    .returning();

  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "extension.registered",
    resourceType: "extension",
    resourceId: created.id,
    metadata: { kind: created.kind, type: created.type },
    correlationId: ctx.correlationId,
  });

  return jsonOk(serializeExtension(created), ctx.correlationId, { status: 201, rateLimit: ctx.rateLimit });
});
