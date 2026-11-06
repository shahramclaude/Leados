/** Schema v107: bounded, review-gated capture plans. Never infer an adoption. */
import { BUNDLE_KINDS, BUNDLE_LIMITS } from './actionBundleRegistry.js';
import { cleanBundlePreview } from './actionBundleSchema.js';
import { CAPTURE_STATUSES, MISSION_LIMITS } from './missionRegistry.js';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null;
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{16}$/.test(v) ? v : '';

export function normalizeCaptureCaseInput(raw) {
  if (!object(raw) || !text(raw.title) || !day(raw.openedOn) || !day(raw.reviewOn)) return null;
  const f = object(raw.fmea) ? raw.fmea : {};
  const money = object(raw.financial) ? raw.financial : {};
  const ratings = ['severity', 'probability', 'detectability'];
  if (ratings.some((k) => f[k] != null && !integer(f[k], 1, 10))) return null;
  const amounts = ['optimistic', 'mostLikely', 'pessimistic', 'mitigationCost', 'capacityDaysOptimistic', 'capacityDaysMostLikely', 'capacityDaysPessimistic'];
  if (amounts.some((k) => money[k] != null && !finite(money[k], 0, 1e12))) return null;
  return {
    kind: text(raw.kind, 40) || 'risk', title: text(raw.title, 180), summary: text(raw.summary, 4000),
    ownerId: text(raw.ownerId, 80) || null,
    involvedPersonIds: [...new Set((Array.isArray(raw.involvedPersonIds) ? raw.involvedPersonIds : []).map((v) => text(v, 80)).filter(Boolean))].slice(0, 40),
    linkedGoalId: text(raw.linkedGoalId, 80) || null, openedOn: day(raw.openedOn), reviewOn: day(raw.reviewOn),
    fmea: Object.fromEntries([...ratings.map((k) => [k, f[k] ?? null]), ...['failureMode', 'effect', 'controls'].map((k) => [k, text(f[k], 600)])]),
    financial: { currency: text(money.currency, 6).toUpperCase() || 'USD', ...Object.fromEntries(amounts.map((k) => [k, money[k] ?? 0])), opportunityCost: text(money.opportunityCost, 600) },
    stakeholders: [], rca: { whys: [], problemStatement: '', rootCause: '', systemicBarrier: '', preventiveAction: '' }, autoPropagate: true,
  };
}

function classification(raw) {
  if (!object(raw)) return null;
  return {
    engineVersion: text(raw.engineVersion, 80), primaryCategoryId: text(raw.primaryCategoryId, 80),
    primaryLabel: text(raw.primaryLabel, 120), confidenceBand: ['high', 'medium', 'low'].includes(raw.confidenceBand) ? raw.confidenceBand : 'low',
    confidencePct: finite(raw.confidencePct, 0, 100) ? raw.confidencePct : 0,
    marginPct: finite(raw.marginPct, 0, 100) ? raw.marginPct : 0,
    ambiguous: raw.ambiguous === true, stakesReviewRequired: raw.stakesReviewRequired === true,
    evidence: (Array.isArray(raw.evidence) ? raw.evidence : []).slice(0, 12).flatMap((e) => object(e) && text(e.term) && finite(e.weight, 0, 20)
      ? [{ term: text(e.term, 80), weight: e.weight, sentence: text(e.sentence, 240), negated: e.negated === true }] : []),
  };
}

const signpost = (v) => typeof v === 'string' ? v.trim().slice(0, 400) : '';
function options(v) {
  if (!Array.isArray(v) || v.length < 2 || v.length > 5) return null;
  const clean = v.map((o) => (object(o) ? { label: text(o.label, 120), pros: text(o.pros, 300), cons: text(o.cons, 300) } : null));
  return clean.every((o) => o && o.label) ? clean : null;
}
function commands(raw) {
  if (!Array.isArray(raw) || raw.length > BUNDLE_LIMITS.commands) return [];
  const seen = new Set();
  return raw.flatMap((a) => {
    if (!object(a) || !BUNDLE_KINDS.includes(a.kind) || seen.has(a.kind) || !text(a.title) || !day(a.dueOn)) return [];
    seen.add(a.kind);
    const kept = Object.fromEntries(Object.entries(a).filter(([k, v]) => (['kind', 'title', 'ownerId', 'sourceId', 'budgetId', 'dueOn', 'question', 'outcome', 'statement', 'prompt', 'signpost'].includes(k)
      ? typeof v === 'string' || (v === null && ['ownerId', 'sourceId', 'budgetId'].includes(k)) : ['amount', 'priorPct'].includes(k) && typeof v === 'number' && Number.isFinite(v))));
    if (a.kind === 'decision' && a.options !== undefined) { const opts = options(a.options); if (opts) kept.options = opts; }
    return [kept];
  });
}

/**
 * ADR-0114: the reviewer's per-action edits travel as one bounded object on the
 * capture itself, so the fingerprint, the stored rehearsal and the adopted bundle
 * all describe the same reviewed words. Unknown kinds and malformed entries are
 * dropped; a malformed option list is dropped whole, never silently repaired.
 */
export function normalizeCommandEdits(raw) {
  if (!object(raw)) return null;
  const out = {};
  const per = {
    decision: ['title', 'question'], delegation: ['title', 'outcome'],
    premise: ['title', 'statement', 'signpost'], coaching: ['title', 'prompt'],
  };
  for (const [kind, keys] of Object.entries(per)) {
    const rawEdit = raw[kind]; if (!object(rawEdit)) continue;
    const edit = {};
    for (const key of keys) {
      const max = key === 'title' ? 180 : key === 'prompt' ? 180 : key === 'signpost' ? 400 : 1000;
      const value = key === 'signpost' ? signpost(rawEdit[key]) : text(rawEdit[key], max);
      if (value) edit[key] = value;
    }
    if (kind === 'decision' && rawEdit.options !== undefined) { const opts = options(rawEdit.options); if (opts) edit.options = opts; }
    if (Object.keys(edit).length) out[kind] = edit;
  }
  return Object.keys(out).length ? out : null;
}

/** Corrupt previews lose approval; they never become a silently trusted receipt. */
export function normalizeMissionCaptures(raw, state = {}, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const out = []; const seen = new Set(); const today = new Date(now).toISOString().slice(0, 10);
  for (const row of raw.slice(0, MISSION_LIMITS.captures * 2)) {
    const caseInput = object(row) ? normalizeCaptureCaseInput(row.caseInput) : null;
    if (!object(row) || !text(row.id) || seen.has(row.id) || !text(row.ownerSeatId) || !integer(row.rank, 1, 5)
      || !iso(row.createdAt) || !day(row.reviewOn) || !caseInput || !classification(row.classification)
      || !Array.isArray(row.kinds) || !row.kinds.length || row.kinds.some((k) => !BUNDLE_KINDS.includes(k))
      || new Set(row.kinds).size !== row.kinds.length) {
      warnings.push('Mission captures: dropped a malformed plan; no note, owner or approval was inferred.'); continue;
    }
    const expired = caseInput.reviewOn < today && !['adopted', 'dismissed'].includes(row.status);
    if (expired) warnings.push('Mission captures: an expired proposal was returned to draft; revise its date and rehearse it.');
    let status = CAPTURE_STATUSES.includes(row.status) ? row.status : 'draft';
    if (expired) status = 'draft';
    const preview = cleanBundlePreview(row.preview);
    const plan = commands(row.commands);
    if (status === 'rehearsed' && (!preview || preview.failureCount || !plan.length || !hash(row.inputFingerprint) || !hash(row.sourceFingerprint) || !iso(row.evaluatedAt))) {
      status = 'draft'; warnings.push('Mission captures: an incomplete rehearsal was returned to draft.');
    }
    const caseId = text(row.caseId, 80) || null;
    const bundleId = text(row.bundleId, 80) || null;
    if (status === 'adopted' && (!caseId || !bundleId || !iso(row.adoptedAt) || !preview
      || !(state.cases || []).some((c) => c.id === caseId) || !(state.actionBundles || []).some((b) => b.id === bundleId))) {
      warnings.push('Mission captures: dropped an adoption whose case or bundle receipt is missing.'); continue;
    }
    if (status === 'dismissed' && !text(row.dismissReason)) {
      status = 'draft'; warnings.push('Mission captures: a dismissal without a reason was returned to draft.');
    }
    seen.add(row.id);
    out.push({
      id: text(row.id, 80), title: text(row.title, 180) || caseInput.title, sourceText: text(row.sourceText, MISSION_LIMITS.noteChars),
      ownerSeatId: text(row.ownerSeatId, 80), ownerId: text(row.ownerId, 80) || null, rank: row.rank, altitudeKey: text(row.altitudeKey, 40),
      reviewOn: day(row.reviewOn), status, caseInput, kinds: [...row.kinds], classification: classification(row.classification),
      commands: plan, commandEdits: normalizeCommandEdits(row.commandEdits), budgetId: text(row.budgetId, 80) || null, amount: finite(row.amount, 0, 1e12) ? row.amount : null,
      priorPct: integer(row.priorPct, 5, 95) ? row.priorPct : 70,
      inputFingerprint: hash(row.inputFingerprint), sourceFingerprint: hash(row.sourceFingerprint), planFingerprint: hash(row.planFingerprint),
      baseRevision: integer(row.baseRevision, 0, 1e9) ? row.baseRevision : 0, evaluatedAt: iso(row.evaluatedAt), preview,
      caseId, bundleId, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) || iso(row.createdAt), adoptedAt: iso(row.adoptedAt), dismissedAt: iso(row.dismissedAt),
      dismissReason: text(row.dismissReason, 600),
      history: (Array.isArray(row.history) ? row.history : []).filter((h) => object(h) && iso(h.at) && text(h.summary)).slice(-60).map((h) => ({ at: iso(h.at), type: text(h.type, 40), summary: text(h.summary, 300) })),
    });
    if (out.length >= MISSION_LIMITS.captures) break;
  }
  return out;
}
