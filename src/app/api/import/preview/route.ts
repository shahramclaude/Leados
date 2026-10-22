import { previewCsvImport } from "@/lib/import";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureConnectorsSeeded();
  const body = (await req.json().catch(() => null)) as { connectorId?: string; csvText?: string } | null;
  if (!body?.csvText || !body.csvText.trim()) {
    return Response.json({ error: "csvText is required." }, { status: 400 });
  }
  const connectorId = body.connectorId ?? "csv-upload";

  try {
    const preview = await previewCsvImport(connectorId, body.csvText);
    return Response.json(preview);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
