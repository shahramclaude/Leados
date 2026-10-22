import { commitImportBatch } from "@/lib/import";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { batchId?: string; actor?: string } | null;
  if (!body?.batchId) {
    return Response.json({ error: "batchId is required." }, { status: 400 });
  }
  try {
    const report = await commitImportBatch(body.batchId, body.actor ?? "user:import-studio");
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
