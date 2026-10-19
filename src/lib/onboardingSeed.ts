import type { Domain, NewLeadosEvent, OrgProfile } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// onboardingSeed — generates 20-30 sample events tailored to an OrgProfile
// so that the Signal Board lights up immediately after onboarding. All
// events are tagged source="onboarding_sample" with a replace-me note.
// ─────────────────────────────────────────────────────────────────────────

const SOURCE = "onboarding_sample";
const NOTE = "Sample data — replace with real events";

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

export function defaultDomainsForOrgType(orgType: OrgProfile["orgType"]): Domain[] {
  switch (orgType) {
    case "startup":
      return ["finance", "people", "strategy", "rd"];
    case "scaleup":
      return ["people", "finance", "strategy", "execution", "rd", "sales", "knowledge", "manufacturing"];
    case "enterprise":
      return ["people", "finance", "strategy", "execution", "rd", "sales", "knowledge"];
    default:
      return ["people", "finance", "strategy"];
  }
}

export function onboardingSeed(profile: OrgProfile): NewLeadosEvent[] {
  const events: NewLeadosEvent[] = [];
  const base = (overrides: Partial<NewLeadosEvent>): NewLeadosEvent => ({
    type: "metric.recorded",
    domain: "strategy",
    entityId: null,
    ts: iso(0),
    data: {},
    source: SOURCE,
    ...overrides,
  });

  // Leaders become person.added events; the first leader gets exit-signal
  // pressure if topConcern is retention, so the retention rules fire.
  profile.leaders.slice(0, 5).forEach((leader, i) => {
    const id = `onb-person-${i}`;
    events.push(
      base({
        type: "person.added",
        domain: "people",
        entityId: id,
        ts: iso(180 - i * 10),
        data: { id, name: leader.name, role: leader.role, domain: "people", startDate: iso(180), performance: 70 + i, potential: 60 + i, flightRisk: 0.15, note: NOTE },
      })
    );
  });

  if (profile.topConcern === "retention" && profile.leaders.length > 0) {
    const id = "onb-person-0";
    events.push(
      base({ type: "person.exit_signal", domain: "people", entityId: id, ts: iso(3), data: { id, text: "Recruiter reached out about a counter-offer last week", note: NOTE } }),
      base({ type: "person.exit_signal", domain: "people", entityId: id, ts: iso(1), data: { id, text: "Mentioned exploring options at the team dinner", note: NOTE } })
    );
  }

  // OKR for the top concern domain.
  const goalId = "onb-goal-1";
  events.push(
    base({
      type: "goal.set",
      domain: "strategy",
      entityId: goalId,
      ts: iso(45),
      data: {
        id: goalId,
        title: `Address ${profile.topConcern.replace("_", " ")} as top priority`,
        owner: profile.leaders[0]?.name ?? "Leadership",
        quarterStart: iso(45),
        quarterLengthDays: 90,
        keyResults: [{ id: `${goalId}-kr1`, title: "Primary key result", target: 100, current: profile.topConcern === "retention" ? 28 : 40, unit: "%" }],
        note: NOTE,
      },
    })
  );

  if (profile.activeDomains.includes("finance")) {
    const lowCash = profile.topConcern === "runway";
    events.push(
      base({
        type: "finance.snapshot",
        domain: "finance",
        ts: iso(1),
        data: {
          cash: lowCash ? 180000 : 2500000,
          monthlyBurn: lowCash ? 140000 : 220000,
          mrr: 90000,
          newArr: 180000,
          churnedArr: 40000,
          customers: 40,
          newCustomers: 4,
          cac: 9000,
          grossMarginPct: 0.68,
          headcount: 22,
          rdHeadcountCost: 950000,
          totalPayroll: 1800000,
          salesSpend: 36000,
          note: NOTE,
        },
      })
    );
    ["arr_growth_rate", "net_burn", "logo_churn_rate", "nps", "pipeline_coverage", "deal_cycle_days", "support_ticket_volume", "headcount_growth_rate"].forEach(
      (key, i) => {
        for (let d = 10; d >= 0; d--) {
          events.push(
            base({ type: "metric.recorded", domain: "finance", ts: iso(d), data: { key, value: sampleMetricValue(key, d), note: NOTE } })
          );
        }
        void i;
      }
    );
  }

  if (profile.activeDomains.includes("execution") || profile.activeDomains.includes("rd")) {
    const projectId = "onb-project-1";
    events.push(
      base({ type: "project.created", domain: "execution", entityId: projectId, ts: iso(30), data: { id: projectId, title: "First major initiative", domain: "execution", owner: profile.leaders[1]?.name ?? "Team", dependsOn: [], durationDays: 30, confidence: profile.topConcern === "execution" ? 0.45 : 0.8, note: NOTE } }),
      base({ type: "milestone.created", domain: "execution", ts: iso(20), data: { id: "onb-m1", projectId, title: "Milestone 1", dueDate: iso(2), note: NOTE } }),
      base({ type: "milestone.overdue", domain: "execution", ts: iso(1), data: { id: "onb-m1", note: NOTE } })
    );
    if (profile.topConcern === "execution") {
      events.push(
        base({ type: "blocker.raised", domain: "execution", ts: iso(5), data: { id: "onb-b1", projectId, severity: "high", description: "Waiting on vendor integration", note: NOTE } })
      );
    }
  }

  if (profile.topConcern === "strategy") {
    events.push(
      base({ type: "competitor.signal", domain: "strategy", ts: iso(2), data: { competitorId: "onb-comp-1", name: "Primary Competitor", signal: "Launched aggressive pricing campaign", strength: 0.8, note: NOTE } }),
      base({ type: "competitor.signal", domain: "strategy", ts: iso(6), data: { competitorId: "onb-comp-1", name: "Primary Competitor", signal: "Hired VP of Sales from adjacent market", strength: 0.75, note: NOTE } })
    );
  }

  if (profile.topConcern === "compliance") {
    events.push(
      base({ type: "strategy.board.note", domain: "strategy", ts: iso(4), data: { text: "Board flagged compliance audit readiness as urgent.", author: "Board", note: NOTE } })
    );
  }

  events.push(base({ type: "onboarding.completed", domain: "strategy", ts: iso(0), data: { profile, note: NOTE } }));

  return events;
}

function sampleMetricValue(key: string, daysAgo: number): number {
  const base: Record<string, number> = {
    arr_growth_rate: 0.08,
    net_burn: 250000,
    logo_churn_rate: 0.02,
    nps: 42,
    pipeline_coverage: 3.2,
    deal_cycle_days: 34,
    support_ticket_volume: 120,
    headcount_growth_rate: 0.03,
  };
  const v = base[key] ?? 1;
  const wobble = Math.sin(daysAgo) * v * 0.05;
  return Number((v + wobble).toFixed(4));
}
