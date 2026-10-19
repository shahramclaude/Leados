import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { buildRuleContext, runRuleEngine } from "@/lib/ruleEngine";
import { buildGraphNodes, buildGraphEdges, forceDirectedLayout, findRootCauses, buildInstitutionalMemoryDigest, type FiringSnapshot } from "@/lib/knowledgeGraph";
import { buildAdaptivePlaybook } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rootCauseOf = url.searchParams.get("rootCauseOf");
    const playbookFor = url.searchParams.get("playbookFor");

    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const ctx = buildRuleContext(projection, now);
    const evaluations = runRuleEngine(ctx);

    const nodes = forceDirectedLayout(buildGraphNodes(evaluations), buildGraphEdges(evaluations));
    const edges = buildGraphEdges(evaluations);

    // Build a pseudo firing-history by bucketing hypothesis creation dates
    // per day, using each hypothesis's ruleId as a proxy "firing" event —
    // this is institutional memory derived from the actual hypothesis log.
    const byDay = new Map<string, Set<string>>();
    for (const h of projection.hypotheses) {
      const day = h.createdAt.slice(0, 10);
      const set = byDay.get(day) ?? new Set<string>();
      set.add(h.ruleId);
      byDay.set(day, set);
    }
    for (const e of evaluations.filter((ev) => ev.firing)) {
      const day = now.toISOString().slice(0, 10);
      const set = byDay.get(day) ?? new Set<string>();
      set.add(e.ruleId);
      byDay.set(day, set);
    }
    const history: FiringSnapshot[] = [...byDay.entries()].map(([ts, set]) => ({ ts, firingRuleIds: [...set] }));
    const ruleDomain = new Map(evaluations.map((e) => [e.ruleId, e.domain]));
    const institutionalMemory = buildInstitutionalMemoryDigest(history, ruleDomain);

    const rootCauses = rootCauseOf ? findRootCauses(rootCauseOf) : null;
    const playbook = playbookFor ? buildAdaptivePlaybook(evaluations.find((e) => e.ruleId === playbookFor) ?? evaluations[0]) : null;

    const firingPlaybooks = evaluations.filter((e) => e.firing).slice(0, 6).map(buildAdaptivePlaybook);

    return Response.json({ nodes, edges, institutionalMemory, rootCauses, playbook, firingPlaybooks, decisions: projection.decisions, rootCausesLogged: projection.rootCauses });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
