import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { runHrisSync, AVAILABLE_FIXTURES, type FixtureName } from "@/lib/syncEngine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await ensureConnectorsSeeded();

  if (id !== "hris-directory") {
    return Response.json(
      { error: `Connector "${id}" is push-only (or unknown) and cannot be triggered via /sync. Use /api/import/preview + /api/import/commit.` },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; fixture?: string; actor?: string };
  const dryRun = body.dryRun ?? true;
  const fixture = AVAILABLE_FIXTURES.includes(body.fixture as FixtureName) ? (body.fixture as FixtureName) : "success";
  const actor = body.actor ?? "user:data-sources-ui";

  try {
    const outcome = await runHrisSync(id, { dryRun, fixture, actor });
    return Response.json(outcome);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
