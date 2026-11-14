/**
 * app/core/domain/automationOrchestrator.js — intelligent automation orchestrator.
 *
 * The existing automation layer (automation.js, postCommit.js with 89 rules)
 * is *reactive*: an event fires, a rule checks a guard, it writes if matched.
 * Three gaps remain:
 *
 *  1. No prioritisation — a retention alert and a stale-goal nudge are treated
 *     as equally urgent derived work.
 *  2. No batching — 5 case updates in one transaction produce 5 separate scans
 *     instead of one coalesced pass.
 *  3. No learning — the same manual fix repeated 10 times never becomes a
 *     template suggestion.
 *
 * This orchestrator adds those three capabilities without replacing the spine:
 *  - Priority queue: derived events are ordered by domain urgency so the most
 *    consequential propagation lands first and respects the event budget.
 *  - Coalescing: duplicate derived events (same type+entity) within one cascade
 *    are collapsed to one.
 *  - Repetition mining: counts how often a (rule, entityKind) fires and
 *    surfaces a "template candidate" when it crosses a threshold.
 *
 * All functions are pure and read-side except the queue helpers, which are
 * used inside the post-commit runner.
 */

const PRIORITY = {
  // Safety / retention is highest — a person may be harmed
  retention: 100,
  resilience: 90,
  risk: 85,
  // Structural / matrix correctness — wrong attribution corrupts roll-ups
  matrix: 80,
  sod: 80,
  // Delivery / capacity
  capacity: 70,
  allocation: 65,
  // Learning / calibration
  learning: 50,
  calibration: 50,
  // Hygiene / informational
  hygiene: 20,
  generic: 10,
};

function priorityForEvent(event) {
  const t = event?.type || '';
  if (t.startsWith('retention.') || t.startsWith('person.')) return PRIORITY.retention;
  if (t.startsWith('case.') || t.startsWith('incident')) return PRIORITY.resilience;
  if (t.startsWith('risk') || t.startsWith('resilience')) return PRIORITY.risk;
  if (t.startsWith('matrix.') || t.startsWith('reportingline') || t.startsWith('sod.')) return PRIORITY.matrix;
  if (t.startsWith('portfolio.') || t.startsWith('capacity.')) return PRIORITY.capacity;
  if (t.startsWith('allocation.') || t.startsWith('budget.')) return PRIORITY.allocation;
  if (t.startsWith('calibration') || t.startsWith('voi.')) return PRIORITY.calibration;
  if (t.startsWith('automation.')) return PRIORITY.hygiene;
  return PRIORITY.generic;
}

/**
 * Priority queue for derived events. Insertion-order stable within a priority
 * band, highest priority dequeued first.
 */
export function createPriorityQueue() {
  const items = [];
  return {
    push(event) {
      const p = priorityForEvent(event);
      items.push({ event, priority: p, seq: items.length });
    },
    pop() {
      if (items.length === 0) return null;
      let best = 0;
      for (let i = 1; i < items.length; i += 1) {
        if (items[i].priority > items[best].priority) best = i;
        else if (items[i].priority === items[best].priority && items[i].seq < items[best].seq) best = i;
      }
      const out = items[best].event;
      items.splice(best, 1);
      return out;
    },
    peek() {
      if (items.length === 0) return null;
      let best = 0;
      for (let i = 1; i < items.length; i += 1) {
        if (items[i].priority > items[best].priority) best = i;
      }
      return items[best].event;
    },
    size() { return items.length; },
    drain() {
      const out = [];
      let ev;
      while ((ev = this.pop()) !== null) out.push(ev);
      return out;
    },
    toArray() { return items.map((x) => x.event); },
  };
}

/**
 * Coalesce duplicate derived events within one cascade.
 * Two events are duplicates when they share (type, entity, entityId).
 */
export function coalesceEvents(events) {
  const seen = new Map();
  const out = [];
  for (const ev of events) {
    const key = `${ev.type}|${ev.entity}|${ev.entityId}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      out.push(ev);
    }
  }
  return { deduped: out, removed: events.length - out.length };
}

/**
 * Schedule derived events with priority and coalescing.
 * Returns ordered, deduped list plus stats.
 */
export function scheduleDerivedEvents(events) {
  const { deduped, removed } = coalesceEvents(events);
  const q = createPriorityQueue();
  for (const ev of deduped) q.push(ev);
  const ordered = q.drain();
  return { ordered, coalesced: removed, total: events.length, deduped: deduped.length };
}

/**
 * Auto-classification helper: given free-text fields, suggest a case kind
 * and priority using keyword heuristics. This is a transparent, rule-based
 * classifier — not an opaque model — so the suggestion can be explained.
 *
 * Returns { kind, priority, confidence, reasons } or null when no signal.
 */
const KIND_KEYWORDS = {
  incident: ['outage', 'down', 'incident', 'breach', 'failure', 'error', 'bug', 'broken', 'downtime', 'p1', 'p0', 'sev1', 'sev0'],
  risk: ['risk', 'exposure', 'threat', 'vulnerability', 'compliance', 'audit', 'regulatory', 'penalty'],
  improvement: ['improve', 'optimise', 'optimize', 'efficiency', 'reduce', 'streamline', 'automate', 'refactor'],
  strategic: ['strategy', 'strategic', 'initiative', 'transformation', 'roadmap', 'vision', 'bet'],
};

const PRIORITY_KEYWORDS = {
  high: ['urgent', 'critical', 'blocker', 'asap', 'p0', 'p1', 'sev1', 'sev0', 'deadline', 'escalat'],
  medium: ['important', 'needed', 'should', 'p2', 'sev2'],
  low: ['nice', 'idea', 'consider', 'maybe', 'p3', 'p4'],
};

export function autoClassify(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();
  let bestKind = null;
  let bestKindHits = 0;
  const kindReasons = {};
  for (const [kind, keywords] of Object.entries(KIND_KEYWORDS)) {
    let hits = 0;
    const matched = [];
    for (const kw of keywords) {
      if (lower.includes(kw)) { hits += 1; matched.push(kw); }
    }
    kindReasons[kind] = matched;
    if (hits > bestKindHits) { bestKindHits = hits; bestKind = kind; }
  }
  if (!bestKind || bestKindHits === 0) return null;

  let priority = 'medium';
  let prioHits = 0;
  for (const [p, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) if (lower.includes(kw)) hits += 1;
    if (hits > prioHits) { prioHits = hits; priority = p; }
  }

  // Confidence: more keyword hits = higher confidence, capped
  const confidence = bestKindHits >= 3 ? 'high' : bestKindHits === 2 ? 'medium' : 'low';
  return {
    kind: bestKind,
    priority,
    confidence,
    hits: bestKindHits,
    reasons: kindReasons[bestKind],
    explanation: `Matched ${bestKindHits} keyword(s) for "${bestKind}": ${kindReasons[bestKind].join(', ')}`,
  };
}

/**
 * Repetition mining: count (rule, entityKind) occurrences across a window
 * of events and flag candidates that exceed a threshold.
 *
 * This is how "do this 10 times manually → suggest a template" is implemented
 * without storing PII or learning a model.
 */
export function mineRepetitions(events, threshold = 5) {
  const counts = new Map();
  for (const ev of events) {
    const kind = `${ev.type || 'unknown'}|${ev.entity || 'unknown'}`;
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const candidates = [];
  for (const [kind, count] of counts.entries()) {
    if (count >= threshold) candidates.push({ kind, count, threshold, templateCandidate: true });
  }
  candidates.sort((a, b) => b.count - a.count);
  return { counts: Object.fromEntries(counts), candidates };
}

/**
 * Automation health: given the propagation reporter's ledger for one cascade,
 * produce a one-line summary.
 */
export function automationHealth(reporter) {
  if (!reporter) return { ok: true, executed: 0, declined: 0, rolledBack: 0 };
  return {
    ok: (reporter.rolledBack || 0) === 0,
    executed: reporter.executed || 0,
    declined: reporter.declined || 0,
    rolledBack: reporter.rolledBack || 0,
    skipped: reporter.skipped || 0,
    elapsedMs: reporter.elapsedMs || 0,
    events: reporter.events || 0,
  };
}

/**
 * Orchestrator read: combines health + repetition mining + pending derived
 * queue depth for the current cascade snapshot.
 */
export function orchestratorRead({ reporter = null, pendingEvents = [], recentEvents = [] } = {}) {
  const health = automationHealth(reporter);
  const repetitions = mineRepetitions(recentEvents.length ? recentEvents : pendingEvents);
  return {
    at: new Date().toISOString(),
    health,
    pending: pendingEvents.length,
    repetitions,
    priorityHint: pendingEvents.map((e) => ({ type: e.type, priority: priorityForEvent(e) })).slice(0, 10),
  };
}
