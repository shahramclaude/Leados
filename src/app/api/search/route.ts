import { db } from "@/db";
import { decisions, people, signals, metrics } from "@/db/schema";
import { ilike, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface EntityResult {
  id: string;
  type: "person" | "decision" | "signal" | "metric";
  title: string;
  subtitle: string;
  href: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  try {
    const like = `%${q}%`;
    const [peopleRows, decisionRows, signalRows, metricRows] = await Promise.all([
      db.select().from(people).where(or(ilike(people.name, like), ilike(people.role, like), ilike(people.team, like))).limit(5),
      db
        .select()
        .from(decisions)
        .where(or(ilike(decisions.title, like), ilike(decisions.owner, like), ilike(decisions.category, like)))
        .limit(5),
      db.select().from(signals).where(or(ilike(signals.label, like), ilike(signals.category, like))).limit(5),
      db.select().from(metrics).where(or(ilike(metrics.name, like), ilike(metrics.category, like))).limit(5),
    ]);

    const results: EntityResult[] = [
      ...peopleRows.map((p) => ({
        id: String(p.id),
        type: "person" as const,
        title: p.name,
        subtitle: `${p.role} · ${p.team}`,
        href: `/leados/understand?tab=people&personId=${p.id}`,
      })),
      ...decisionRows.map((d) => ({
        id: String(d.id),
        type: "decision" as const,
        title: d.title,
        subtitle: `${d.track} · ${d.status}`,
        href: `/leados/act?tab=decisions&decisionId=${d.id}`,
      })),
      ...signalRows.map((s) => ({
        id: String(s.id),
        type: "signal" as const,
        title: s.label,
        subtitle: `${s.category} · severity ${s.severity}`,
        href: `/leados/understand?tab=signals&signalId=${s.id}`,
      })),
      ...metricRows.map((m) => ({
        id: String(m.id),
        type: "metric" as const,
        title: m.name,
        subtitle: m.category,
        href: `/leados/understand?tab=metrics&metricId=${m.id}`,
      })),
    ];

    return Response.json({ results });
  } catch {
    await db.execute(sql`select 1`).catch(() => null);
    return Response.json({ results: [] }, { status: 200 });
  }
}
