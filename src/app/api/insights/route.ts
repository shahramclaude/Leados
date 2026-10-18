import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadosInsights, leadosFindings, leadosPeople } from "@/db/schema";
import { loadGraph } from "@/lib/knowledgeGraph";
import { buildOrgNarrative, explainFinding, generateWeeklyBriefing, type OrgState } from "@/lib/narrativeIntel";
import { ensureSeeded, refreshInsights } from "@/lib/seedOrgData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(req.url);

    // generateWeeklyBriefing
    if (searchParams.get("weekly")) {
      const graph = await loadGraph();
      const openFindings = await db.select().from(leadosFindings).where(eq(leadosFindings.status, "open"));
      const openFindingsBySeverity: Record<number, number> = {};
      for (const f of openFindings) {
        openFindingsBySeverity[f.severity] = (openFindingsBySeverity[f.severity] ?? 0) + 1;
      }
      const people = await db.select().from(leadosPeople);
      const recentDecisionNodes = graph.nodes
        .filter((n) => n.type === "decision")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      const state: OrgState = {
        openFindingsBySeverity,
        recentDecisions: recentDecisionNodes.map((n) => ({
          title: n.label,
          domain: n.tags.find((t) => t !== "decision") ?? "General",
          createdAt: new Date(n.createdAt),
        })),
        peopleCount: people.length,
        metricsTrend: graph.nodes
          .filter((n) => n.type === "metric")
          .map((n) => ({
            name: n.label,
            direction: (n.tags.includes("up") ? "up" : n.tags.includes("down") ? "down" : "flat") as "up" | "down" | "flat",
          })),
      };

      const briefing = generateWeeklyBriefing(state, graph, new Date());
      return Response.json(briefing);
    }

    // buildOrgNarrative over the last N days (default 30)
    if (searchParams.get("narrative")) {
      const days = parseInt(searchParams.get("days") ?? "30", 10);
      const graph = await loadGraph();
      const to = new Date();
      const from = new Date(to.getTime() - (Number.isFinite(days) ? days : 30) * 86_400_000);
      const narrative = buildOrgNarrative(graph, { from, to });
      return Response.json(narrative);
    }

    // explainFinding(finding, graph) — pass the finding's entityId
    const explain = searchParams.get("explain");
    if (explain) {
      const graph = await loadGraph();
      const findingNode = graph.nodes.find((n) => n.type === "finding" && n.entityId === explain);
      if (!findingNode) return Response.json({ error: "Finding not found" }, { status: 404 });
      const explanation = explainFinding(findingNode, graph);
      return Response.json(explanation);
    }

    // Plain insights feed, optionally filtered by status.
    const status = searchParams.get("status");
    const rows = status
      ? await db.select().from(leadosInsights).where(eq(leadosInsights.status, status)).orderBy(sql`created_at desc`)
      : await db.select().from(leadosInsights).orderBy(sql`created_at desc`);
    return Response.json({ insights: rows });
  } catch (err) {
    console.error("GET /api/insights failed", err);
    return Response.json({ error: "Failed to load insights" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body as { id: number; status: "new" | "reviewed" | "archived" };
    if (!id || !status) return Response.json({ error: "id and status are required" }, { status: 400 });
    const [updated] = await db.update(leadosInsights).set({ status }).where(eq(leadosInsights.id, id)).returning();
    return Response.json({ insight: updated });
  } catch (err) {
    console.error("PATCH /api/insights failed", err);
    return Response.json({ error: "Failed to update insight" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "regenerate") {
      const inserted = await refreshInsights();
      return Response.json({ inserted });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/insights failed", err);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}
