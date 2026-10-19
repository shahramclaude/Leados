import { parseImport } from "@/lib/importAutomation";
import { appendEvents } from "@/lib/eventStore";

export const dynamic = "force-dynamic";

// POST { raw: string, confirm?: boolean }
// Without confirm -> returns a preview only. With confirm=true -> commits events.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const preview = parseImport(String(body.raw ?? ""));
    if (body.confirm) {
      const created = await appendEvents(preview.events);
      return Response.json({ ...preview, committed: created.length });
    }
    return Response.json(preview);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
