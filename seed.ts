// Deterministic fabricated seed log for the pt-E demo.
// Labeled: none of this is real usage data. Event-type names are a
// representative subset chosen to exercise every rule in catalog.ts; the
// real repo's events.js registry (verified this session) has 92 types with
// different names (e.g. no "oneonone.logged" was found in it).

import type { Person, LeadEvent } from "../types";
import { iso } from "../lib/utils";

// mulberry32 — small deterministic PRNG so the seed is stable across loads.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PEOPLE: Person[] = [
  { id: "p-ana", name: "Ana Ruiz", role: "VP Engineering", team: "Engineering" },
  { id: "p-dev", name: "Devon Clarke", role: "Head of Sales", team: "Revenue" },
  { id: "p-mei", name: "Mei Tanaka", role: "Director of Ops", team: "Operations" },
  { id: "p-sam", name: "Sam Okafor", role: "Finance Lead", team: "Finance" },
  { id: "p-lia", name: "Lia Petrova", role: "Product Lead", team: "Product" },
  { id: "p-raf", name: "Rafael Souza", role: "Plant Manager", team: "Manufacturing" },
];

function daysAgo(today: Date, n: number): Date {
  return new Date(today.getTime() - n * 86400000);
}

export function buildSeedEvents(today: Date): LeadEvent[] {
  const rnd = mulberry32(42);
  const events: LeadEvent[] = [];
  let seq = 1;
  const push = (daysBack: number, type: string, domain: string, data: Record<string, unknown>, personId?: string) => {
    events.push({
      id: `e${700 + seq}`,
      seq: seq++,
      type,
      domain,
      ts: iso(daysAgo(today, daysBack)),
      personId,
      data,
    });
  };

  // --- finance: three quarters of P&L, declining gross margin, rule-of-40 miss
  push(280, "fin.pl.logged", "finance", { period: "Q1-2026", revenue: 3800000, cogs: 1330000, gross_margin_pct: 65, growth_pct: 22 });
  push(190, "fin.pl.logged", "finance", { period: "Q2-2026", revenue: 4000000, cogs: 1480000, gross_margin_pct: 63, growth_pct: 18 });
  push(15, "fin.pl.logged", "finance", { period: "Q3-2026", revenue: 4200000, cogs: 1680000, gross_margin_pct: 60, growth_pct: 14 });
  push(60, "fin.cash.logged", "finance", { cash: 1200000, monthlyBurn: 260000 });
  push(10, "fin.cash.logged", "finance", { cash: 980000, monthlyBurn: 300000 });
  push(100, "fin.budget.set", "finance", { period: "FY2026", total: 16000000 });

  // --- people: cadence drift for some, healthy for others
  for (let i = 0; i < 10; i++) {
    push(7 + i * 13, "oneonone.logged", "people", { report: "p-dev", notes: "Pipeline + comp review" }, "p-dev");
  }
  for (let i = 0; i < 4; i++) {
    push(5 + i * 7, "oneonone.logged", "people", { report: "p-lia", notes: "Roadmap sync" }, "p-lia");
  }
  // Ana: last 1:1 is stale (cadence drift fires)
  push(40, "oneonone.logged", "people", { report: "p-ana", notes: "Reorg discussion" }, "p-ana");
  push(120, "skiplevel.logged", "people", { of: "p-mei" }, "p-mei");
  for (let i = 0; i < 15; i++) {
    push(3 + i * 5, "feedback.given", "people", { to: ["p-ana", "p-dev", "p-mei", "p-lia", "p-raf"][Math.floor(rnd() * 5)] });
  }
  // no influence.map.logged ever -> R50 fires unless muted

  // --- ops: weekly review cadence, mostly healthy, occasional gap
  for (let i = 0; i < 20; i++) {
    push(2 + i * 9, "ops.review.logged", "ops", { summary: "Weekly ops review #" + i });
  }

  // --- strategy: decisions + OKR check-ins
  push(50, "decision.opened", "strategy", { id: "dec-pricing", title: "New pricing tiers" });
  push(2, "decision.closed", "strategy", { id: "dec-pricing" });
  push(45, "decision.opened", "strategy", { id: "dec-vendor", title: "Vendor consolidation" }); // still open > 21d -> R5 fires
  for (let i = 0; i < 6; i++) {
    push(4 + i * 12, "okr.checkin.logged", "strategy", { kr: "KR-NPS", value: 42 + i });
  }
  push(30, "okr.checkin.logged", "strategy", { kr: "KR-Retention", value: 91 }); // stale -> R15 may fire

  // --- compliance
  push(170, "compliance.check.logged", "compliance", { framework: "SOC2", result: "pass" });
  push(5, "compliance.check.logged", "compliance", { framework: "GDPR", result: "pass" });

  // --- rd
  push(60, "rd.experiment.logged", "rd", { initiative: "init-ai-copilot", outcome: "promising" });
  // no further activity on init-ai-copilot in 60d -> R37 fires
  push(3, "rd.milestone.logged", "rd", { initiative: "init-mobile", milestone: "beta shipped" });

  // --- manufacturing
  push(12, "quality.incident.logged", "manufacturing", { id: "inc-77", line: "L2", safety: false });
  push(2, "quality.resolved", "manufacturing", { id: "inc-203-not-matching" }); // unrelated resolve, inc-77 stays open > 7d -> R27 fires
  push(170, "quality.incident.logged", "manufacturing", { id: "inc-12", line: "L1", safety: false });
  push(169, "quality.resolved", "manufacturing", { id: "inc-12" });

  // --- misc notes + playbook completions to give audit intelligence something to summarize
  push(8, "note.added", "ops", { text: "Board asked for board-prep bundle next cycle." });
  push(25, "playbook.completed", "finance", { playbookId: "pl-review" });
  push(80, "playbook.completed", "people", { playbookId: "weekly-1-1" });

  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  events.forEach((e, i) => (e.seq = i + 1));
  return events;
}
