// src/app/api/intelligence/route.ts
//
// Demo/verification endpoint for Part 1: runs the full orchestrator
// (belief fabric -> rules -> causal chains -> signal fusion -> talent /
// finance / execution engines -> narrative synthesis -> broadcast) against
// a synthetic event stream so the whole pipeline is runtime-exercisable
// without needing live integrations wired up yet.

import { runOrchestrator } from "@/lib/orchestrator";
import type { LeadosEvent, LeadosMetrics, LeadosPerson } from "@/lib/types";

export const dynamic = "force-dynamic";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function buildSampleData(): { events: LeadosEvent[]; people: LeadosPerson[]; metrics: LeadosMetrics } {
  const people: LeadosPerson[] = [
    { id: "p1", name: "Avery Chen", teamId: "platform", level: "L6", hasSuccessor: false, calendarLoadPct: 82 },
    { id: "p2", name: "Jordan Reyes", teamId: "platform", level: "L4", hasSuccessor: true, calendarLoadPct: 55 },
    { id: "p3", name: "Priya Nair", teamId: "growth", level: "L5", hasSuccessor: false, calendarLoadPct: 76 },
    { id: "p4", name: "Sam Okafor", teamId: "growth", level: "L3", startDate: daysAgo(20), calendarLoadPct: 40 },
    { id: "p5", name: "Lena Petrov", teamId: "platform", level: "L2", startDate: daysAgo(10), calendarLoadPct: 35 },
  ];

  const events: LeadosEvent[] = [
    { id: "e1", type: "decision.action_item.created", occurredAt: daysAgo(20) },
    { id: "e2", type: "decision.action_item.created", occurredAt: daysAgo(15) },
    { id: "e3", type: "decision.action_item.overdue", occurredAt: daysAgo(5) },
    { id: "e4", type: "decision.action_item.overdue", occurredAt: daysAgo(3) },
    { id: "e5", type: "people.pulse.logged", occurredAt: daysAgo(4), personId: "p1", data: { morale: 4, psychSafety: 5 } },
    { id: "e6", type: "people.pulse.logged", occurredAt: daysAgo(6), personId: "p3", data: { morale: 5, psychSafety: 6 } },
    { id: "e7", type: "people.conflict.logged", occurredAt: daysAgo(10), teamId: "growth" },
    { id: "e8", type: "people.conflict.logged", occurredAt: daysAgo(8), teamId: "growth" },
    { id: "e9", type: "ops.tech_debt.flagged", occurredAt: daysAgo(30) },
    { id: "e10", type: "ops.tech_debt.flagged", occurredAt: daysAgo(20) },
    { id: "e11", type: "finance.runway.snapshot", occurredAt: daysAgo(10), data: { months: 7 } },
    { id: "e12", type: "finance.budget.snapshot", occurredAt: daysAgo(10), data: { actual: 120000, planned: 100000 } },
    { id: "e13", type: "strategy.board.signal", occurredAt: daysAgo(15), data: { sentiment: 0.4 } },
    { id: "e14", type: "ops.retro.logged", occurredAt: daysAgo(12), teamId: "platform" },
    { id: "e15", type: "risk.compliance.flag", occurredAt: daysAgo(40) },
  ];

  const metrics: LeadosMetrics = {
    decisionHealthIndex: { avgCycleTimeDays: 12 },
    orgNetwork: {
      nodes: people.map((p) => ({ personId: p.id, connections: p.id === "p5" ? 0 : 3 })),
      isolatedCount: 1,
      totalNodes: people.length,
    },
    projectConfidenceSnapshots: [
      { projectId: "proj-a", takenAt: daysAgo(30), confidence: 0.8 },
      { projectId: "proj-a", takenAt: daysAgo(5), confidence: 0.6 },
    ],
    npsSnapshots: [
      { takenAt: daysAgo(80), score: 42 },
      { takenAt: daysAgo(40), score: 40 },
      { takenAt: daysAgo(2), score: 30 },
    ],
  };

  return { events, people, metrics };
}

export async function GET() {
  try {
    const { events, people, metrics } = buildSampleData();
    const result = await runOrchestrator(events, people, metrics, new Date());
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[api/intelligence] failed", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
