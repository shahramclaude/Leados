/**
 * app/core/domain/workTurnSchema.js — fail-closed normalization for the
 * Non-Promotable Work Turn Ledger (ADR-0181, Schema v144).
 *
 * WHAT IS STORED
 *   `workTurnActs`     append-only dated classification ACTS. One act names the
 *                      ask (a delegation), the person it was handed to, ONE kind
 *                      from the closed list, and the seat that declared it. The
 *                      latest act per ask is the effective one.
 *   `workTurnMarkers`  RULE-NPW-01's bounded idempotency / observation ledger.
 *   five settings      `workTurnWindowDays`, `workTurnMinAsks`,
 *                      `workTurnFactorPct`, `workTurnAskDueDays`,
 *                      `workTurnAutoPropagate`.
 *
 * WHAT IS NEVER STORED. A pool, a turn, a fair share, a verdict, a "carries too
 * much" flag, a next-in-turn name. Every one is derived on read from the acts,
 * the delegations, the ADR-0178 attributions and the live matrix graph, so a
 * printed figure cannot drift from its record. The delegation row itself is NOT
 * changed.
 *
 * FAIL CLOSED. A malformed act is DROPPED with a counted warning — never
 * repaired into a classification nobody made. An act whose person differs from
 * the delegation's owner is dropped, not re-pointed. An act naming a kind that
 * is not in the closed list is dropped, not defaulted.
 */

import {
  WORK_TURN_BOUNDS,
  WORK_TURN_DEFAULTS,
  WORK_TURN_KINDS,
  WORK_TURN_LIMITS,
  WORK_TURN_RULE_ID,
  WORK_TURN_SETTING_KEYS,
} from './workTurnRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function normalizeWorkTurnSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = WORK_TURN_SETTING_KEYS;
  return {
    [K.windowDays]: boundedInt(src[K.windowDays], WORK_TURN_BOUNDS.windowDays, WORK_TURN_DEFAULTS.windowDays),
    [K.minAsks]: boundedInt(src[K.minAsks], WORK_TURN_BOUNDS.minAsks, WORK_TURN_DEFAULTS.minAsks),
    [K.factorPct]: boundedInt(src[K.factorPct], WORK_TURN_BOUNDS.factorPct, WORK_TURN_DEFAULTS.factorPct),
    [K.askDueDays]: boundedInt(src[K.askDueDays], WORK_TURN_BOUNDS.askDueDays, WORK_TURN_DEFAULTS.askDueDays),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/**
 * The effective act per ask: the LATEST by timestamp; on an exact tie the
 * later-appended act wins. Returns `Map<delegationId, { act, index, actN }>`.
 */
export function effectiveWorkTurnActs(acts) {
  const out = new Map();
  (Array.isArray(acts) ? acts : []).forEach((act, index) => {
    if (!act || !act.delegationId) return;
    const prev = out.get(act.delegationId);
    if (!prev) { out.set(act.delegationId, { act, index, actN: 1 }); return; }
    prev.actN += 1;
    if (String(act.at) >= String(prev.act.at)) { prev.act = act; prev.index = index; }
  });
  return out;
}

/**
 * Bound the ledger WITHOUT ever dropping an effective classification.
 * Superseded acts are evicted oldest-first. If every remaining act is the
 * effective one for its ask, the ledger is returned OVER the cap rather than
 * silently un-classifying work somebody classified.
 */
export function compactWorkTurnActs(acts, cap = WORK_TURN_LIMITS.acts) {
  const list = Array.isArray(acts) ? acts : [];
  if (list.length <= cap) return list;
  const keep = new Set([...effectiveWorkTurnActs(list).values()].map((entry) => entry.index));
  let excess = list.length - cap;
  const out = [];
  list.forEach((act, index) => {
    if (excess > 0 && !keep.has(index)) { excess -= 1; return; }
    out.push(act);
  });
  return out;
}

/**
 * @param raw       stored acts
 * @param state     the state being normalized (delegations already normalized)
 * @param warnings  load warnings (mutated)
 */
export function normalizeWorkTurnActs(raw, state = {}, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const owners = new Map((state.delegations || []).filter(Boolean).map((d) => [d.id, d.personId]));
  const out = [];
  const seen = new Set();
  let malformed = 0;
  let orphaned = 0;
  let mismatched = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { malformed += 1; continue; }
    const id = str(item.id);
    const delegationId = str(item.delegationId);
    const personId = str(item.personId);
    const kind = WORK_TURN_KINDS.includes(item.kind) ? item.kind : null;
    const byId = str(item.byId) || null;
    const at = isoOrNull(item.at);
    if (!id || id.length > WORK_TURN_LIMITS.idMax || seen.has(id)
      || !delegationId || delegationId.length > 2 * WORK_TURN_LIMITS.idMax
      || !personId || personId.length > WORK_TURN_LIMITS.idMax
      || !kind || !at || (byId && byId.length > WORK_TURN_LIMITS.idMax)) { malformed += 1; continue; }
    if (!owners.has(delegationId)) { orphaned += 1; continue; }
    if (owners.get(delegationId) !== personId) { mismatched += 1; continue; }
    seen.add(id);
    out.push({ id, delegationId, personId, kind, byId, at });
  }
  if (malformed) warnings.push(`Work turns: dropped ${malformed} malformed classification act(s); no kind was repaired or guessed`);
  if (orphaned) warnings.push(`Work turns: dropped ${orphaned} classification act(s) whose ask no longer exists`);
  if (mismatched) warnings.push(`Work turns: dropped ${mismatched} classification act(s) naming a person other than the ask’s owner; none was re-pointed`);
  return compactWorkTurnActs(out);
}

/**
 * Rule-authored work-turn asks carry three independent, structured artefacts:
 * an ask marker, the rule's immutable support sentence on its delegation, and
 * an `issues-obligation` link written by that same rule. A marker alone used
 * to be enough for ADR-0196. That was merely a pointer: a hand-authored marker
 * could make an ordinary delegation look like a rotation ask.
 *
 * `ruleId` was added to markers after ADR-0181 shipped. Old markers have no
 * such field, so a legacy ask is accepted only where the other two historical
 * artefacts corroborate it. This preserves a genuine recorded transfer without
 * treating marker shape alone as rule provenance. There is no attempt to infer
 * a rule from a title, owner, reporting line, or current work-turn reading.
 */
const RULE_SUPPORT_PREFIX = `Issued by ${WORK_TURN_RULE_ID};`;
const ASK_MARKER_STATES = new Set(['pool', 'stack']);

function markerHasAskShape(marker) {
  return Boolean(marker
    && marker.kind === 'ask'
    && typeof marker.key === 'string' && marker.key.startsWith('ask|')
    && typeof marker.subject === 'string' && marker.subject.startsWith(`${marker.state}|`)
    && ASK_MARKER_STATES.has(marker.state)
    && typeof marker.taskId === 'string' && marker.taskId);
}

/** Rule-owned task evidence that remains after a bounded old marker is evicted. */
export function workTurnRuleTaskEvidence(state = {}, taskId) {
  const task = (state.delegations || []).find((row) => row?.id === taskId) || null;
  const support = typeof task?.support === 'string' && task.support.startsWith(RULE_SUPPORT_PREFIX);
  const link = (state.links || []).some((row) => row
    && row.targetType === 'delegation'
    && row.targetId === taskId
    && row.relation === 'issues-obligation'
    && row.ruleId === WORK_TURN_RULE_ID);
  return { ok: Boolean(task && support && link), task, support, link };
}

/**
 * Strong semantic provenance for one rotation ask. New rule markers must carry
 * the explicit rule id. Legacy marker records can retain already accepted
 * transfers only when the task's support and typed rule link independently
 * attest to the same rule. The returned proof is deliberately descriptive so
 * callers can keep the compatibility boundary visible rather than silently
 * treating old marker-only data as trustworthy.
 */
export function workTurnAskProvenance(state = {}, taskId) {
  const taskEvidence = workTurnRuleTaskEvidence(state, taskId);
  const marker = (state.workTurnMarkers || []).find((row) => row?.taskId === taskId && markerHasAskShape(row)) || null;
  if (!marker || !taskEvidence.ok) {
    return {
      ok: false,
      provenance: 'unproven',
      marker,
      task: taskEvidence.task,
      reason: !marker
        ? 'No structured RULE-NPW-01 ask marker remains for this delegation.'
        : 'The marker is not corroborated by the rule-authored task support and typed obligation link.',
    };
  }
  if (marker.ruleId === WORK_TURN_RULE_ID) {
    return { ok: true, provenance: 'explicit', marker, task: taskEvidence.task };
  }
  if (marker.ruleId === null || marker.ruleId === undefined || marker.ruleId === '') {
    return { ok: true, provenance: 'legacy-attested', marker, task: taskEvidence.task };
  }
  return {
    ok: false,
    provenance: 'unproven',
    marker,
    task: taskEvidence.task,
    reason: 'The work-turn marker names a different or unsupported rule identifier.',
  };
}

export function normalizeWorkTurnMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 320);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    const subject = str(item.subject).slice(0, 160);
    const taskId = str(item.taskId).slice(0, 80) || null;
    const state = str(item.state).slice(0, 24);
    // A marker must retain the shape the rule writes. This is not proof of
    // provenance by itself (see `workTurnAskProvenance`), but it prevents a
    // loose marker from becoming a plausible rule pointer on reload.
    if (kind === 'ask' && (!key.startsWith('ask|') || !taskId || !ASK_MARKER_STATES.has(state) || !subject.startsWith(`${state}|`))) continue;
    if (kind === 'observation' && (!key.startsWith('obs|') || taskId !== null || !subject)) continue;
    const rawRuleId = str(item.ruleId).slice(0, 40);
    // This collection belongs only to RULE-NPW-01. Preserve pre-field markers
    // as explicit legacy values, but drop a marker that claims another rule.
    if (rawRuleId && rawRuleId !== WORK_TURN_RULE_ID) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      subject,
      taskId,
      state,
      ruleId: rawRuleId || null,
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = WORK_TURN_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}
