import { db } from "@/db";
import { decisions, people } from "@/db/schema";
import { ilike, or } from "drizzle-orm";
import { ROUTES } from "@/app/routes";

export const dynamic = "force-dynamic";

export interface SearchResult {
  id: string;
  kind: "route" | "person" | "decision";
  title: string;
  subtitle?: string;
  href: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return Response.json({ results: [] satisfies SearchResult[] });
  }

  const routeMatches: SearchResult[] = ROUTES.flatMap((group) =>
    group.items
      .filter((item) => item.label.toLowerCase().includes(q.toLowerCase()))
      .map((item) => ({ id: `route-${item.href}`, kind: "route" as const, title: item.label, subtitle: group.tier as string, href: item.href })),
  );

  const [peopleMatches, decisionMatches] = await Promise.all([
    db
      .select({ id: people.id, name: people.name, role: people.role, team: people.team })
      .from(people)
      .where(or(ilike(people.name, `%${q}%`), ilike(people.role, `%${q}%`), ilike(people.team, `%${q}%`)))
      .limit(6),
    db
      .select({ id: decisions.id, title: decisions.title, owner: decisions.owner })
      .from(decisions)
      .where(or(ilike(decisions.title, `%${q}%`), ilike(decisions.owner, `%${q}%`)))
      .limit(6),
  ]);

  const results: SearchResult[] = [
    ...routeMatches.slice(0, 5),
    ...peopleMatches.map((p) => ({ id: `person-${p.id}`, kind: "person" as const, title: p.name, subtitle: `${p.role} · ${p.team}`, href: `/leados/understand/people?focus=${p.id}` })),
    ...decisionMatches.map((d) => ({ id: `decision-${d.id}`, kind: "decision" as const, title: d.title, subtitle: `Owner: ${d.owner}`, href: `/leados/now/cockpit?focus=${d.id}` })),
  ];

  return Response.json({ results });
}
