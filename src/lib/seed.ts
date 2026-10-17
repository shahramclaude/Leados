import * as store from "./core";

/**
 * DISCLOSURE: every event below is fabricated for this delivery, not real
 * organizational data. It exists so the Organizational Moment / Five
 * Things / Hardest Question sections have real numbers to compute from on
 * first load, and so most of the "hardest question" branches are
 * reachable by stepping through #/lab rather than only the default
 * fallback question. 6 domains (people, finance, ops, strategy, legal,
 * product) — the 6th ("product") was added beyond the prior session's
 * 5-domain set purely to match this repo's own "Part 6: 6 domains"
 * convention; it is not a verified fact about the real product.
 */

function daysAgo(n: number, hour = 9): string {
  const d = new Date(Date.now() - n * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function seedIfEmpty() {
  if (store.hasData()) return;
  const put = store.appendAt;

  // People (broken line: p-ghost reports to a nonexistent id)
  put("person.added", { id: "p-ceo", name: "Dana Reyes", title: "CEO", reportsTo: null, createdAt: daysAgo(900) }, daysAgo(900));
  put("person.added", { id: "p-vpe", name: "Marcus Lin", title: "VP Engineering", reportsTo: "p-ceo", createdAt: daysAgo(500) }, daysAgo(500));
  put("person.added", { id: "p-vps", name: "Priya Shah", title: "VP Sales", reportsTo: "p-ceo", createdAt: daysAgo(400) }, daysAgo(400));
  put("person.added", { id: "p-vpp", name: "Elena Tran", title: "VP Product", reportsTo: "p-ceo", createdAt: daysAgo(320) }, daysAgo(320));
  put("person.added", { id: "p-eng1", name: "Jordan Kim", title: "Eng Lead", reportsTo: "p-vpe", createdAt: daysAgo(200) }, daysAgo(200));
  put("person.added", { id: "p-sales1", name: "Alicia Cruz", title: "AE", reportsTo: "p-vps", createdAt: daysAgo(150) }, daysAgo(150));
  put("person.added", { id: "p-ghost", name: "Ravi Desai", title: "Contractor PM", reportsTo: "p-missing", createdAt: daysAgo(90) }, daysAgo(90));

  // Domain signals — a mix of ages so temporal buckets are non-trivial.
  const signals: [number, number, string, string][] = [
    // legal — old, structural
    [240, 3.5, "legal", "Vendor DPA clause still unresolved"],
    [210, 2.5, "legal", "Contract renewal ambiguity noted"],
    [195, 3.0, "legal", "Regulatory inquiry opened (info only)"],
    // people — mid-age, strategic drift
    [95, 4.0, "people", "Attrition spike in eng org"],
    [80, 3.0, "people", "Engagement survey dipped"],
    [60, 2.5, "people", "Manager layer feels 1 level too thin"],
    // ops — recent, reactive
    [12, 4.5, "ops", "On-call paged 3 nights running"],
    [6, 3.0, "ops", "Deploy pipeline flaky again"],
    [2, 3.5, "ops", "Customer-facing outage, 40min"],
    // finance — recent, reactive
    [9, 3.0, "finance", "Runway forecast revised down"],
    [4, 2.0, "finance", "Minor budget variance in Q"],
    // strategy — mid-age
    [110, 3.0, "strategy", "Roadmap bet unproven after one quarter"],
    // product — recent
    [15, 3.5, "product", "Churned-customer interviews flag onboarding gap"],
  ];
  signals.forEach(([d, sev, domain, title]) => put("signal.raised", { domain, severity: sev, title }, daysAgo(d)));

  // Goals — one ownerless, one silent
  put("goal.set", { id: "g-1", title: "Cut onboarding time 30%", domain: "product", ownerId: null }, daysAgo(70));
  put("goal.set", { id: "g-2", title: "Close legal DPA gap", domain: "legal", ownerId: "p-ceo" }, daysAgo(200));
  put("goal.set", { id: "g-3", title: "Stabilize on-call rotation", domain: "ops", ownerId: "p-vpe" }, daysAgo(40));
  put("goal.progress", { goalId: "g-3" }, daysAgo(35));

  // Decisions — some with confidence + outcome for calibration, two stale/avoided
  put("decision.logged", { id: "d-1", title: "Ship pricing change", domain: "finance", confidence: 0.85 }, daysAgo(160));
  put("decision.outcome", { decisionId: "d-1", outcome: "failure" }, daysAgo(150));
  put("decision.logged", { id: "d-2", title: "Hire VP Product", domain: "people", confidence: 0.7 }, daysAgo(330));
  put("decision.outcome", { decisionId: "d-2", outcome: "success" }, daysAgo(300));
  put("decision.logged", { id: "d-3", title: "Expand into new region", domain: "strategy", confidence: 0.8 }, daysAgo(120));
  put("decision.outcome", { decisionId: "d-3", outcome: "failure" }, daysAgo(90));
  put("decision.logged", { id: "d-4", title: "Rebuild legal escalation path", domain: "legal" }, daysAgo(75)); // stale, no outcome, no confidence — avoidance candidate
  put("decision.logged", { id: "d-5", title: "Sunset legacy on-call tool", domain: "ops" }, daysAgo(50)); // also stale

  // Commitments — one overdue
  put("commitment.made", { id: "c-1", ownerId: "p-vps", desc: "Send updated sales forecast", by_date: daysAgo(-5) }, daysAgo(20));

  // Snoozes — repeated, to feed avoidance + suppression branches
  put("engine.snoozed", { key: "decision-stale:d-4" }, daysAgo(60));
  put("engine.snoozed", { key: "decision-stale:d-4" }, daysAgo(40));
  put("engine.snoozed", { key: "decision-stale:d-4" }, daysAgo(20));
  put("engine.snoozed", { key: "goal-ownerless:g-1" }, daysAgo(50));
  put("engine.snoozed", { key: "goal-ownerless:g-1" }, daysAgo(25));

  // Wins / culture, for a non-zero energy source side
  put("goal.closed", { goalId: "g-0", result: "done" }, daysAgo(10));
  put("conflict.resolved", {}, daysAgo(18));
  put("culture.signal", { polarity: "positive" }, daysAgo(8));
  put("culture.signal", { polarity: "positive" }, daysAgo(22));

  // Pipeline checks for information entropy
  put("info.pipeline.check", { name: "Weekly metrics digest", blocked: false }, daysAgo(14));
  put("info.pipeline.check", { name: "Customer health sync", blocked: true }, daysAgo(7));

  // Growth plans — several open, no spine movement, feeds the coaching question
  put("growth.plan.opened", { id: "gp-1", personId: "p-eng1", domain: "ops", startD: "D2" }, daysAgo(100));
  put("growth.plan.opened", { id: "gp-2", personId: "p-sales1", domain: "finance", startD: "D1" }, daysAgo(80));
  put("growth.plan.opened", { id: "gp-3", personId: "p-vpp", domain: "product", startD: "D3" }, daysAgo(60));
  put("growth.plan.opened", { id: "gp-4", personId: "p-vps", domain: "strategy", startD: "D2" }, daysAgo(30));

  // No succession.candidate events on purpose — org is old enough (900d) for that branch to be reachable from #/lab.
}
