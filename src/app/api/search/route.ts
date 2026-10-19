import { ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { decisions, people, projects } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export type SearchResult = {
  id: string;
  type: "person" | "project" | "decision";
  title: string;
  subtitle: string;
  href: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return Response.json({ results: [] satisfies SearchResult[] });
  }

  await ensureSeeded();
  const like = `%${q}%`;

  const [peopleRows, projectRows, decisionRows] = await Promise.all([
    db
      .select()
      .from(people)
      .where(or(ilike(people.name, like), ilike(people.team, like), ilike(people.role, like)))
      .limit(6),
    db
      .select()
      .from(projects)
      .where(or(ilike(projects.name, like), ilike(projects.owner, like), ilike(projects.team, like)))
      .limit(6),
    db
      .select()
      .from(decisions)
      .where(or(ilike(decisions.title, like), ilike(decisions.owner, like)))
      .limit(6),
  ]);

  const results: SearchResult[] = [
    ...peopleRows.map((p) => ({
      id: `person-${p.id}`,
      type: "person" as const,
      title: p.name,
      subtitle: `${p.role} · ${p.team}`,
      href: `/understand/people?highlight=${p.id}`,
    })),
    ...projectRows.map((p) => ({
      id: `project-${p.id}`,
      type: "project" as const,
      title: p.name,
      subtitle: `${p.team} · ${p.status.replace("-", " ")}`,
      href: `/act/strategic?highlight=${p.id}`,
    })),
    ...decisionRows.map((d) => ({
      id: `decision-${d.id}`,
      type: "decision" as const,
      title: d.title,
      subtitle: `${d.owner} · ${d.status}`,
      href: `/act/decisions?highlight=${d.id}`,
    })),
  ];

  return Response.json({ results });
}
