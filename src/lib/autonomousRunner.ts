// ─────────────────────────────────────────────────────────────────────────
// The real background intelligence loop.
//
// Every exported function here is deterministic given its inputs: no
// `setInterval`, no module-level timers, no writes. `runAutonomousCycle`
// reads the current state of the world through the supplied `db` client and
// returns a plain result object — the caller (the cron route) is
// responsible for persisting anything.
// ─────────────────────────────────────────────────────────────────────────
import { desc, inArray } from "drizzle-orm";
import type { db as DbInstance } from "@/db";
import {
  leados_autonomous_runs,
  leados_events,
  leados_people,
  leados_work_queue,
} from "@/db/schema";
import { runInference } from "./inference";
import type {
  AutonomousRunResult,
  Domain,
  Finding,
  LeadosEvent,
  NewNotificationInput,
  NewWorkItemInput,
  Person,
  WorkItem,
  WorkItemStatus,
} from "./types";

type DbClient = typeof DbInstance;

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES: WorkItemStatus[] = ["pending", "in_progress"];

function mapQueueRow(row: typeof leados_work_queue.$inferSelect): WorkItem {
  return {
    id: row.id,
    title: row.title,
    steps: row.steps ?? [],
    status: row.status as WorkItemStatus,
    domain: row.domain as Domain,
    source: row.source,
    findingKey: row.findingKey,
    priority: row.priority as WorkItem["priority"],
    dueAt: row.dueAt,
    assignedTo: row.assignedTo,
    blockedBy: row.blockedBy ?? [],
    outcomeNotes: row.outcomeNotes,
    suggestedAction: row.suggestedAction,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

function buildSteps(f: Finding): string[] {
  switch (f.rule) {
    case "flight_risk":
      return [
        `Schedule a retention 1:1 with ${f.personName ?? "the person"} this week.`,
        "Review recent comp, scope, and workload for warning signs.",
        "Loop in HRBP if risk remains elevated after the conversation.",
      ];
    case "cadence_slip":
      return [`Book the next 1:1 with ${f.personName ?? "the person"}.`, "Confirm a recurring cadence going forward."];
    case "engagement_decline":
      return ["Review recent pulse/feedback trend.", "Ask directly about workload and blockers in the next 1:1."];
    case "attrition_cluster":
      return ["Pull exit interview themes for the last 60 days.", "Review with HRBP for structural drivers."];
    case "runway_low":
    case "runway_drop":
      return ["Re-forecast burn with finance lead.", "Identify discretionary spend to defer.", "Update the board on runway trajectory."];
    case "pipeline_thin":
      return ["Review top-of-funnel sources with sales lead.", "Prioritize outbound/marketing push this cycle."];
    case "incident_cluster":
      return ["Run a blameless post-mortem for the cluster.", "Check on-call load and rotation health."];
    case "stale_escalation":
      return ["Add to the next leadership sync agenda.", "Assign a single accountable owner and a ruling deadline."];
    default:
      return ["Review the finding and determine next action."];
  }
}

/**
 * Generate net-new work items for findings at or above severity 3 that do
 * not already have an open (pending/in_progress) work item tracking them.
 */
export function generateWorkItems(findings: Finding[], existingQueue: WorkItem[], today: Date = new Date()): NewWorkItemInput[] {
  const openFindingKeys = new Set(
    existingQueue.filter((i) => OPEN_STATUSES.includes(i.status)).map((i) => i.findingKey),
  );

  const items: NewWorkItemInput[] = [];
  for (const f of findings) {
    if (f.sev < 3) continue;
    if (openFindingKeys.has(f.key)) continue;

    const dueInDays = f.sev >= 5 ? 1 : f.sev === 4 ? 3 : 7;
    items.push({
      title: f.title,
      steps: buildSteps(f),
      domain: f.domain,
      source: f.rule,
      findingKey: f.key,
      priority: f.sev,
      dueAt: new Date(today.getTime() + dueInDays * DAY_MS),
      suggestedAction: f.suggestedAction,
    });
  }
  return items;
}

/**
 * Work items whose triggering finding is no longer among the currently
 * active findings should be auto-resolved. Returns their ids.
 */
export function resolveStaleWorkItems(queue: WorkItem[], currentFindings: Finding[]): number[] {
  const activeKeys = new Set(currentFindings.map((f) => f.key));
  return queue
    .filter((i) => OPEN_STATUSES.includes(i.status) && !activeKeys.has(i.findingKey))
    .map((i) => i.id);
}

interface PreviousSnapshot {
  findings?: Finding[];
}

/**
 * Run one full autonomous intelligence cycle:
 *  1. Read the roster, event log, previous run snapshot, and open queue.
 *  2. Re-run the inference engine to get the current finding set.
 *  3. Diff against the previous snapshot to find new/resolved findings.
 *  4. Derive new work items and stale work item ids.
 *  5. Derive escalations (sev 5, or sev 4 persisting across runs) and the
 *     notifications that should be raised.
 *
 * Performs no writes — the caller persists the result.
 */
export async function runAutonomousCycle(db: DbClient, today: Date = new Date()): Promise<AutonomousRunResult> {
  const start = Date.now();

  const [peopleRows, eventRows, previousRuns, queueRows] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events),
    db.select().from(leados_autonomous_runs).orderBy(desc(leados_autonomous_runs.ranAt)).limit(1),
    db.select().from(leados_work_queue).where(inArray(leados_work_queue.status, OPEN_STATUSES)),
  ]);

  const roster: Person[] = peopleRows.map((p) => ({
    id: String(p.id),
    name: p.name,
    role: p.role,
    team: p.team,
    tenureStartAt: p.tenureStartAt,
  }));

  const events: LeadosEvent[] = eventRows.map((e) => ({
    id: String(e.id),
    type: e.type,
    domain: e.domain as Domain,
    personId: e.personId !== null ? String(e.personId) : null,
    data: e.data,
    occurredAt: e.occurredAt,
  }));

  const findings = runInference({ events, roster }, today);

  const previousSnapshot = (previousRuns[0]?.snapshot ?? {}) as PreviousSnapshot;
  const previousFindings = previousSnapshot.findings ?? [];
  const previousKeys = new Set(previousFindings.map((f) => f.key));
  const currentKeys = new Set(findings.map((f) => f.key));

  const newFindings = findings.filter((f) => !previousKeys.has(f.key));
  const resolvedFindings = previousFindings.filter((f) => !currentKeys.has(f.key));

  const existingQueue = queueRows.map(mapQueueRow);
  const newWorkItems = generateWorkItems(findings, existingQueue, today);
  const staleWorkItemIds = resolveStaleWorkItems(existingQueue, findings);

  // Escalate anything critical right now, or anything that was already
  // elevated last cycle and still hasn't cleared (persistence = escalate).
  const escalations = findings.filter((f) => f.sev >= 5 || (f.sev === 4 && previousKeys.has(f.key)));

  const notifications: NewNotificationInput[] = [];
  for (const f of newFindings) {
    if (f.sev >= 3) {
      notifications.push({
        type: "finding_new",
        severity: f.sev,
        title: f.title,
        body: f.detail,
        entityType: "finding",
      });
    }
  }
  for (const f of resolvedFindings) {
    notifications.push({
      type: "finding_resolved",
      severity: 1,
      title: `Resolved: ${f.title}`,
      body: "This finding is no longer active as of the latest cycle.",
      entityType: "finding",
    });
  }
  for (const f of escalations) {
    notifications.push({
      type: "escalation",
      severity: f.sev,
      title: `Escalation: ${f.title}`,
      body: `${f.detail} This requires human attention.`,
      entityType: "finding",
    });
  }
  for (const item of newWorkItems) {
    notifications.push({
      type: "work_item",
      severity: item.priority,
      title: `New work item: ${item.title}`,
      body: item.suggestedAction ?? "A new work item was auto-generated.",
      entityType: "work_item",
    });
  }

  const durationMs = Date.now() - start;
  const summary =
    findings.length === 0
      ? "No active findings this cycle."
      : `${findings.length} active finding(s) — ${newFindings.length} new, ${resolvedFindings.length} resolved, ` +
        `${newWorkItems.length} work item(s) queued, ${escalations.length} escalation(s).`;

  return {
    runAt: today.toISOString(),
    durationMs,
    findings,
    newFindings,
    resolvedFindings,
    newWorkItems,
    staleWorkItemIds,
    escalations,
    notifications,
    counts: {
      findings: findings.length,
      newFindings: newFindings.length,
      resolvedFindings: resolvedFindings.length,
      newWorkItems: newWorkItems.length,
      escalations: escalations.length,
    },
    summary,
  };
}
