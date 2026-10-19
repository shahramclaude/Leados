import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { buildRuleContext, runRuleEngine } from "@/lib/ruleEngine";

export const dynamic = "force-dynamic";

export interface SearchItem {
  kind: "finding" | "person" | "decision" | "hypothesis" | "rule";
  id: string;
  title: string;
  subtitle: string;
  view: string;
}

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const ctx = buildRuleContext(projection, now);
    const evaluations = runRuleEngine(ctx);

    const items: SearchItem[] = [];

    for (const e of evaluations) {
      if (e.firing) {
        items.push({ kind: "finding", id: e.ruleId, title: e.name, subtitle: `Sev ${e.severity ?? "n/a"} · ${e.domain}`, view: "signals" });
      }
      items.push({ kind: "rule", id: e.ruleId, title: e.name, subtitle: e.firing ? "firing" : "inactive", view: "signals" });
    }

    for (const p of projection.people) {
      const level = p.flightRisk > 0.6 ? "high" : p.flightRisk > 0.35 ? "medium" : "low";
      items.push({ kind: "person", id: p.id, title: p.name, subtitle: `Flight risk: ${level}`, view: "people" });
    }

    for (const d of projection.decisions) {
      const daysOpen = Math.round((now.getTime() - new Date(d.openedAt).getTime()) / 86400000);
      items.push({ kind: "decision", id: d.id, title: d.title, subtitle: `${d.outcome ? "closed" : `${daysOpen}d open`}`, view: "strategy" });
    }

    for (const h of projection.hypotheses) {
      items.push({ kind: "hypothesis", id: h.id, title: h.statement || h.ruleId, subtitle: `${h.status} · resolve by ${new Date(h.resolveBy).toLocaleDateString()}`, view: "knowledge" });
    }

    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
