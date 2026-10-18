// Synthetic roster + event log for the pt-U talent/financial/regulatory/narrative/
// physics sandbox. Entirely fabricated demo data, deterministic per seed value.
// Disclosed: none of this is real company data — it exists purely so the engines
// in talent.ts / financialOS.ts / regulatory.ts / narrativeIntel.ts / orgODE.ts
// have something to compute against.
import { mulberry32 } from "./prng";
import type { AppState, Evt, EventType, Person } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (base: Date, n: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return iso(d);
};

let seq = 0;
function mkEvt(ts: string, type: EventType, data: Record<string, any>): Evt {
  seq += 1;
  return { id: `e${seq}`, ts, type, data };
}

export function generateSeed(seedNum = 42): AppState {
  seq = 0;
  const rnd = mulberry32(seedNum);
  const today = new Date();

  const people: Person[] = [
    { id: "p1", name: "Dana Okafor", role: "VP Engineering", title: "VP Eng", isDirect: true },
    { id: "p2", name: "Marcus Lee", role: "VP Sales", title: "VP Sales", isDirect: true },
    { id: "p3", name: "Priya Nair", role: "Head of Product", title: "Head of Product", isDirect: true },
    { id: "p4", name: "Tom Vance", role: "Head of Finance", title: "Head of Finance", isDirect: true },
    { id: "p5", name: "Elena Cruz", role: "Head of Legal & Compliance", title: "GC", isDirect: true },
    { id: "p6", name: "Sam Osei", role: "Staff Engineer", title: "Staff Eng", isDirect: false },
    { id: "p7", name: "Jin Park", role: "Senior Engineer", title: "Sr Eng", isDirect: false },
    { id: "p8", name: "Ava Thompson", role: "Enterprise AE", title: "AE", isDirect: false },
    { id: "p9", name: "Noah Fischer", role: "Product Manager", title: "PM", isDirect: false },
    { id: "p10", name: "Ravi Chandran", role: "Compliance Analyst", title: "Analyst", isDirect: false },
  ];

  const events: Evt[] = [];

  // ---------- talent ----------
  // Succession candidates: cover VP Eng, VP Sales well; leave Head of Finance and
  // Head of Legal & Compliance as single-point-of-failure gaps (R208/R209 fodder).
  events.push(
    mkEvt(daysAgo(today, 40), "talent.succession.candidate", {
      personId: "p6", targetRoleId: "VP Engineering", readiness: "ready_now",
      strengths: ["systems design", "mentorship"], gaps: ["exec communication"], nominatorId: "p1",
    }),
    mkEvt(daysAgo(today, 35), "talent.succession.candidate", {
      personId: "p7", targetRoleId: "VP Engineering", readiness: "1_year",
      strengths: ["delivery"], gaps: ["org-wide influence"], nominatorId: "p1",
    }),
    mkEvt(daysAgo(today, 30), "talent.succession.candidate", {
      personId: "p8", targetRoleId: "VP Sales", readiness: "ready_now",
      strengths: ["enterprise closing"], gaps: ["forecasting discipline"], nominatorId: "p2",
    }),
    mkEvt(daysAgo(today, 20), "talent.succession.candidate", {
      personId: "p9", targetRoleId: "Head of Product", readiness: "2_year",
      strengths: ["roadmap thinking"], gaps: ["stakeholder management"], nominatorId: "p3",
    }),
    // Deliberately no candidates logged for "Head of Finance" or "Head of Legal & Compliance".
  );

  const capabilities = [
    "ml_infra", "enterprise_sales_motion", "sox_compliance", "platform_scaling", "gtm_strategy",
  ];
  const capAssessPeople = ["p6", "p7", "p8", "p9", "p10", "p1", "p2"];
  capAssessPeople.forEach((pid, i) => {
    const cap = capabilities[i % capabilities.length];
    events.push(
      mkEvt(daysAgo(today, 50 - i * 3), "talent.capability.assessment", {
        personId: pid, capability: cap, level: 1 + Math.floor(rnd() * 4), assessedBy: "p1",
      })
    );
  });
  // A couple of extra assessments to make "currentMax" meaningful for sox_compliance (kept low -> gap).
  events.push(
    mkEvt(daysAgo(today, 15), "talent.capability.assessment", {
      personId: "p10", capability: "sox_compliance", level: 2, assessedBy: "p5",
    })
  );

  events.push(
    mkEvt(daysAgo(today, 25), "talent.headcount.plan", {
      roleId: "Staff Compliance Engineer", level: 5, priority: "critical",
      capability: "sox_compliance", targetQuarter: "Q1", rationale: "SOX audit readiness",
      approvedBy: "p4",
    }),
    mkEvt(daysAgo(today, 18), "talent.headcount.plan", {
      roleId: "Senior ML Engineer", level: 4, priority: "high",
      capability: "ml_infra", targetQuarter: "Q2", rationale: "AI roadmap commitments",
      approvedBy: "p1",
    }),
    mkEvt(daysAgo(today, 10), "talent.headcount.plan", {
      roleId: "Enterprise AE #4", level: 3, priority: "standard",
      capability: "enterprise_sales_motion", targetQuarter: "Q2", rationale: "pipeline coverage",
      approvedBy: "p2",
    })
  );

  events.push(
    mkEvt(daysAgo(today, 12), "talent.calibration.session", {
      date: daysAgo(today, 12), attendees: ["p1", "p2", "p3"],
      outcomes: [{ personId: "p6", rating: "exceeds", action: "accelerate to VP track" }],
    })
  );

  // ---------- financial ----------
  const finMetric = (name: string, value: number, offsetDays: number) =>
    mkEvt(daysAgo(today, offsetDays), "fin.metric", { metric: name, value });

  events.push(
    finMetric("mrr", 410000, 2),
    finMetric("arr", 4920000, 2),
    finMetric("customer_count", 168, 2),
    finMetric("cac", 9200, 2),
    finMetric("ltv", 34500, 2),
    finMetric("gross_margin_pct", 76, 2),
    finMetric("revenue_growth_pct", 34, 2),
    finMetric("ebitda_margin_pct", 4, 2),
    finMetric("cash", 6200000, 1),
    finMetric("monthly_burn", 480000, 1)
  );

  for (let i = 0; i < 9; i++) {
    events.push(
      mkEvt(daysAgo(today, 1 + i * 3), "sales.deal.closed", {
        result: "won", value: 24000 + Math.floor(rnd() * 36000),
      })
    );
  }
  events.push(
    mkEvt(daysAgo(today, 10), "cs.churn.logged", { mrr_lost: 3800 }),
    mkEvt(daysAgo(today, 22), "cs.churn.logged", { mrr_lost: 2100 })
  );

  // ---------- regulatory ----------
  events.push(
    mkEvt(daysAgo(today, 90), "reg.jurisdiction", {
      name: "EU", region: "Europe", relevantFrameworks: ["GDPR", "AI Act", "DORA"],
    }),
    mkEvt(daysAgo(today, 90), "reg.jurisdiction", {
      name: "US-Federal", region: "North America", relevantFrameworks: ["SOX", "CCPA-equiv", "SEC-disclosure"],
    }),
    mkEvt(daysAgo(today, 90), "reg.jurisdiction", {
      name: "UK", region: "Europe", relevantFrameworks: ["UK-GDPR", "FCA"],
    })
  );
  events.push(
    mkEvt(daysAgo(today, 60), "reg.interpretation", {
      jurisdiction: "EU", framework: "GDPR", ourInterpretation: "data-minimization-strict", legalCounselReviewed: true,
    }),
    mkEvt(daysAgo(today, 55), "reg.interpretation", {
      jurisdiction: "UK", framework: "UK-GDPR", ourInterpretation: "data-minimization-permissive", legalCounselReviewed: false,
    }),
    mkEvt(daysAgo(today, 40), "reg.interpretation", {
      jurisdiction: "US-Federal", framework: "SOX", ourInterpretation: "quarterly-attestation", legalCounselReviewed: true,
    }),
    // Shared framework, deliberately conflicting interpretations across jurisdictions
    // (demonstrates detectCrossJurisdictionConflicts()).
    mkEvt(daysAgo(today, 50), "reg.interpretation", {
      jurisdiction: "EU", framework: "cross-border-data-transfer", ourInterpretation: "SCC-plus-DPIA", legalCounselReviewed: true,
    }),
    mkEvt(daysAgo(today, 48), "reg.interpretation", {
      jurisdiction: "UK", framework: "cross-border-data-transfer", ourInterpretation: "IDTA-only", legalCounselReviewed: false,
    })
    // Note: EU "AI Act" and "DORA" and US "CCPA-equiv"/"SEC-disclosure" and UK "FCA"
    // deliberately have NO interpretation logged -> coverage gaps feed exposure score.
  );
  events.push(
    mkEvt(daysAgo(today, 5), "legal.compliance.check", { jurisdiction: "EU" }),
    mkEvt(daysAgo(today, 95), "legal.compliance.check", { jurisdiction: "US-Federal" })
    // UK deliberately has no compliance check logged at all.
  );

  // ---------- narrative ----------
  const audiences: Array<{ a: string; channel: string; reactions: any[]; outcome?: string }> = [
    { a: "board", channel: "deck", reactions: [
      { personId: "p1", type: "confused" }, { personId: "p2", type: "confused" }, { personId: "p4", type: "aligned" },
    ], outcome: "deferred" },
    { a: "board", channel: "deck", reactions: [
      { personId: "p1", type: "aligned" }, { personId: "p4", type: "confused" },
    ], outcome: "approved" },
    { a: "team", channel: "all-hands", reactions: [
      { personId: "p6", type: "aligned" }, { personId: "p7", type: "aligned" }, { personId: "p9", type: "resistant" },
    ] },
    { a: "investor", channel: "email", reactions: [
      { personId: "p2", type: "aligned" },
    ], outcome: "approved" },
  ];
  audiences.forEach((entry, i) => {
    events.push(
      mkEvt(daysAgo(today, 14 + i * 9), "narrative.outcome", {
        narrativeId: `n${i + 1}`, audience: entry.a, channel: entry.channel,
        deliveredAt: daysAgo(today, 14 + i * 9), reactions: entry.reactions,
        decisionOutcome: entry.outcome,
        messagingLearning: i === 0 ? "Lead with the ask, not the model walk-through." : undefined,
      })
    );
  });

  // ---------- physics inputs ----------
  for (let w = 0; w < 6; w++) {
    events.push(
      mkEvt(daysAgo(today, w * 5), "pulse.recorded", { personId: `p${(w % 9) + 1}`, mood: 5 + rnd() * 3 })
    );
  }
  events.push(
    mkEvt(daysAgo(today, 45), "conflict.logged", { parties: ["p2", "p3"] }),
    mkEvt(daysAgo(today, 30), "conflict.resolved", { parties: ["p2", "p3"] }),
    mkEvt(daysAgo(today, 20), "conflict.logged", { parties: ["p1", "p4"] })
  );

  return { people, events };
}
