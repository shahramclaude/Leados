import { db } from "@/db";
import { people, decisions, metricDefs, playbooks, insights } from "@/db/schema";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export interface SearchResultItem {
  id: string;
  type: "person" | "decision" | "metric" | "playbook" | "insight";
  title: string;
  subtitle: string;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();

  const [peopleRows, decisionRows, metricRows, playbookRows, insightRows] = await Promise.all([
    db.select().from(people),
    db.select().from(decisions),
    db.select().from(metricDefs),
    db.select().from(playbooks),
    db.select().from(insights),
  ]);

  const results: SearchResultItem[] = [];

  peopleRows.forEach((p) => {
    if (!q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) {
      results.push({ id: String(p.id), type: "person", title: p.name, subtitle: `${p.role} · ${p.team}` });
    }
  });
  decisionRows.forEach((d) => {
    if (!q || d.title.toLowerCase().includes(q) || d.owner.toLowerCase().includes(q)) {
      results.push({ id: String(d.id), type: "decision", title: d.title, subtitle: `Owner: ${d.owner} · ${d.status}` });
    }
  });
  metricRows.forEach((m) => {
    if (!q || m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)) {
      results.push({ id: m.key, type: "metric", title: m.label, subtitle: `${m.domain}` });
    }
  });
  playbookRows.forEach((p) => {
    if (!q || p.name.toLowerCase().includes(q)) {
      results.push({ id: String(p.id), type: "playbook", title: p.name, subtitle: `${p.domain} · ${p.status}` });
    }
  });
  insightRows.forEach((i) => {
    if (!q || i.title.toLowerCase().includes(q)) {
      results.push({ id: String(i.id), type: "insight", title: i.title, subtitle: i.domain });
    }
  });

  return cachedJson(results.slice(0, 50));
}
