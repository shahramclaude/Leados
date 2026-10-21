import { db } from "@/db";
import { decisionTreeNodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTree, probabilitySensitivity, type TreeNodeRow } from "@/lib/decisionTrees";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  const tree = await getTree(decisionId);
  const rows = await db.select().from(decisionTreeNodes).where(eq(decisionTreeNodes.decisionId, decisionId));
  const nodes: TreeNodeRow[] = rows.map((r) => ({
    id: r.id,
    decisionId: r.decisionId,
    parentId: r.parentId,
    nodeType: r.nodeType as TreeNodeRow["nodeType"],
    label: r.label,
    probability: r.probability != null ? num(r.probability) : null,
    payoff: r.payoff != null ? num(r.payoff) : null,
  }));
  const sensitivity = probabilitySensitivity(nodes);
  return Response.json({ tree, sensitivity });
}
