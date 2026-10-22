import { NextRequest } from "next/server";
import { createPlaybook, listPlaybooks } from "@/lib/playbooks";
import { computePlaybookEffectiveness, effectivenessBadge } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "draft" | "active" | "deprecated" | null;
  try {
    const rows = await listPlaybooks({ status: status ?? undefined });
    const withEffectiveness = await Promise.all(
      rows.map(async (p) => {
        const effectiveness = await computePlaybookEffectiveness(p.id);
        return { ...p, effectiveness, badge: effectivenessBadge(effectiveness) };
      }),
    );
    return Response.json({ ok: true, playbooks: withEffectiveness });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.slug || !body.name || !body.trigger || !body.steps) {
      return Response.json({ ok: false, error: "slug, name, trigger, and steps are required" }, { status: 400 });
    }
    const playbook = await createPlaybook(body);
    return Response.json({ ok: true, playbook }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
