// Projection + rule engine for the pt-E demo.
// Reuses, verified verbatim from the real repo's js/engine.js `fin()` helper:
// the finding key format `rule + ':' + scope`. Everything else here
// (plHealth shape, individual rule bodies) is fresh demo logic, not a port —
// the real engine.js's 40 rule bodies were not reviewed line-by-line this
// session (budget), so none of them are reproduced.

import type { Finding, LeadEvent, Settings, Severity, Store } from "../types";
import { RULES } from "../data/catalog";
import { daysBetween } from "./utils";

export interface Projected {
  today: Date;
  events: LeadEvent[];
  findings: Finding[]; // all findings, pre-mute-filter
  plPeriods: { period: string; revenue: number; gross_margin_pct: number; growth_pct: number; ts: string }[];
}

function fin(o: {
  rule: string;
  scope?: string;
  sev: Severity;
  conf: Finding["conf"];
  title: string;
  basis: string[];
  domain: string;
  play: string | null;
  refs?: string[];
  eventIds?: string[];
}): Finding {
  const scope = o.scope !== undefined ? String(o.scope) : o.refs?.length ? String(o.refs[0]) : "*";
  return {
    key: o.rule + ":" + scope,
    rule: o.rule,
    scope,
    title: o.title,
    basis: o.basis,
    domain: o.domain,
    sev: o.sev,
    conf: o.conf,
    play: o.play,
    refs: o.refs || [],
    eventIds: o.eventIds || [],
  };
}

function byType(events: LeadEvent[], type: string) {
  return events.filter((e) => e.type === type);
}

export function project(store: Store, today: Date): Projected {
  const events = store.events;
  const set: Settings = store.meta.settings;
  const out: Finding[] = [];

  // ---- finance: plHealth()
  const plEvents = byType(events, "fin.pl.logged").sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const plPeriods = plEvents.map((e) => ({
    period: String(e.data.period),
    revenue: Number(e.data.revenue),
    gross_margin_pct: Number(e.data.gross_margin_pct),
    growth_pct: Number(e.data.growth_pct),
    ts: e.ts,
  }));
  if (plPeriods.length >= 3) {
    const last3 = plPeriods.slice(-3);
    const slope = last3[2].gross_margin_pct - last3[0].gross_margin_pct;
    const latest = last3[2];
    const declining = slope < 0;
    const belowFloor = latest.gross_margin_pct < set.grossMarginFloorPct;
    if (declining || belowFloor) {
      const sev: Severity = declining && belowFloor ? 4 : belowFloor ? 3 : 2;
      out.push(
        fin({
          rule: "R103",
          scope: latest.period + "-gross-margin",
          sev,
          conf: "HIGH",
          title: `Gross margin ${declining ? "declining" : "below floor"}: ${latest.period} at ${latest.gross_margin_pct}%`,
          basis: [
            `trend over ${last3.map((p) => p.period).join(", ")}: ${last3.map((p) => p.gross_margin_pct + "%").join(" → ")}`,
            `floor setting grossMarginFloorPct=${set.grossMarginFloorPct}%`,
          ],
          domain: "finance",
          play: "pl-review",
          eventIds: plEvents.slice(-3).map((e) => e.id),
        })
      );
    }
    const ruleOf40 = latest.growth_pct + latest.gross_margin_pct;
    if (ruleOf40 < 40) {
      out.push(
        fin({
          rule: "R112",
          scope: latest.period + "-rule-of-40",
          sev: 3,
          conf: "HIGH",
          title: `Rule of 40 miss: ${latest.period} at ${ruleOf40}`,
          basis: [`growth ${latest.growth_pct}% + gross margin ${latest.gross_margin_pct}% = ${ruleOf40}`],
          domain: "finance",
          play: "pl-review",
          eventIds: [plEvents[plEvents.length - 1].id],
        })
      );
    }
  }

  const cashEvents = byType(events, "fin.cash.logged").sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  if (cashEvents.length) {
    const last = cashEvents[cashEvents.length - 1];
    const cash = Number(last.data.cash);
    const burn = Number(last.data.monthlyBurn);
    const runway = burn > 0 ? cash / burn : 99;
    if (runway < 6) {
      out.push(
        fin({
          rule: "R22",
          scope: "runway",
          sev: runway < 3 ? 5 : 4,
          conf: "HIGH",
          title: `Cashflow warning: ${runway.toFixed(1)} months runway`,
          basis: [`cash $${cash.toLocaleString()} / burn $${burn.toLocaleString()}/mo`],
          domain: "finance",
          play: "finance-reforecast",
          eventIds: [last.id],
        })
      );
    }
  }

  // ---- people: 1:1 cadence drift, skip-level, influence mapping
  const reports = ["p-ana", "p-dev", "p-mei", "p-lia", "p-raf"];
  reports.forEach((pid) => {
    const logs = events.filter((e) => e.type === "oneonone.logged" && e.data.report === pid);
    const last = logs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
    const lastDays = last ? daysBetween(last.ts, today.toISOString()) : 9999;
    if (lastDays > set.oneOnOneCadenceDays) {
      const ratio = lastDays / set.oneOnOneCadenceDays;
      const sev: Severity = ratio > 3 ? 4 : ratio > 2 ? 3 : 2;
      out.push(
        fin({
          rule: "R8",
          scope: pid,
          sev,
          conf: "HIGH",
          title: `1:1 cadence drift: ${pid}`,
          basis: [`${Math.floor(lastDays)}d since last oneonone.logged; cadence ${set.oneOnOneCadenceDays}d`],
          domain: "people",
          play: "weekly-1-1",
          refs: [pid],
          eventIds: last ? [last.id] : [],
        })
      );
    }
  });
  const skipLogs = byType(events, "skiplevel.logged");
  if (!skipLogs.length || daysBetween(skipLogs[skipLogs.length - 1].ts, today.toISOString()) > set.oneOnOneCadenceDays * 2) {
    out.push(
      fin({
        rule: "R10",
        scope: "org",
        sev: 2,
        conf: "MEDIUM",
        title: "Skip-level overdue",
        basis: [skipLogs.length ? `last skip-level ${Math.floor(daysBetween(skipLogs[skipLogs.length - 1].ts, today.toISOString()))}d ago` : "no skip-level ever logged"],
        domain: "people",
        play: "leadership-audit",
      })
    );
  }
  if (!events.some((e) => e.type === "influence.map.logged")) {
    out.push(
      fin({
        rule: "R50",
        scope: "org",
        sev: 2,
        conf: "LOW",
        title: "No influence mapping logged",
        basis: ["no influence-map event has ever been logged for the org"],
        domain: "people",
        play: "leadership-audit",
      })
    );
  }

  // ---- ops: weekly review cadence
  const opsLogs = byType(events, "ops.review.logged").sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const opsLastDays = opsLogs.length ? daysBetween(opsLogs[0].ts, today.toISOString()) : 9999;
  if (opsLastDays > set.cadenceDays) {
    out.push(
      fin({
        rule: "R1",
        scope: "cadence",
        sev: opsLastDays > set.cadenceDays * 2 ? 3 : 2,
        conf: "HIGH",
        title: "No weekly ops review logged recently",
        basis: [`${Math.floor(opsLastDays)}d since last ops.review.logged; cadence ${set.cadenceDays}d`],
        domain: "ops",
        play: "ops-review",
        eventIds: opsLogs.length ? [opsLogs[0].id] : [],
      })
    );
  }

  // ---- strategy: open decisions, OKR check-in cadence
  const opens = byType(events, "decision.opened");
  const closes = new Set(byType(events, "decision.closed").map((e) => String(e.data.id)));
  opens.forEach((o) => {
    const id = String(o.data.id);
    if (closes.has(id)) return;
    const openDays = daysBetween(o.ts, today.toISOString());
    if (openDays > set.decisionMaxOpenDays) {
      out.push(
        fin({
          rule: "R5",
          scope: id,
          sev: 3,
          conf: "HIGH",
          title: `Decision open too long: ${o.data.title}`,
          basis: [`open ${Math.floor(openDays)}d; max ${set.decisionMaxOpenDays}d`],
          domain: "strategy",
          play: "decision-forcing",
          eventIds: [o.id],
        })
      );
    }
  });
  const krGroups = new Map<string, LeadEvent[]>();
  byType(events, "okr.checkin.logged").forEach((e) => {
    const kr = String(e.data.kr);
    krGroups.set(kr, [...(krGroups.get(kr) || []), e]);
  });
  krGroups.forEach((logs, kr) => {
    const last = logs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
    const days = daysBetween(last.ts, today.toISOString());
    if (days > set.okrCheckInCadenceDays) {
      out.push(
        fin({
          rule: "R15",
          scope: kr,
          sev: 2,
          conf: "HIGH",
          title: `OKR check-in overdue: ${kr}`,
          basis: [`${Math.floor(days)}d since last check-in; cadence ${set.okrCheckInCadenceDays}d`],
          domain: "strategy",
          play: "okr-reset",
          eventIds: [last.id],
        })
      );
    }
  });

  // ---- compliance
  const byFw = new Map<string, LeadEvent[]>();
  byType(events, "compliance.check.logged").forEach((e) => {
    const fw = String(e.data.framework);
    byFw.set(fw, [...(byFw.get(fw) || []), e]);
  });
  byFw.forEach((logs, fw) => {
    const last = logs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
    if (last.data.result === "fail") {
      out.push(
        fin({
          rule: "R30",
          scope: fw,
          sev: 5,
          conf: "HIGH",
          title: `Compliance FAIL: ${fw}`,
          basis: [`latest check ${last.ts}`],
          domain: "compliance",
          play: "production-stop",
          eventIds: [last.id],
        })
      );
      return;
    }
    const days = daysBetween(last.ts, today.toISOString());
    if (days > set.complianceAuditCadenceDays) {
      out.push(
        fin({
          rule: "R30",
          scope: fw + "-cadence",
          sev: 2,
          conf: "HIGH",
          title: `Compliance check cadence miss: ${fw}`,
          basis: [`${Math.floor(days)}d since last check; cadence ${set.complianceAuditCadenceDays}d`],
          domain: "compliance",
          play: "production-stop",
          eventIds: [last.id],
        })
      );
    }
  });

  // ---- rd: innovation stall
  const initiatives = new Map<string, LeadEvent[]>();
  [...byType(events, "rd.experiment.logged"), ...byType(events, "rd.milestone.logged")].forEach((e) => {
    const init = String(e.data.initiative);
    initiatives.set(init, [...(initiatives.get(init) || []), e]);
  });
  initiatives.forEach((logs, init) => {
    const last = logs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
    const days = daysBetween(last.ts, today.toISOString());
    if (days > set.cadenceDays * 3) {
      out.push(
        fin({
          rule: "R37",
          scope: init,
          sev: 3,
          conf: "MEDIUM",
          title: `Innovation stall: ${init}`,
          basis: [`${Math.floor(days)}d since last experiment/milestone activity`],
          domain: "rd",
          play: "innovation-reset",
          eventIds: [last.id],
        })
      );
    }
  });

  // ---- manufacturing: unresolved quality incidents
  const incidents = byType(events, "quality.incident.logged");
  const resolvedIds = new Set(byType(events, "quality.resolved").map((e) => String(e.data.id)));
  incidents.forEach((inc) => {
    const id = String(inc.data.id);
    if (resolvedIds.has(id)) return;
    const days = daysBetween(inc.ts, today.toISOString());
    if (days > 7) {
      out.push(
        fin({
          rule: "R27",
          scope: id,
          sev: inc.data.safety ? 5 : 4,
          conf: "HIGH",
          title: `Quality incident unresolved: ${id}`,
          basis: [`open ${Math.floor(days)}d; line ${inc.data.line}`],
          domain: "manufacturing",
          play: "production-stop",
          eventIds: [inc.id],
        })
      );
    }
  });

  // smart rank: sort by sev desc, then recency of constituent events desc
  const ranked = [...out].sort((a, b) => b.sev - a.sev);
  ranked.forEach((f, i) => (f.smartRank = i + 1));

  return { today, events, findings: ranked, plPeriods };
}

export function visibleFindings(P: Projected, mutedRules: { rule: string }[], dismissed: Record<string, unknown>): Finding[] {
  const muted = new Set(mutedRules.map((m) => m.rule));
  return P.findings.filter((f) => !muted.has(f.rule) && !dismissed[f.key]);
}

export function ruleCatalogMap() {
  return new Map(RULES.map((r) => [r.id, r]));
}
