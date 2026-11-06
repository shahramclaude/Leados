/**
 * ADR-0106 — the execution-evidence registry.
 *
 * One row per Action Bundle command kind. The shared rule engine subscribes to
 * `events`, asks `inspect` for a dated proof pointer, and never guesses that a
 * changed record means a delivered outcome. Adding a command adapter without
 * an evidence contract is a test failure, not a silently open loop forever.
 *
 * Frameworks: PDCA / Deming closure (Check and Act need evidence, not a tick);
 * assumption-based planning (a premise closes on a human outcome, not a model
 * posterior); commitment accounting (released authority is cancelled, not spent).
 */
import { BUNDLE_KINDS } from './actionBundleRegistry.js';

export const EXECUTION_VERSION = 'execution-evidence-2026.11-v1';
export const EXECUTION_STATES = Object.freeze(['waiting', 'moving', 'blocked', 'ready', 'closed', 'reopened']);
export const PROOF_STATES = Object.freeze(['pending', 'fulfilled', 'stopped', 'blocked', 'missing']);
export const EXECUTION_RULE_ID = 'RULE-EXE-01';
export const EXECUTION_SCAN_EVENT = 'execution.scan';
export const EXECUTION_CHANGED_EVENT = 'bundle.execution.changed';
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const proof = (state, type, id, on, reason, extra = {}) => ({ state, evidence: id ? { type, id, on: day(on) } : null, reason, ...extra });
const afterAdoption = (b, on) => !day(on) || !b.committedAt || on >= b.committedAt.slice(0, 10);

/** Pure evidence adapters. `missing` and `blocked` are never counted as done. */
export const EXECUTION_ADAPTERS = Object.freeze({
  decision: Object.freeze({
    events: Object.freeze(['decision.made', 'decision.reviewed', 'decision.updated', 'decision.withdrawn']),
    inspect(s, o, b) {
      const r = (s.decisions || []).find((x) => x.id === o.id);
      if (!r) return proof('missing', 'decision', o.id, null, 'The decision record is missing; its history was not erased.');
      if (r.reviewedOn && r.chosen && ['good', 'mixed', 'bad'].includes(r.outcome) && afterAdoption(b, r.reviewedOn)) {
        return proof('fulfilled', 'decision', r.id, r.reviewedOn, `Choice reviewed with a recorded ${r.outcome} outcome.`, { outcome: r.outcome });
      }
      return proof('pending', 'decision', r.id, r.decidedOn, r.chosen ? 'Chosen, but the outcome review is still open.' : 'No choice has been recorded.');
    },
  }),
  delegation: Object.freeze({
    events: Object.freeze(['delegation.completed', 'delegation.returned', 'delegation.updated', 'delegation.redelegated']),
    inspect(s, o, b) {
      const r = (s.delegations || []).find((x) => x.id === o.id);
      if (!r) return proof('missing', 'delegation', o.id, null, 'The owned work record is missing.');
      if (r.status === 'done' && r.completedOn && r.completionNote && afterAdoption(b, r.completedOn)) return proof('fulfilled', 'delegation', r.id, r.completedOn, 'Delivered outcome recorded by the accountable owner.');
      if (r.status === 'returned') return proof('blocked', 'delegation', r.id, r.returnedOn, 'Work was returned to the leader; it is not delivered.');
      return proof('pending', 'delegation', r.id, null, 'Work is still active.');
    },
  }),
  premise: Object.freeze({
    events: Object.freeze(['premise.outcome', 'premise.reviewed', 'premise.updated', 'premise.withdrawn']),
    inspect(s, o, b) {
      const r = (s.premises || []).find((x) => x.id === o.id);
      if (!r) return proof('missing', 'premise', o.id, null, 'The assumption record is missing.');
      const settled = (s.premiseOutcomes || []).filter((x) => x.premiseId === o.id && ['held', 'failed'].includes(x.verdict) && afterAdoption(b, x.settledOn)).sort((a, z) => String(a.settledOn).localeCompare(String(z.settledOn)) || String(a.id).localeCompare(String(z.id)))[0];
      if (settled) return proof('fulfilled', 'premiseOutcome', settled.id, settled.settledOn, `Human outcome recorded: assumption ${settled.verdict}.`, { outcome: settled.verdict });
      if (r.humanDisposition === 'retired') return proof('stopped', 'premise', r.id, r.lastReviewedOn, 'The assumption was explicitly retired, not proven.');
      return proof('pending', 'premise', r.id, null, 'A model posterior or an inconclusive checkpoint is not a settled outcome.');
    },
  }),
  budget: Object.freeze({
    events: Object.freeze(['budget.actualRecorded', 'budget.lineReleased', 'budget.lineUpdated', 'budget.lineDeleted', 'budget.deleted']),
    inspect(s, o, b) {
      const envelope = (s.budgets || []).find((x) => x.id === o.budgetId);
      const r = envelope?.lines?.find((x) => x.id === o.id);
      if (!r) return proof('missing', 'budget', o.id, null, 'The commitment line or its envelope is missing.');
      if (r.status === 'spent' && Number.isFinite(r.actualAmount) && afterAdoption(b, r.spentOn)) return proof('fulfilled', 'budget', r.id, r.spentOn, 'Actual spend recorded; the encumbrance was reconciled by Finance.', { budgetId: envelope.id });
      if (r.status === 'spent') return proof('blocked', 'budget', r.id, null, 'Marked spent without a finite actual amount or date; closure is refused.');
      if (r.status === 'released') return proof('stopped', 'budget', r.id, r.releasedOn, 'Unspent authority was released. Cancellation is not delivery.');
      return proof('pending', 'budget', r.id, null, 'Authority is committed; actual spend is not yet recorded.');
    },
  }),
  comms: Object.freeze({
    events: Object.freeze(['comms.sent', 'comms.dismissed', 'comms.updated']),
    inspect(s, o, b) {
      const r = (s.commsDrafts || []).find((x) => x.id === o.id);
      if (!r) return proof('missing', 'comms', o.id, null, 'The communication draft is missing.');
      if (r.status === 'sent' && r.sentOn && afterAdoption(b, r.sentOn)) return proof('fulfilled', 'comms', r.id, r.sentOn, 'A human recorded the message as sent outside LeadOS.');
      if (r.status === 'dismissed') return proof('stopped', 'comms', r.id, r.dismissedOn || r.updatedAt?.slice(0, 10), 'The draft was dismissed; nothing is claimed sent.');
      return proof('pending', 'comms', r.id, null, 'The brief is still a draft or approved text, not a sent message.');
    },
  }),
  coaching: Object.freeze({
    events: Object.freeze(['oneonone.logged', 'person.updated']),
    inspect(s, o, b) {
      const r = (s.people || []).find((x) => x.id === o.id);
      if (!r) return proof('missing', 'person', o.id, null, 'The person record is missing.');
      const prompt = String(o.prompt || '').toLowerCase();
      const held = (s.oneOnOnes || []).filter((m) => m.personId === o.id && m.status === 'held' && afterAdoption(b, m.date)
        && (m.resolvedTopics || []).some((t) => String(t).toLowerCase() === prompt)).sort((a, z) => String(a.date).localeCompare(String(z.date)) || String(a.id).localeCompare(String(z.id)))[0];
      if (held && !(r.talkingPoints || []).includes(o.prompt)) return proof('fulfilled', 'oneonone', held.id, held.date, 'The exact prompt was covered in a held 1:1.');
      if (!(r.talkingPoints || []).includes(o.prompt)) return proof('blocked', 'person', r.id, null, 'The prompt disappeared without a held 1:1 covering it. Deletion is not proof of coaching.');
      return proof('pending', 'person', r.id, null, 'The coaching prompt is still queued for a held conversation.');
    },
  }),
});

export const EXECUTION_EVENTS = Object.freeze([...new Set([
  ...Object.values(EXECUTION_ADAPTERS).flatMap((a) => a.events),
  'case.resolved', 'case.reopened', 'case.deleted', 'bundle.committed', 'bundle.withdrawn', 'bundle.scan', 'mission.capture.adopted', EXECUTION_SCAN_EVENT,
])]);

// Construction-time contract: every command kind has exactly one evidence row.
if (Object.keys(EXECUTION_ADAPTERS).sort().join('|') !== [...BUNDLE_KINDS].sort().join('|')) {
  throw new Error('Every bundle command kind must declare an execution-evidence adapter.');
}
