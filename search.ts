// Universal search engine — pure in-memory, no indexing library, per the
// pt-E brief. FABRICATED: the real repo (verified this session) has no
// search module and no command palette to "extend"; this is written fresh.

import type { Finding, LeadEvent, Person, RuleDef, SearchItem, Store } from "../types";
import type { Projected } from "./engine";
import { PLAYBOOKS } from "../data/catalog";
import { levenshtein } from "./utils";

export interface ParsedQuery {
  raw: string;
  isCommand: boolean;
  commandText: string;
  text: string; // remaining free text after filters stripped
  personFilter?: string; // @ana
  domainFilter?: string; // #finance
  sevMin?: number; // sev:4
  playbookOnly?: boolean; // play:
  eventOnly?: boolean; // event:
  confLow?: boolean; // conf:low
  ruleExact?: string; // R103
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (trimmed.startsWith(">")) {
    return { raw, isCommand: true, commandText: trimmed.slice(1).trim(), text: "" };
  }
  let text = trimmed;
  let personFilter: string | undefined;
  let domainFilter: string | undefined;
  let sevMin: number | undefined;
  let playbookOnly = false;
  let eventOnly = false;
  let confLow = false;
  let ruleExact: string | undefined;

  const tokens = text.split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  for (const tok of tokens) {
    if (/^@/.test(tok)) personFilter = tok.slice(1).toLowerCase();
    else if (/^#/.test(tok)) domainFilter = tok.slice(1).toLowerCase();
    else if (/^sev:(\d)$/i.test(tok)) sevMin = Number(tok.split(":")[1]);
    else if (/^play:$/i.test(tok)) playbookOnly = true;
    else if (/^event:$/i.test(tok)) eventOnly = true;
    else if (/^conf:low$/i.test(tok)) confLow = true;
    else if (/^R\d+$/i.test(tok)) ruleExact = tok.toUpperCase();
    else rest.push(tok);
  }
  text = rest.join(" ").trim();
  return { raw, isCommand: false, commandText: "", text, personFilter, domainFilter, sevMin, playbookOnly, eventOnly, confLow, ruleExact };
}

export function buildIndex(P: Projected, store: Store, rules: RuleDef[], _today: Date): SearchItem[] {
  const items: SearchItem[] = [];

  P.findings.forEach((f: Finding) => {
    items.push({
      type: "finding",
      key: f.key,
      rule: f.rule,
      title: f.title,
      basis: f.basis,
      domain: f.domain,
      sev: f.sev,
      people: f.refs,
      _text: [f.title, ...f.basis].join(" ").toLowerCase(),
      score: 0,
    });
  });

  store.people.forEach((p: Person) => {
    items.push({
      type: "person",
      id: p.id,
      name: p.name,
      role: p.role,
      _text: [p.name, p.role, p.team].join(" ").toLowerCase(),
      score: 0,
    });
  });

  store.events
    .slice(-200)
    .forEach((e: LeadEvent) => {
      items.push({
        type: "event",
        id: e.id,
        eventType: e.type,
        ts: e.ts,
        _text: [e.type, JSON.stringify(e.data)].join(" ").toLowerCase(),
        score: 0,
      });
    });

  PLAYBOOKS.forEach((pb) => {
    items.push({
      type: "playbook",
      id: pb.id,
      title: pb.title,
      forWhat: pb.forWhat,
      _text: [pb.title, pb.forWhat].join(" ").toLowerCase(),
      score: 0,
    });
  });

  rules.forEach((r: RuleDef) => {
    items.push({
      type: "rule",
      id: r.id,
      tag: r.tag,
      params: r.settingsKeys.join(","),
      _text: [r.id, r.tag, r.settingsKeys.join(" ")].join(" ").toLowerCase(),
      score: 0,
    });
  });

  const domainCounts = new Map<string, { count: number; topSev: number }>();
  P.findings.forEach((f) => {
    const cur = domainCounts.get(f.domain) || { count: 0, topSev: 0 };
    cur.count += 1;
    cur.topSev = Math.max(cur.topSev, f.sev);
    domainCounts.set(f.domain, cur);
  });
  domainCounts.forEach((v, name) => {
    items.push({ type: "domain", name, findingCount: v.count, topSev: v.topSev, _text: name, score: 0 });
  });

  return items;
}

function wordMatchesFuzzy(words: string[], q: string): boolean {
  return words.some((w) => levenshtein(w, q) <= 2);
}

function baseScore(item: SearchItem, q: string): number {
  const text = item._text;
  if (!q) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  // exact whole-word match
  if (words.includes(q)) return 1.0;
  if (text.startsWith(q)) return 0.9;
  if (text.includes(q)) return 0.7;
  if (wordMatchesFuzzy(words, q)) return 0.5;
  return 0;
}

export function runSearch(
  query: ParsedQuery,
  items: SearchItem[],
  ctx: { personIndex: Map<string, Person>; sessionAccessed: Set<string>; currentDomain?: string }
): SearchItem[] {
  if (query.isCommand) return [];

  let candidates = items;

  if (query.ruleExact) {
    const r = query.ruleExact;
    candidates = candidates.filter((it) => {
      if (it.type === "finding") return it.rule === r;
      if (it.type === "rule") return it.id === r;
      if (it.type === "playbook") return true; // filtered below by forRules via text
      return false;
    });
  }
  if (query.personFilter) {
    const match = [...ctx.personIndex.values()].find((p) => p.name.toLowerCase().includes(query.personFilter!) || p.id.toLowerCase().includes(query.personFilter!));
    if (match) {
      candidates = candidates.filter((it) => {
        if (it.type === "finding") return it.people.includes(match.id);
        if (it.type === "person") return it.id === match.id;
        if (it.type === "event") return true; // text match below will narrow
        return false;
      });
    }
  }
  if (query.domainFilter) {
    candidates = candidates.filter((it) => {
      if (it.type === "finding") return it.domain === query.domainFilter;
      if (it.type === "domain") return it.name === query.domainFilter;
      return it._text.includes(query.domainFilter as string);
    });
  }
  if (query.sevMin !== undefined) {
    candidates = candidates.filter((it) => it.type === "finding" && it.sev >= (query.sevMin as number));
  }
  if (query.playbookOnly) {
    candidates = candidates.filter((it) => it.type === "playbook");
    if (query.ruleExact) {
      const resolvers = new Set(PLAYBOOKS.filter((pb) => pb.forRules.includes(query.ruleExact as string)).map((pb) => pb.id));
      candidates = candidates.filter((it) => it.type === "playbook" && resolvers.has(it.id));
    }
  }
  if (query.eventOnly) {
    candidates = candidates.filter((it) => it.type === "event");
  }
  if (query.confLow) {
    candidates = candidates.filter((it) => it.type === "finding");
  }

  const q = query.text.toLowerCase().trim();
  const scored = candidates
    .map((it) => {
      let s = query.ruleExact && it.type !== "event" ? 1.0 : baseScore(it, q);
      if (!q && !query.ruleExact && (query.personFilter || query.domainFilter || query.sevMin !== undefined || query.playbookOnly || query.eventOnly || query.confLow)) {
        s = 0.6; // filter-only query still surfaces matches at a flat relevance
      }
      if (s <= 0) return null;
      if (it.type === "finding" && it.sev >= 4) s *= 1.5;
      if (it.type === "person" && P_isActiveSource(it.id, items)) s *= 1.3;
      if (ctx.sessionAccessed.has(idOf(it))) s *= 1.2;
      if (ctx.currentDomain && "domain" in it && (it as any).domain === ctx.currentDomain) s *= 1.1;
      return { ...it, score: s };
    })
    .filter(Boolean) as SearchItem[];

  const groups = new Map<string, SearchItem[]>();
  scored.forEach((it) => {
    const arr = groups.get(it.type) || [];
    arr.push(it);
    groups.set(it.type, arr);
  });
  const order: SearchItem["type"][] = ["finding", "person", "rule", "playbook", "domain", "event"];
  const result: SearchItem[] = [];
  order.forEach((t) => {
    const arr = (groups.get(t) || []).sort((a, b) => b.score - a.score).slice(0, 5);
    result.push(...arr);
  });
  return result.slice(0, 20);
}

function idOf(it: SearchItem): string {
  switch (it.type) {
    case "finding":
      return it.key;
    case "person":
      return it.id;
    case "event":
      return it.id;
    case "playbook":
      return it.id;
    case "rule":
      return it.id;
    case "domain":
      return it.name;
  }
}

function P_isActiveSource(personId: string, items: SearchItem[]): boolean {
  return items.some((it) => it.type === "finding" && it.people.includes(personId));
}
