import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk, validateBody, isValidationFailure, jsonError } from "@/lib/api";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("findings", async (_req, requestId) => {
  await ensureBaselineData(db);
  const findings = await db.select().from(schema.findings).orderBy(desc(schema.findings.createdAt));
  return jsonOk({ findings }, requestId);
});

type CreateFindingBody = {
  title: string;
  domain: string;
  severity?: string;
  tags?: string[];
  description?: string;
};

export const POST = withErrorHandling("findings", async (req, requestId) => {
  const body = await req.json().catch(() => null);
  const validated = validateBody<CreateFindingBody>(body, ["title", "domain"]);
  if (isValidationFailure(validated)) {
    return jsonError(`Missing required fields: ${validated.missing.join(", ")}`, "VALIDATION_ERROR", 400, requestId);
  }

  const [row] = await db
    .insert(schema.findings)
    .values({
      title: validated.title,
      domain: validated.domain,
      severity: validated.severity ?? "medium",
      tags: validated.tags ?? [],
      description: validated.description ?? "",
      status: "open",
    })
    .returning();

  return jsonOk({ finding: row }, requestId, 201);
});
