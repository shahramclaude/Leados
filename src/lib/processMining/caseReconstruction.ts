// Part 28 — case reconstruction from raw events.
//
// Groups the flat event stream into process instances ("cases") using
// caseId as the primary correlation key (mirrors Part 01's event-store
// correlationId/entity chain concept). This is deliberately conservative:
// where the data is ambiguous we FLAG it rather than silently guessing,
// because a wrong case boundary corrupts every downstream metric.
//
// Known, honestly-reported degradation (see Phase 5 of the delivery note):
//  - If a caseId is reused for *overlapping* process instances (e.g. a
//    shared correlation id spans two interleaved sub-processes), we detect
//    the overlap (a new "start" activity appears before the prior segment
//    reached an "end" activity) and split on each start — but we mark the
//    resulting cases `ambiguous: true` with issue
//    "overlapping-start-before-prior-end" because attribution of events in
//    the overlap window is a best-effort heuristic, not a certainty.
//  - Cases with no observed end activity are kept as `open: true` rather
//    than dropped or force-closed.
import type { CaseEventView, CaseInstance, RawEvent, ReconstructionIssue, ReconstructionReport } from "./types";
import { clampNonNegative } from "./stats";

export interface ReconstructionOptions {
  /** Activities considered valid "start of case" markers. If omitted, the first-seen activity per case segment is used. */
  startActivities?: Set<string>;
  /** Activities considered valid "end of case" markers. If omitted, cases never auto-close (all open) unless a new start interrupts them. */
  endActivities?: Set<string>;
}

export function reconstructCases(
  events: RawEvent[],
  options: ReconstructionOptions = {},
): { cases: CaseInstance[]; report: ReconstructionReport } {
  const processName = events[0]?.processName ?? "unknown";
  const byCase = new Map<string, RawEvent[]>();
  for (const event of events) {
    const arr = byCase.get(event.caseId);
    if (arr) arr.push(event);
    else byCase.set(event.caseId, [event]);
  }

  const cases: CaseInstance[] = [];
  const issueCounts: Record<string, number> = {};
  const bumpIssue = (issue: ReconstructionIssue) => {
    issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
  };

  for (const [caseId, rawEventsForCase] of byCase) {
    const sorted = [...rawEventsForCase].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    // Detect shared correlationId spanning multiple distinct correlation values
    // under one caseId — a signal that the "case" key may not be a clean 1:1
    // process instance identifier in this data source.
    const correlationIds = new Set(sorted.map((e) => e.correlationId));
    const sharedCorrelationFlag = correlationIds.size > 1;

    let segment: RawEvent[] = [];
    let segmentAmbiguous = sharedCorrelationFlag;
    const segmentIssues = new Set<ReconstructionIssue>();
    if (sharedCorrelationFlag) segmentIssues.add("shared-correlation-id-multiple-cases");

    let segmentIndex = 0;
    const flushSegment = (forceOpen: boolean) => {
      if (segment.length === 0) return;
      segmentIndex += 1;
      const instanceId = segmentIndex === 1 ? caseId : `${caseId}::seg${segmentIndex}`;
      const caseInstance = buildCaseInstance(
        instanceId,
        processName,
        segment,
        segmentAmbiguous,
        [...segmentIssues],
        forceOpen,
      );
      cases.push(caseInstance);
      for (const issue of segmentIssues) bumpIssue(issue);
      segment = [];
      segmentAmbiguous = sharedCorrelationFlag;
      segmentIssues.clear();
      if (sharedCorrelationFlag) segmentIssues.add("shared-correlation-id-multiple-cases");
    };

    for (const event of sorted) {
      const isStart = options.startActivities?.has(event.activity) ?? false;
      const isEnd = options.endActivities?.has(event.activity) ?? false;

      if (isStart && segment.length > 0) {
        const lastEvent = segment[segment.length - 1];
        const lastWasEnd = options.endActivities?.has(lastEvent.activity) ?? false;
        if (!lastWasEnd) {
          // A new instance started before the previous one reached an end
          // marker: honestly flag this as an overlap rather than assume it's
          // fine.
          segmentAmbiguous = true;
          segmentIssues.add("overlapping-start-before-prior-end");
          flushSegment(true);
        } else {
          flushSegment(false);
        }
      }

      segment.push(event);

      if (isEnd) {
        flushSegment(false);
      }
    }
    // Trailing segment with no observed end activity.
    flushSegment(true);
  }

  const report: ReconstructionReport = {
    processName,
    totalRawEvents: events.length,
    totalCases: cases.length,
    ambiguousCases: cases.filter((c) => c.ambiguous).length,
    openCases: cases.filter((c) => c.open).length,
    issueCounts,
  };

  return { cases, report };
}

function buildCaseInstance(
  caseId: string,
  processName: string,
  segment: RawEvent[],
  ambiguous: boolean,
  issues: ReconstructionIssue[],
  forceOpen: boolean,
): CaseInstance {
  const eventViews: CaseEventView[] = [];
  let prevEnd: number | null = null;
  for (const event of segment) {
    const start = event.occurredAt.getTime();
    const queueMs = prevEnd === null ? 0 : clampNonNegative(start - prevEnd);
    eventViews.push({
      eventId: event.eventId,
      activity: event.activity,
      resourceId: event.resourceId,
      occurredAt: event.occurredAt,
      durationMs: event.durationMs,
      attributes: event.attributes,
      queueMs,
    });
    prevEnd = start + event.durationMs;
  }

  const startedAt = segment[0].occurredAt;
  const lastEvent = segment[segment.length - 1];
  const endedAt = new Date(lastEvent.occurredAt.getTime() + lastEvent.durationMs);

  return {
    caseId,
    processName,
    correlationId: segment[0].correlationId,
    events: eventViews,
    startedAt,
    endedAt,
    cycleTimeMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    open: forceOpen,
    ambiguous,
    issues,
  };
}
