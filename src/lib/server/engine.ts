import "server-only";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agentRuns,
  briefings,
  decisions,
  domainHealthHistory,
  findings,
  hypotheses,
  latentNodes,
  notifications,
  people,
  playbooks,
} from "@/db/schema";
import { DOMAIN_ORDER } from "@/lib/domains";
import type {
  AgentCycleResult,
  Domain,
  Finding,
  OrchestratorResult,
  RealtimeServerEvent,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// This module is the single source of truth for "live" intelligence state.
// It keeps an in-memory snapshot (fast reads for every API route + SSE
// stream) backed by Postgres for durability. A background interval nudges
// belief/posterior values and periodically synthesizes new findings so the
// UI always has something live to show, mimicking an autonomous agent loop.
// ---------------------------------------------------------------------------

type GlobalEngine = {
  emitter: EventEmitter;
  initPromise: Promise<void> | null;
  seeded: boolean;
  interval: ReturnType<typeof setInterval> | null;
  agentStatus: AgentCycleResult;
  lastRunAt: number;
};

const g = globalThis as typeof globalThis & { __leadosEngine?: GlobalEngine };

const engine: GlobalEngine =
  g.__leadosEngine ??
  (g.__leadosEngine = {
    emitter: new EventEmitter(),
    initPromise: null,
    seeded: false,
    interval: null,
    agentStatus: {
      status: "idle",
      lastRun: new Date().toISOString(),
      nextRun: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      playbooksTriggeredThisWeek: 0,
      hypothesesOpen: 0,
      hypothesesConfirmed: 0,
      hypothesesRefuted: 0,
    },
    lastRunAt: Date.now(),
  });

engine.emitter.setMaxListeners(100);

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const SEED_PEOPLE: Array<{ name: string; role: string; domain: Domain; riskScore: number; notes: string }> = [
  { name: "Mara Ellison", role: "VP Sales", domain: "people", riskScore: 0.72, notes: "Two direct reports flagged flight risk this quarter." },
  { name: "Devon Okafor", role: "Head of Engineering", domain: "execution", riskScore: 0.41, notes: "Shipping velocity down 18% vs. last sprint." },
  { name: "Priya Natarajan", role: "CFO", domain: "financial", riskScore: 0.55, notes: "Runway sensitive to Q3 churn assumptions." },
  { name: "Lucas Bergman", role: "GC", domain: "legal", riskScore: 0.33, notes: "Vendor contract renegotiation in progress." },
  { name: "Soo-ah Kim", role: "VP Product", domain: "product", riskScore: 0.28, notes: "Roadmap slippage on flagship feature." },
  { name: "Theo Marchetti", role: "COO", domain: "culture", riskScore: 0.46, notes: "Engagement survey trending down in ops team." },
];

const SEED_DECISIONS: Array<{ title: string; domain: Domain; hoursFromNow: number }> = [
  { title: "Approve Q3 hiring freeze exception for platform team", domain: "people", hoursFromNow: 20 },
  { title: "Sign off on renegotiated cloud infra contract", domain: "financial", hoursFromNow: 40 },
  { title: "Decide go/no-go on enterprise launch date", domain: "strategic", hoursFromNow: 30 },
  { title: "Resolve on-call rotation dispute in platform team", domain: "execution", hoursFromNow: 12 },
];

const SEED_HYPOTHESES: Array<{ title: string; domain: Domain; hoursFromNow: number; confidence: number }> = [
  { title: "Churn spike is driven by onboarding friction, not pricing", domain: "signals", hoursFromNow: 36, confidence: 0.58 },
  { title: "Attrition risk in sales is concentrated in tenure < 1yr", domain: "people", hoursFromNow: 60, confidence: 0.64 },
  { title: "Infra cost overrun is a one-time migration cost, not structural", domain: "financial", hoursFromNow: 18, confidence: 0.47 },
];

const SEED_PLAYBOOKS: Array<{ title: string; domain: Domain; status: "triggered" | "in_progress" | "done" }> = [
  { title: "Retention intervention: at-risk sales reps", domain: "people", status: "triggered" },
  { title: "Vendor cost renegotiation sprint", domain: "financial", status: "in_progress" },
];

const SEED_FINDING_TEMPLATES: Array<{
  domain: Domain;
  severity: number;
  title: string;
  detail: string;
  probability: number | null;
  confidence: number;
}> = [
  { domain: "people", severity: 5, title: "Elevated flight-risk cluster in Sales", detail: "3 senior reps show compounding disengagement signals (calendar decline, Slack sentiment, 1:1 cancellations) within 10 days.", probability: 0.74, confidence: 0.69 },
  { domain: "financial", severity: 4, title: "Burn rate trending 12% above plan", detail: "Infra + contractor spend outpacing revenue recognition for second consecutive month.", probability: 0.61, confidence: 0.71 },
  { domain: "execution", severity: 3, title: "Platform team velocity down two sprints running", detail: "Story throughput down 18%; incident load up. Risk to Q3 roadmap commitments.", probability: 0.52, confidence: 0.6 },
  { domain: "signals", severity: 4, title: "Competitor pricing move detected", detail: "Primary competitor dropped enterprise tier pricing 15% — early signal of share pressure in mid-market.", probability: 0.66, confidence: 0.55 },
  { domain: "strategic", severity: 2, title: "Enterprise launch dependencies on track", detail: "All cross-functional workstreams reporting green status for the upcoming launch window.", probability: 0.2, confidence: 0.64 },
  { domain: "culture", severity: 3, title: "Engagement dip in Operations", detail: "Pulse survey sentiment down 9 points quarter over quarter, concentrated in ops team.", probability: 0.4, confidence: 0.5 },
];

async function seedIfEmpty() {
  if (engine.seeded) return;
  const existing = await db.select({ id: people.id }).from(people).limit(1);
  if (existing.length === 0) {
    await db.insert(people).values(SEED_PEOPLE);

    const now = Date.now();
    await db.insert(decisions).values(
      SEED_DECISIONS.map((d) => ({
        title: d.title,
        domain: d.domain,
        deadline: new Date(now + d.hoursFromNow * 3600 * 1000),
        status: "open" as const,
      })),
    );

    await db.insert(hypotheses).values(
      SEED_HYPOTHESES.map((h) => ({
        title: h.title,
        domain: h.domain,
        status: "open" as const,
        resolvesAt: new Date(now + h.hoursFromNow * 3600 * 1000),
        confidence: h.confidence,
      })),
    );

    await db.insert(playbooks).values(
      SEED_PLAYBOOKS.map((p) => ({ title: p.title, domain: p.domain, status: p.status })),
    );

    await db.insert(findings).values(
      SEED_FINDING_TEMPLATES.map((f) => ({
        domain: f.domain,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        probability: f.probability,
        confidence: f.confidence,
      })),
    );

    await db.insert(latentNodes).values(
      DOMAIN_ORDER.map((domain) => ({
        label: `${domain} latent risk`,
        domain,
        posterior: randRange(0.1, 0.45),
        confidence: randRange(0.4, 0.85),
      })),
    );

    await db.insert(domainHealthHistory).values(
      DOMAIN_ORDER.flatMap((domain) =>
        [7, 0].map((daysAgo) => ({
          domain,
          score: randRange(55, 90),
          recordedAt: new Date(now - daysAgo * 24 * 3600 * 1000),
        })),
      ),
    );

    await db.insert(briefings).values([
      {
        date: new Date().toISOString().slice(0, 10),
        executiveSummary:
          "Overnight signals point to concentrated attrition risk in Sales and a widening infra cost gap. Nothing in the enterprise launch path has slipped. Recommend a retention conversation with the three flagged reps before Thursday's QBR.",
        bullets: [
          "Hold 1:1s with the three flagged Sales reps before Thursday",
          "Review infra vendor contract terms with Finance this week",
          "No action needed on enterprise launch — on track",
        ],
        fullText:
          "Overnight signals point to a concentrated attrition risk cluster in Sales (3 reps, compounding disengagement signals over 10 days) and a widening infrastructure cost gap (12% over plan for two consecutive months). The enterprise launch workstream remains green across all dependencies. Competitive signal: a primary competitor cut enterprise pricing 15%, which should be monitored but does not require immediate repricing action. Recommended focus for today: (1) retention conversations with flagged Sales reps, (2) Finance review of the infra vendor contract before renewal, (3) continue monitoring competitor pricing signal in Signals view.",
      },
    ]);

    await db.insert(agentRuns).values({ status: "idle" });
  }
  engine.seeded = true;
}

async function computeDomainHealth(): Promise<{ current: Record<Domain, number>; prior: Record<Domain, number> }> {
  const active = await db.select().from(findings).where(eq(findings.dismissed, false));
  const current = {} as Record<Domain, number>;
  for (const domain of DOMAIN_ORDER) {
    const domainFindings = active.filter((f) => f.domain === domain);
    const penalty = domainFindings.reduce((sum, f) => sum + f.severity * f.severity * 1.8, 0);
    current[domain] = Math.round(clamp(92 - penalty, 5, 98));
  }

  const priorRows = await db
    .select()
    .from(domainHealthHistory)
    .where(gte(domainHealthHistory.recordedAt, new Date(Date.now() - 9 * 24 * 3600 * 1000)));
  const prior = {} as Record<Domain, number>;
  for (const domain of DOMAIN_ORDER) {
    const rows = priorRows.filter((r) => r.domain === domain);
    prior[domain] = rows.length > 0 ? Math.round(rows[0].score) : current[domain];
  }
  return { current, prior };
}

function toFinding(row: typeof findings.$inferSelect): Finding {
  return {
    id: row.id,
    domain: row.domain,
    severity: Math.round(row.severity) as Finding["severity"],
    title: row.title,
    detail: row.detail,
    probability: row.probability,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    playbookId: row.playbookId,
    dismissed: row.dismissed,
  };
}

function buildAssessment(findingsList: Finding[], cascadeRisk: number, orgHealthScore: number): string {
  const critical = findingsList.filter((f) => f.severity >= 5 && !f.dismissed);
  const urgent = findingsList.filter((f) => f.severity === 4 && !f.dismissed);
  if (critical.length > 0) {
    return `${critical.length} critical finding${critical.length > 1 ? "s" : ""} require immediate attention, led by "${critical[0].title}". Cascade risk is ${Math.round(cascadeRisk * 100)}% — treat this as a cross-domain exposure, not an isolated issue. Organizational health sits at ${orgHealthScore}/100.`;
  }
  if (urgent.length > 0) {
    return `No critical findings, but ${urgent.length} urgent item${urgent.length > 1 ? "s" : ""} are building, led by "${urgent[0].title}". Cascade risk is contained at ${Math.round(cascadeRisk * 100)}%. Organizational health is ${orgHealthScore}/100 — stable but worth monitoring closely today.`;
  }
  return `All domains are within normal operating range. Organizational health is ${orgHealthScore}/100 and cascade risk is low at ${Math.round(cascadeRisk * 100)}%. Use today to work the backlog rather than firefight.`;
}

export async function getSnapshot(): Promise<OrchestratorResult> {
  if (!engine.initPromise) {
    engine.initPromise = seedIfEmpty().then(() => ensureInterval());
  }
  await engine.initPromise;
  return buildSnapshot();
}

async function buildSnapshot(): Promise<OrchestratorResult> {
  const [findingRows, decisionRows, hypothesisRows, playbookRows, peopleRows, latentRows, briefingRows] =
    await Promise.all([
      db.select().from(findings).orderBy(desc(findings.createdAt)),
      db.select().from(decisions).orderBy(decisions.deadline),
      db.select().from(hypotheses).orderBy(hypotheses.resolvesAt),
      db.select().from(playbooks).orderBy(desc(playbooks.createdAt)),
      db.select().from(people),
      db.select().from(latentNodes),
      db.select().from(briefings).orderBy(desc(briefings.createdAt)).limit(1),
    ]);

  const { current, prior } = await computeDomainHealth();
  const findingsList = findingRows.map(toFinding);
  const activeFindings = findingsList.filter((f) => !f.dismissed);

  const criticalCount = activeFindings.filter((f) => f.severity >= 5).length;
  const urgentCount = activeFindings.filter((f) => f.severity === 4).length;
  const topPosteriors = [...latentRows].sort((a, b) => b.posterior - a.posterior).slice(0, 3);
  const avgTopPosterior = topPosteriors.length
    ? topPosteriors.reduce((s, n) => s + n.posterior, 0) / topPosteriors.length
    : 0;
  const cascadeRisk = clamp(0.12 * criticalCount + 0.06 * urgentCount + avgTopPosterior * 0.5, 0, 1);

  const orgHealthScore = Math.round(
    DOMAIN_ORDER.reduce((sum, d) => sum + current[d], 0) / DOMAIN_ORDER.length,
  );

  const systemConfidence = latentRows.length
    ? latentRows.reduce((s, n) => s + n.confidence, 0) / latentRows.length
    : 0.5;

  const today = new Date().toISOString().slice(0, 10);
  const todaysBriefing = briefingRows.find((b) => b.date === today) ?? briefingRows[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    domainHealth: current,
    priorDomainHealth: prior,
    findings: findingsList,
    decisions: decisionRows.map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      deadline: d.deadline ? d.deadline.toISOString() : null,
      status: d.status,
    })),
    hypotheses: hypothesisRows.map((h) => ({
      id: h.id,
      title: h.title,
      domain: h.domain,
      status: h.status,
      resolvesAt: h.resolvesAt ? h.resolvesAt.toISOString() : null,
      confidence: h.confidence,
    })),
    playbooks: playbookRows.map((p) => ({
      id: p.id,
      title: p.title,
      domain: p.domain,
      status: p.status,
      findingId: p.findingId,
    })),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      domain: p.domain,
      riskScore: p.riskScore,
      notes: p.notes,
    })),
    latentNodes: latentRows.map((n) => ({
      id: n.id,
      label: n.label,
      domain: n.domain,
      posterior: n.posterior,
      confidence: n.confidence,
      updatedAt: n.updatedAt.toISOString(),
    })),
    cascadeRisk,
    orgHealthScore,
    systemConfidence,
    situationalAssessment: buildAssessment(activeFindings, cascadeRisk, orgHealthScore),
    briefing: todaysBriefing
      ? {
          id: todaysBriefing.id,
          date: todaysBriefing.date,
          executiveSummary: todaysBriefing.executiveSummary,
          bullets: todaysBriefing.bullets,
          fullText: todaysBriefing.fullText,
        }
      : null,
  };
}

export function getAgentStatus(): AgentCycleResult {
  return engine.agentStatus;
}

function broadcast(event: RealtimeServerEvent) {
  engine.emitter.emit("event", event);
}

async function recomputeAndBroadcastBelief() {
  const rows = await db.select().from(latentNodes);
  for (const row of rows) {
    const next = clamp(row.posterior + randRange(-0.04, 0.04), 0.03, 0.95);
    await db.update(latentNodes).set({ posterior: next, updatedAt: new Date() }).where(eq(latentNodes.id, row.id));
  }
  const snapshot = await buildSnapshot();
  broadcast({
    type: "belief_update",
    cascadeRisk: snapshot.cascadeRisk,
    systemConfidence: snapshot.systemConfidence,
    latentNodes: snapshot.latentNodes,
  });
}

async function maybeSynthesizeFinding() {
  if (Math.random() > 0.55) return;
  const template = SEED_FINDING_TEMPLATES[Math.floor(Math.random() * SEED_FINDING_TEMPLATES.length)];
  const severityJitter = clamp(template.severity + (Math.random() > 0.7 ? 1 : 0) - (Math.random() > 0.7 ? 1 : 0), 1, 5);
  const [inserted] = await db
    .insert(findings)
    .values({
      domain: template.domain,
      severity: severityJitter,
      title: template.title,
      detail: template.detail,
      probability: template.probability ? clamp(template.probability + randRange(-0.08, 0.08), 0.05, 0.97) : null,
      confidence: clamp(template.confidence + randRange(-0.05, 0.05), 0.2, 0.95),
    })
    .returning();

  await db.insert(notifications).values({
    domain: inserted.domain,
    severity: inserted.severity,
    title: inserted.title,
    message: inserted.detail,
  });

  const snapshot = await buildSnapshot();
  broadcast({
    type: "findings_delta",
    findings: snapshot.findings,
    domainHealth: snapshot.domainHealth,
    orgHealthScore: snapshot.orgHealthScore,
  });
}

function ensureInterval() {
  if (engine.interval) return;
  engine.interval = setInterval(() => {
    recomputeAndBroadcastBelief().catch(() => {});
    maybeSynthesizeFinding().catch(() => {});
  }, 25000);
}

export async function runOrchestratorCycle(): Promise<OrchestratorResult> {
  engine.agentStatus = { ...engine.agentStatus, status: "running" };
  await db.insert(agentRuns).values({ status: "running" });

  await maybeSynthesizeFinding();
  await recomputeAndBroadcastBelief();

  const [openH, confirmedH, refutedH, triggeredPlaybooks] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(hypotheses).where(eq(hypotheses.status, "open")),
    db.select({ c: sql<number>`count(*)` }).from(hypotheses).where(eq(hypotheses.status, "confirmed")),
    db.select({ c: sql<number>`count(*)` }).from(hypotheses).where(eq(hypotheses.status, "refuted")),
    db
      .select({ c: sql<number>`count(*)` })
      .from(playbooks)
      .where(and(gte(playbooks.createdAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)))),
  ]);

  const now = new Date();
  engine.agentStatus = {
    status: "running",
    lastRun: now.toISOString(),
    nextRun: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    playbooksTriggeredThisWeek: Number(triggeredPlaybooks[0]?.c ?? 0),
    hypothesesOpen: Number(openH[0]?.c ?? 0),
    hypothesesConfirmed: Number(confirmedH[0]?.c ?? 0),
    hypothesesRefuted: Number(refutedH[0]?.c ?? 0),
  };
  engine.lastRunAt = Date.now();

  broadcast({ type: "agent_cycle_complete", agentStatus: engine.agentStatus });

  setTimeout(() => {
    engine.agentStatus = { ...engine.agentStatus, status: "idle" };
    broadcast({ type: "agent_cycle_complete", agentStatus: engine.agentStatus });
  }, 4000);

  return buildSnapshot();
}

export async function dismissFinding(id: string): Promise<void> {
  await db.update(findings).set({ dismissed: true }).where(eq(findings.id, id));
  const snapshot = await buildSnapshot();
  broadcast({
    type: "findings_delta",
    findings: snapshot.findings,
    domainHealth: snapshot.domainHealth,
    orgHealthScore: snapshot.orgHealthScore,
  });
}

export async function patchTask(
  kind: "decision" | "hypothesis" | "playbook",
  id: string,
  status: string,
): Promise<void> {
  if (kind === "decision") {
    await db.update(decisions).set({ status: status as "open" | "done" }).where(eq(decisions.id, id));
  } else if (kind === "hypothesis") {
    await db
      .update(hypotheses)
      .set({ status: status as "open" | "confirmed" | "refuted" })
      .where(eq(hypotheses.id, id));
  } else {
    await db
      .update(playbooks)
      .set({ status: status as "triggered" | "in_progress" | "done" })
      .where(eq(playbooks.id, id));
  }
}

export async function listNotifications() {
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100);
  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    severity: Math.round(r.severity),
    title: r.title,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    read: r.read,
  }));
}

export async function markAllNotificationsRead() {
  await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
}

export function subscribe(listener: (event: RealtimeServerEvent) => void) {
  engine.emitter.on("event", listener);
  return () => engine.emitter.off("event", listener);
}
