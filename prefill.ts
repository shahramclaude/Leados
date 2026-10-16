// Smart Prefill Engine — pt-D brief, §"Smart Prefill Engine".
//
// `prefill(ctx, P)` below is a minimal, demo-scale implementation of the
// VERIFIED real contract (playbooks.js header, read this session):
//   prefill(ctx, P) -> {ok, kind, title, facts[], suggest{}, missing[]}
// `smartPrefill` is this module's own addition (not in the real repo at
// all — the real repo has no "smart" variant) layering the brief's five
// enrichment categories on top, each one labeled with its `source`.

import type { Finding, Person, SmartPrefillResult, Store } from "./types";
import { addDays, daysBetween, fmt, isWeekend, quarterOf, weekdayName } from "./time";

export interface PrefillCtx {
  playId: string;
  personId?: string;
}

/** The base, non-"smart" contract — verified shape, demo logic. */
export function prefill(ctx: PrefillCtx, P: Store): SmartPrefillResult {
  const person = ctx.personId ? P.people.find((p) => p.id === ctx.personId) : undefined;
  return {
    ok: true,
    kind: ctx.playId,
    title: person ? `${ctx.playId} — ${person.name}` : ctx.playId,
    facts: [],
    suggest: {},
    missing: [],
    warnings: [],
  };
}

function lastEventFor(P: Store, personId: string, type: string) {
  return [...P.events]
    .filter((e) => e.type === type && e.payload["personId"] === personId)
    .sort((a, b) => b.at - a.at)[0];
}

function personLastConversation(P: Store, personId: string) {
  return [...P.events]
    .filter((e) => (e.type === "oneonone.logged" || e.type === "feedback.given") && e.payload["personId"] === personId)
    .sort((a, b) => b.at - a.at)[0];
}

function inferUsualWeekday(P: Store, personId: string): number | null {
  const logs = P.events.filter((e) => e.type === "oneonone.logged" && e.payload["personId"] === personId);
  if (logs.length < 2) return null;
  const counts = new Map<number, number>();
  logs.forEach((e) => {
    const d = new Date(e.at).getUTCDay();
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  let best: number | null = null;
  let bestCount = 0;
  counts.forEach((c, d) => {
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  });
  return best;
}

function nextWeekday(fromMs: number, targetDow: number): number {
  let d = fromMs;
  for (let i = 0; i < 8; i++) {
    if (new Date(d).getUTCDay() === targetDow && d > fromMs) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Last 3 entries of the same type/person, summarized for pattern completion. */
function templateFromHistory(P: Store, personId: string, type: string): string | null {
  const entries = P.events
    .filter((e) => e.type === type && e.payload["personId"] === personId)
    .sort((a, b) => b.at - a.at)
    .slice(0, 3);
  if (entries.length === 0) return null;
  const hasCommitmentWord = entries.some((e) => /commit|follow up|flag/i.test(String(e.payload["notes"] ?? "")));
  const parts: string[] = [];
  parts.push("Context / blockers: ");
  if (hasCommitmentWord) parts.push("Commitments: ");
  parts.push("Growth / goal check-in: ");
  return parts.join("\n");
}

export function smartPrefill(playId: string, ctx: PrefillCtx, P: Store, today: number): SmartPrefillResult {
  const base = prefill({ ...ctx, playId }, P);
  const facts = [...base.facts];
  const missing = [...base.missing];
  const warnings: string[] = [];
  const suggest: SmartPrefillResult["suggest"] = { ...base.suggest };

  const personId = ctx.personId;
  const person: Person | undefined = personId ? P.people.find((p) => p.id === personId) : undefined;

  // ---- PEOPLE CONTEXT ENRICHMENT ----
  if (person) {
    const pulse = lastEventFor(P, person.id, "pulse.recorded");
    if (pulse && daysBetween(pulse.at, today) <= 14) {
      suggest["load"] = { value: pulse.payload["load"], recommended: true, source: `pulse.recorded ${fmt(pulse.at)} (${daysBetween(pulse.at, today)}d ago)` };
      suggest["mood"] = { value: pulse.payload["mood"], recommended: true, source: `pulse.recorded ${fmt(pulse.at)}` };
      facts.push(`Last pulse (${daysBetween(pulse.at, today)}d ago): load ${pulse.payload["load"]}/5, mood ${pulse.payload["mood"]}/5.`);
    } else {
      missing.push("load/mood — no pulse measured in the last 14 days");
    }

    const sl = lastEventFor(P, person.id, "sl.assessment");
    if (sl) {
      suggest["dLevel"] = { value: sl.payload["d"], recommended: true, source: `sl.assessment ${fmt(sl.at)} on "${sl.payload["task"]}"` };
      facts.push(`Last SL assessment: D${sl.payload["d"]} on "${sl.payload["task"]}".`);
    } else {
      missing.push("D level — no prior situational-leadership assessment on file");
    }

    const fb = lastEventFor(P, person.id, "feedback.given");
    const recentFeedback = P.events.filter(
      (e) => e.type === "feedback.given" && e.payload["personId"] === person.id && daysBetween(e.at, today) <= 21
    );
    const criticalStreak = recentFeedback.filter((e) => e.payload["tone"] === "critical").length;
    if (fb && criticalStreak >= 2 && recentFeedback.every((e) => e.payload["tone"] === "critical")) {
      warnings.push(
        `Balance warning: last ${criticalStreak} feedback items to ${person.name} were all critical ("${fb.payload["topic"]}" most recent). Consider leading with something affirming.`
      );
    }

    const commitment = [...P.events]
      .filter((e) => e.type === "commitment.made" && e.payload["toPersonId"] === person.id)
      .sort((a, b) => b.at - a.at)[0];
    if (commitment) {
      const dueAt = addDays(commitment.at, Number(commitment.payload["reviewByDaysOut"] ?? 0));
      facts.push(`Open commitment to ${person.name}: "${commitment.payload["text"]}" (logged ${fmt(commitment.at)}, due ~${fmt(dueAt)}).`);
    }

    const lastConvo = personLastConversation(P, person.id);
    if (lastConvo) {
      facts.push(`Last conversation outcome (${fmt(lastConvo.at)}): ${String(lastConvo.payload["notes"] ?? lastConvo.payload["topic"] ?? "logged, no notes").slice(0, 140)}`);
    }

    const usualDow = inferUsualWeekday(P, person.id);
    if (usualDow !== null) {
      const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const next = nextWeekday(today, usualDow);
      facts.push(`You usually meet ${person.name} on ${dowNames[usualDow]}s — next ${dowNames[usualDow]} is ${fmt(next)}.`);
    }

    if (person.archived) {
      warnings.push(`${person.name} is archived. This event will be logged but will be inert for findings (as designed).`);
    }
  }

  // ---- TEMPORAL CONTEXT ----
  const cadenceDays = person?.cadenceDays ?? P.settings["oneOnOneCadenceDays"] ?? 14;
  const reviewBy = addDays(today, cadenceDays);
  suggest["reviewBy"] = { value: fmt(reviewBy), recommended: true, source: `today + ${cadenceDays}d (style-derived cadence window)` };
  if (isWeekend(reviewBy)) {
    const nudged = addDays(reviewBy, reviewBy && new Date(reviewBy).getUTCDay() === 6 ? 2 : 1);
    warnings.push(`${fmt(reviewBy)} is a ${weekdayName(reviewBy)} — did you mean ${fmt(nudged)}?`);
  }
  if (reviewBy < today) {
    warnings.push(`${fmt(reviewBy)} is in the past — this will fire an overdue finding immediately.`);
  }
  suggest["period"] = { value: quarterOf(today), recommended: true, source: "current quarter, derived from today" };

  // ---- FINANCIAL CONTEXT ----
  if (playId.startsWith("fin") || playId === "board-prep") {
    const lastUnit = [...P.events].filter((e) => e.type === "fin.unit.logged").sort((a, b) => b.at - a.at)[0];
    if (lastUnit) {
      suggest["currency"] = { value: lastUnit.payload["currency"], recommended: true, source: `most recent fin.unit.logged (${fmt(lastUnit.at)})` };
    }
    const lastForecast = [...P.events].filter((e) => e.type === "fin.forecast.logged").sort((a, b) => b.at - a.at)[0];
    if (lastForecast) {
      const priorRevenue = Number(lastForecast.payload["revenue"] ?? 0);
      const growth = 0.08; // labeled, not hidden
      suggest["budget"] = {
        value: Math.round(priorRevenue * (1 + growth)),
        recommended: true,
        source: "prior period + inferred growth rate (8%), change as needed",
      };
      suggest["period"] = { value: quarterOf(addDays(today, 1)), recommended: true, source: "most recent logged period + 1" };
    } else {
      missing.push("budget — no prior fin.forecast.logged to base a suggestion on");
    }
  }

  // ---- PATTERN COMPLETION ----
  if (person && playId === "oneonone") {
    const template = templateFromHistory(P, person.id, "oneonone.logged");
    if (template) {
      suggest["notesTemplate"] = {
        value: template,
        recommended: true,
        source: `structure drawn from your last 3 ${person.name} 1:1 notes (shows what you usually capture, not what to say)`,
      };
    }
  }

  return { ok: true, kind: playId, title: base.title, facts, suggest, missing, warnings };
}

export function cadenceFindingFor(person: Person, P: Store, today: number): Finding | null {
  const logs = P.events
    .filter((e) => e.type === "oneonone.logged" && e.payload["personId"] === person.id && !person.archived)
    .sort((a, b) => b.at - a.at);
  if (logs.length === 0) return null;
  const gap = daysBetween(logs[0].at, today);
  const cadence = person.cadenceDays ?? 14;
  if (gap <= cadence) return null;
  return {
    key: `R1:cadence:${person.id}`,
    rule: "R1",
    sev: gap > cadence * 2 ? 3 : 2,
    conf: "high",
    title: `${person.name} is ${gap - cadence}d overdue for a 1:1 (last: ${gap}d ago, cadence: ${cadence}d)`,
    basis: `oneonone.logged ${fmt(logs[0].at)} → ${gap}d since, cadence setting ${cadence}d`,
    personId: person.id,
    play: "oneonone",
  };
}
