// Talent Science Engine — turns the raw roster + event log + weekly
// snapshots into predictive, explainable people-intelligence: flight risk,
// burnout, performance trend, promotion readiness, 9-box placement, key
// person concentration risk and succession pipelines.

import { computeFlightRisk, type FlightRiskScore, type PersonEvent } from "./flightRisk";
import {
  computeBurnoutIndex,
  computeEngagementScore,
  computeGrowthVelocity,
  computePerformanceScore,
  computePerformanceTrend,
} from "./performance";

export type PersonId = number;

export interface PersonRecord {
  id: PersonId;
  name: string;
  role: string;
  team: string;
  managerId: number | null;
  level: string;
  tenureStart: string | Date | null;
  lastPromotedAt: string | Date | null;
  compensationBand: string;
  skills: string[];
  okrScore: number | null;
  archived: boolean;
}

export interface PersonSnapshotRecord {
  id: number;
  personId: PersonId;
  snapshotAt: string | Date;
  healthScore: number;
  flightRisk: number;
  performanceScore: number;
  burnoutIndex: number;
  morale: number;
  data: Record<string, unknown>;
}

export interface RelationshipRecord {
  id: number;
  fromId: PersonId;
  toId: PersonId;
  type: "reports_to" | "collaborates" | "mentors" | "conflicts" | string;
  strength: number;
}

export interface PersonProfile {
  id: PersonId;
  name: string;
  role: string;
  team: string;
  level: string;
  flightRisk: FlightRiskScore;
  burnoutIndex: number;
  performanceScore: number;
  performanceTrend: "up" | "flat" | "down";
  performanceHistory: number[];
  engagementScore: number;
  moraleHistory: number[];
  growthVelocity: number;
  keyPersonRisk: boolean;
  promotionReadiness: "ready" | "developing" | "not_ready";
  strengths: string[];
  gaps: string[];
  suggestedActions: string[];
  radar: { dimension: string; value: number }[];
}

export interface HighPotential {
  id: PersonId;
  name: string;
  role: string;
  performanceScore: number;
  potentialScore: number;
  box: string; // one of the 9-box labels
  row: 0 | 1 | 2; // potential tier (0 = low .. 2 = high)
  col: 0 | 1 | 2; // performance tier (0 = low .. 2 = high)
}

export interface KeyPersonRisk {
  personId: PersonId;
  name: string;
  role: string;
  criticalPathsBroken: number;
  componentsIfRemoved: number;
  reason: string;
}

export interface SuccessionMap {
  role: string;
  incumbent: { id: PersonId; name: string } | null;
  readyNow: PersonId[];
  readyIn1Year: PersonId[];
  readyIn2Years: PersonId[];
  gap: boolean;
}

function toDate(v: string | Date | null): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// ───────────────────────────── Person profile ─────────────────────────────

export function computePersonProfile(
  person: PersonRecord,
  events: PersonEvent[],
  snapshots: PersonSnapshotRecord[],
  today: Date
): PersonProfile {
  const personEvents = events.filter((e) => e.personId === person.id);
  const orderedSnapshots = [...snapshots]
    .filter((s) => s.personId === person.id)
    .sort((a, b) => toDate(a.snapshotAt)!.getTime() - toDate(b.snapshotAt)!.getTime());

  const tenureDays = toDate(person.tenureStart) ? daysBetween(today, toDate(person.tenureStart)!) : null;

  const flightRisk = computeFlightRisk(personEvents, today, {
    tenureStart: person.tenureStart,
    lastPromotedAt: person.lastPromotedAt,
    okrScore: person.okrScore,
  });

  const burnoutIndex = computeBurnoutIndex(personEvents, today);
  const engagementScore = computeEngagementScore(personEvents, today);
  const performanceScore = computePerformanceScore(personEvents, today, person.okrScore);

  const performanceHistory = orderedSnapshots.length
    ? orderedSnapshots.slice(-8).map((s) => s.performanceScore)
    : [performanceScore];
  const performanceTrend = computePerformanceTrend(
    orderedSnapshots.length >= 2 ? orderedSnapshots.map((s) => s.performanceScore) : [performanceScore, performanceScore]
  );

  const moraleHistory = orderedSnapshots.length ? orderedSnapshots.slice(-8).map((s) => s.morale) : [];

  const okrHistory = orderedSnapshots.length
    ? orderedSnapshots.map((s) => Number((s.data as Record<string, unknown>)?.okrScore ?? s.performanceScore))
    : [person.okrScore ?? 60];
  const growthVelocity = computeGrowthVelocity(personEvents, today, okrHistory, tenureDays);

  // Promotion readiness: blends sustained high performance, growth velocity,
  // low (or well-managed) flight risk, and time-in-level.
  const monthsSincePromotion =
    toDate(person.lastPromotedAt) !== null
      ? daysBetween(today, toDate(person.lastPromotedAt)!) / 30
      : tenureDays
        ? tenureDays / 30
        : 24;

  let promotionReadiness: PersonProfile["promotionReadiness"] = "not_ready";
  if (performanceScore >= 70 && growthVelocity >= 32 && monthsSincePromotion >= 8) {
    promotionReadiness = "ready";
  } else if (performanceScore >= 55 && growthVelocity >= 14) {
    promotionReadiness = "developing";
  }

  // Strengths / gaps derived from skills + signal components.
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (performanceScore >= 75) strengths.push("Consistently strong OKR / delivery performance");
  if (engagementScore >= 70) strengths.push("High engagement and participation");
  if (growthVelocity >= 55) strengths.push("Fast skill & capability growth");
  if (flightRisk.score < 25) strengths.push("Stable, low flight-risk profile");
  if (person.skills.length) strengths.push(`Skill depth: ${person.skills.slice(0, 4).join(", ")}`);

  if (performanceScore < 55) gaps.push("Performance below expectation — needs coaching plan");
  if (burnoutIndex >= 60) gaps.push("Elevated burnout — workload rebalance required");
  if (flightRisk.score >= 45) gaps.push("Material flight risk — retention conversation overdue");
  if (!flightRisk.signal.hasGrowthPlan) gaps.push("No active growth plan on file");
  if (engagementScore < 45) gaps.push("Low engagement signal — investigate root cause");
  if (!strengths.length) strengths.push("Insufficient signal history — log more 1:1s and pulses");
  if (!gaps.length) gaps.push("No material gaps detected this cycle");

  const suggestedActions: string[] = [];
  flightRisk.components
    .filter((c) => c.contribution === "HIGH")
    .forEach((c) => suggestedActions.push(c.action));
  if (burnoutIndex >= 60) suggestedActions.push("Rebalance workload and protect recovery time this sprint.");
  if (promotionReadiness === "ready") suggestedActions.push("Fast-track promotion packet — readiness criteria met.");
  if (promotionReadiness === "developing") suggestedActions.push("Set a 2-quarter stretch goal to close the readiness gap.");
  flightRisk.components
    .filter((c) => c.contribution === "MEDIUM")
    .forEach((c) => suggestedActions.push(c.action));
  if (!suggestedActions.length) suggestedActions.push("No urgent action — maintain current cadence.");

  // Key person risk (individual proxy — concentration risk is computed
  // org-wide in computeKeyPersonConcentration using the network graph).
  const seniorLevel = /lead|staff|principal|director|vp|head|manager/i.test(person.level || person.role);
  const keyPersonRisk = seniorLevel && performanceScore >= 70 && (flightRisk.score >= 40 || person.skills.length >= 4);

  const radar: PersonProfile["radar"] = [
    { dimension: "Performance", value: performanceScore },
    { dimension: "Engagement", value: engagementScore },
    { dimension: "Growth Velocity", value: growthVelocity },
    { dimension: "Retention (inv. risk)", value: Math.max(0, 100 - flightRisk.score) },
    { dimension: "Resilience (inv. burnout)", value: Math.max(0, 100 - burnoutIndex) },
    { dimension: "Collaboration", value: Math.min(100, personEvents.filter((e) => e.type === "meeting.attended").length * 8) },
    { dimension: "Skill Breadth", value: Math.min(100, person.skills.length * 15) },
    { dimension: "OKR Attainment", value: person.okrScore ?? 60 },
  ];

  return {
    id: person.id,
    name: person.name,
    role: person.role,
    team: person.team,
    level: person.level,
    flightRisk,
    burnoutIndex,
    performanceScore,
    performanceTrend,
    performanceHistory: performanceHistory.length ? performanceHistory : [performanceScore],
    engagementScore,
    moraleHistory,
    growthVelocity,
    keyPersonRisk,
    promotionReadiness,
    strengths,
    gaps,
    suggestedActions: suggestedActions.slice(0, 6),
    radar,
  };
}

// ───────────────────────────── 9-box grid ─────────────────────────────

const BOX_LABELS: string[][] = [
  // rows = potential (low..high), cols = performance (low..high)
  ["Under Performer", "Inconsistent Player", "Diamond in the Rough"],
  ["Trusted Professional", "Core Performer", "High Potential"],
  ["Solid Specialist", "Strong Performer", "Star"],
];

function tier(value: number): 0 | 1 | 2 {
  if (value >= 70) return 2;
  if (value >= 45) return 1;
  return 0;
}

export function identifyHighPotentials(profiles: PersonProfile[]): HighPotential[] {
  return profiles.map((p) => {
    const potentialScore = Math.round(p.growthVelocity * 0.6 + p.engagementScore * 0.4);
    const performanceScore = p.performanceScore;
    const row = tier(potentialScore);
    const col = tier(performanceScore);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      performanceScore,
      potentialScore,
      box: BOX_LABELS[row][col],
      row,
      col,
    };
  });
}

// ───────────────────── Key person concentration (graph cut-vertices) ─────────────────────

function buildUndirectedAdjacency(
  ids: PersonId[],
  relationships: RelationshipRecord[]
): Map<PersonId, Set<PersonId>> {
  const adj = new Map<PersonId, Set<PersonId>>();
  ids.forEach((id) => adj.set(id, new Set()));
  relationships.forEach((r) => {
    if (r.type === "conflicts") return; // conflicts are not structural dependency edges
    if (!adj.has(r.fromId) || !adj.has(r.toId)) return;
    adj.get(r.fromId)!.add(r.toId);
    adj.get(r.toId)!.add(r.fromId);
  });
  return adj;
}

function countComponents(ids: PersonId[], adj: Map<PersonId, Set<PersonId>>, exclude?: PersonId): number {
  const visited = new Set<PersonId>();
  let components = 0;
  for (const id of ids) {
    if (id === exclude || visited.has(id)) continue;
    components += 1;
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of adj.get(cur) ?? []) {
        if (n === exclude || visited.has(n)) continue;
        visited.add(n);
        stack.push(n);
      }
    }
  }
  return components;
}

/** People whose removal from the org graph would fracture it into > 2 extra components. */
export function computeKeyPersonConcentration(
  profiles: PersonProfile[],
  relationships: RelationshipRecord[]
): KeyPersonRisk[] {
  const ids = profiles.map((p) => p.id);
  const adj = buildUndirectedAdjacency(ids, relationships);
  const baselineComponents = countComponents(ids, adj);

  const risks: KeyPersonRisk[] = [];
  for (const p of profiles) {
    const degree = adj.get(p.id)?.size ?? 0;
    if (degree < 2) continue; // can't be a structural bridge with < 2 edges
    const componentsIfRemoved = countComponents(
      ids.filter((id) => id !== p.id),
      adj,
      p.id
    );
    const criticalPathsBroken = Math.max(0, componentsIfRemoved - baselineComponents);
    if (criticalPathsBroken > 2 || (p.keyPersonRisk && criticalPathsBroken >= 1)) {
      risks.push({
        personId: p.id,
        name: p.name,
        role: p.role,
        criticalPathsBroken,
        componentsIfRemoved,
        reason:
          criticalPathsBroken > 2
            ? `Removing ${p.name} would fracture the org graph into ${componentsIfRemoved} disconnected groups (${criticalPathsBroken} critical paths broken).`
            : `${p.name} is a senior, high-performing bridge node with elevated flight risk or broad skill coverage.`,
      });
    }
  }

  return risks.sort((a, b) => b.criticalPathsBroken - a.criticalPathsBroken);
}

// ───────────────────────────── Succession mapping ─────────────────────────────

export function buildSuccessionMap(
  profiles: PersonProfile[],
  relationships: RelationshipRecord[],
  roster: PersonRecord[]
): SuccessionMap[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Key roles = roles that currently have a manager (someone is reports_to
  // target) OR only a single incumbent company-wide (single point of failure).
  const managerIds = new Set(relationships.filter((r) => r.type === "reports_to").map((r) => r.toId));
  roster.forEach((p) => {
    if (p.managerId) managerIds.add(p.managerId);
  });

  const roleCounts = new Map<string, PersonRecord[]>();
  roster.forEach((p) => {
    if (p.archived) return;
    const list = roleCounts.get(p.role) ?? [];
    list.push(p);
    roleCounts.set(p.role, list);
  });

  const keyRoles = new Set<string>();
  roster.forEach((p) => {
    if (managerIds.has(p.id)) keyRoles.add(p.role);
  });
  roleCounts.forEach((people, role) => {
    if (people.length === 1) keyRoles.add(role);
  });

  const maps: SuccessionMap[] = [];

  keyRoles.forEach((role) => {
    const incumbents = roleCounts.get(role) ?? [];
    const incumbent = incumbents[0] ?? null;
    const sameTeamPeers = roster.filter(
      (p) => !p.archived && p.role !== role && (incumbent ? p.team === incumbent.team : false)
    );

    const candidates = sameTeamPeers
      .map((p) => profileById.get(p.id))
      .filter((p): p is PersonProfile => !!p);

    const readyNow = candidates.filter((c) => c.promotionReadiness === "ready").map((c) => c.id);
    const readyIn1Year = candidates
      .filter((c) => c.promotionReadiness === "developing" && c.growthVelocity >= 50)
      .map((c) => c.id);
    const readyIn2Years = candidates
      .filter((c) => c.promotionReadiness === "developing" && c.growthVelocity < 50)
      .map((c) => c.id);

    maps.push({
      role,
      incumbent: incumbent ? { id: incumbent.id, name: byId.get(incumbent.id)?.name ?? incumbent.name } : null,
      readyNow,
      readyIn1Year,
      readyIn2Years,
      gap: readyNow.length === 0,
    });
  });

  return maps.sort((a, b) => Number(b.gap) - Number(a.gap));
}
