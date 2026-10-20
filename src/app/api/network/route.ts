// Returns a small relationship graph (findings + decisions as nodes, with
// edges when a decision references a finding's score band) for the network
// view. Node/edge count is capped — the force layout itself runs in a Web
// Worker (src/workers/computeWorker.ts) so this route only ever has to
// serialize a bounded payload, never lay anything out.
import { db } from "@/db";
import { decisions, findings } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MAX_NODES_PER_KIND = 60;

export async function GET() {
  const [findingRows, decisionRows] = await Promise.all([
    db.select().from(findings).orderBy(desc(findings.score)).limit(MAX_NODES_PER_KIND),
    db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(MAX_NODES_PER_KIND),
  ]);

  const nodes = [
    ...findingRows.map((f) => ({ id: `finding-${f.id}`, label: f.title, kind: "finding" as const, weight: Number(f.score) })),
    ...decisionRows.map((d) => ({ id: `decision-${d.id}`, label: d.title, kind: "decision" as const, weight: 1 })),
  ];

  const edges: { source: string; target: string }[] = [];
  for (const d of decisionRows) {
    // Deterministic pairing so the graph is stable between requests: link a
    // decision to the two highest-scoring findings created before it.
    const related = findingRows.filter((f) => f.createdAt <= d.createdAt).slice(0, 2);
    for (const f of related) {
      edges.push({ source: `decision-${d.id}`, target: `finding-${f.id}` });
    }
  }

  return Response.json({ nodes, edges });
}
