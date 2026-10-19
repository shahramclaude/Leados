import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("signals", async (_req, requestId) => {
  await ensureBaselineData(db);

  const findings = await db.select().from(schema.findings).orderBy(desc(schema.findings.createdAt));
  const instances = await db.select().from(schema.playbookInstances);
  const playbooks = await db.select().from(schema.playbooks);

  const signals = findings.map((f) => {
    const relatedInstances = instances.filter((i) => i.findingId === f.id);
    return {
      finding: f,
      playbookInstances: relatedInstances.map((i) => ({
        ...i,
        playbookName: playbooks.find((p) => p.id === i.playbookId)?.name ?? "Unknown",
      })),
    };
  });

  return jsonOk({ signals }, requestId);
});

type PatchSignalBody = { findingId: number; status: string };

export const PATCH = withErrorHandling("signals", async (req, requestId) => {
  const body = (await req.json().catch(() => null)) as PatchSignalBody | null;
  if (!body || typeof body.findingId !== "number" || typeof body.status !== "string") {
    return Response.json(
      { error: "findingId (number) and status (string) are required", code: "VALIDATION_ERROR", requestId },
      { status: 400 },
    );
  }
  await db.update(schema.findings).set({ status: body.status }).where(eq(schema.findings.id, body.findingId));
  return jsonOk({ ok: true }, requestId);
});
