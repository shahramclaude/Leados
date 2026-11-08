/**
 * app/core/domain/talkingPointPolicy.js — ONE declared retention policy for a
 * person's 1:1 waiting list (`talkingPoints`).
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * Every one of the twenty-odd rules that write a 1:1 prompt appends to the end
 * of the array and bounds its own write with `.slice(-30)` — newest wins, thirty
 * is the writer's ceiling. `normalizeTalkingPoints` (schema.js) then kept the
 * FIRST twelve and stopped. Two independent, contradicted caps, resolved in
 * opposite directions:
 *
 *   in memory after a rule writes (queue already full at 12)
 *     ['Personal topic 1' … 'Personal topic 12', 'Case support (…)[RULE-COACH-01:case-1]']
 *   after the next reload / import — measured, not supposed
 *     ['Personal topic 1' … 'Personal topic 12']   ← the prompt the rule just
 *                                                    wrote is GONE
 *
 * A queue that holds 30 lines in memory and 12 after a reload is a silent
 * write-then-delete: the fresh prompt — the one the engine raised today, the
 * one a lead is most likely to act on — was the first casualty, and nothing said
 * so. The 1:1 agenda ledger (ADR-0113) then described the wall backwards
 * ("truncates from the OLDEST end", "the oldest line is the one the cap will
 * drop") and its eviction badge pointed at row 0, which under the real
 * behaviour is the line that always survived.
 *
 * THE POLICY (declared here, applied everywhere)
 * ---------------------------------------------
 * The cap is a product decision, not an accident: a forty-minute 1:1 cannot
 * carry thirty topics, and an unbounded list is a list nobody reads. Twelve is
 * the declared cap. What was never declared is WHICH lines survive it. This
 * module declares that, once:
 *
 *   1. A line the PERSON raised (no engine marker) is never evicted while any
 *      capacity remains. Their words are the one thing on the list the leader
 *      did not author, and burying them is the exact failure the agenda ledger
 *      exists to expose.
 *   2. After that, engine-authored prompts survive NEWEST FIRST. A prompt a
 *      rule wrote today outranks one it wrote three weeks ago; the oldest
 *      engine prompt is the one that goes.
 *   3. Survivors keep their original relative order. The policy decides
 *      membership, never presentation — a queue that reshuffles on reload would
 *      be its own bug.
 *   4. Anything dropped is RETURNED, never discarded silently, so the caller
 *      can print it. "No silent failures" is a technical baseline in
 *      NORTH_STAR.md, and a truncated queue is a failure whether or not the
 *      caller looks.
 *   5. Writes go through ONE door (`appendTalkingPoint`, ADR-0138). ADR-0134
 *      wired the storage layer and the ledger to this policy but left every
 *      rule opening its own door with `.slice(-30)`; those local caps could
 *      delete a topic the person raised, and the refusal that should have been
 *      printed was replaced by a silent deletion. A writer that cannot honour
 *      the policy now refuses, changes nothing, and reports.
 *
 * Pure module: no storage, no clock, no DOM. The engine marker grammar is
 * imported from the agenda ledger's registry so the two cannot drift.
 */
import { AGENDA_LIMITS } from './agendaProvenanceRegistry.js';

/**
 * The declared waiting-list cap. `AGENDA_LIMITS.queueCap` is the ledger's view
 * of this same number; it is read from here so the storage layer, the desk
 * reading, the badge and the printed copy can never disagree again.
 */
export const TALKING_QUEUE_CAP = AGENDA_LIMITS.queueCap;

/** Markers and `; ref …)` tails identify engine authorship (registry grammar). */
const MARKER = /\[[A-Z][A-Z0-9-]{1,24}(?::[^\]]+)?\]/;
const REF_TAIL = /;\s*ref [a-z0-9-]+\)/i;

/** True when a line was written by a rule rather than by the person/leader. */
export function isEngineAuthored(line) {
  const text = typeof line === 'string' ? line : '';
  return MARKER.test(text) || REF_TAIL.test(text);
}

/**
 * Which surviving indices this policy keeps, given a list and a cap.
 * Shared by the storage normalizer and the ledger's eviction reading so a
 * printed "next to drop" is the line the reload will actually take.
 */
function survivorIndices(list, cap) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP;
  const personIdx = [];
  const engineIdx = [];
  list.forEach((line, index) => {
    if (typeof line !== 'string') return;
    (isEngineAuthored(line) ? engineIdx : personIdx).push(index);
  });
  const keep = new Set();
  // 1. Their own words claim capacity first.
  for (const index of personIdx.slice(0, limit)) keep.add(index);
  // 2. Engine prompts claim what is left, newest first.
  let room = limit - keep.size;
  for (let k = engineIdx.length - 1; k >= 0 && room > 0; k -= 1) {
    keep.add(engineIdx[k]);
    room -= 1;
  }
  return keep;
}

/**
 * Apply the policy to a de-duplicated list.
 * Returns survivors in their ORIGINAL relative order plus exactly what was
 * dropped, split by authorship so a caller can print an honest sentence.
 */
export function retainQueue(lines, cap = TALKING_QUEUE_CAP) {
  const list = Array.isArray(lines) ? lines : [];
  const keep = survivorIndices(list, cap);
  const survivors = [];
  const dropped = [];
  list.forEach((line, index) => {
    if (keep.has(index)) survivors.push(line);
    else dropped.push({ text: line, index, engine: isEngineAuthored(line) });
  });
  return {
    cap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP,
    keep: survivors,
    dropped,
    droppedN: dropped.length,
    droppedEngineN: dropped.filter((d) => d.engine).length,
    droppedPersonN: dropped.filter((d) => !d.engine).length,
    atCap: list.length >= (Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP),
  };
}

/**
 * THE SHARED WRITER — the one door a rule may use to add a 1:1 prompt.
 *
 * Why this exists. ADR-0134 declared the policy and wired the STORAGE layer and
 * the LEDGER to it, but every rule that writes a prompt still opened its own
 * door: `person.talkingPoints = [...pts, prompt].slice(-30)`. Those writers are
 * the policy's contract, and they broke it. `.slice(-30)` is a blind newest-wins
 * cut at a number no reader has ever seen, and because a person's own topics
 * sit at the FRONT of the list they are the first thing it deletes:
 *
 *   in-memory draft after a session (the writers' own 30-line ceiling)
 *     ['My mother is ill and I need to talk about leave',   ← theirs
 *      'I want a clearer promotion path',                   ← theirs
 *      …, 27 older engine prompts]
 *   after ONE engine write (`.slice(-30)`)
 *     ['I want a clearer promotion path', …, 27 older prompts, new prompt]
 *      ← their first topic is GONE, and no warning was raised
 *
 * Reproduced against the shipped `loadRule` before this function existed: the
 * write returned success, the findings list recorded a queued prompt, and the
 * leader's queue silently lost the single most important line on it.
 *
 * The writer therefore applies the DECLARED policy at write time instead of
 * inventing a second cap, and it RETURNS what happened so a rule can refuse
 * honestly rather than claiming a write that did not land:
 *
 *   { points,      the array to store (unchanged unless appended)
 *     appended,    true only when the new line is in `points`
 *     refused,     true when the queue has no room the policy will give up
 *     duplicate,   true when the line was already on the list
 *     reason,      'empty' | 'duplicate' | 'queue-held-by-person-raised' | null
 *     displaced,   lines the write removed to make room (usually one engine prompt)
 *     cap, atCap }
 *
 * A refused write is a true no-op: nothing is added AND nothing is removed. The
 * alternative — accepting the prompt and letting the reload take a topic — is
 * the defect this closes.
 */
export function appendTalkingPoint(lines, line, cap = TALKING_QUEUE_CAP) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP;
  const list = Array.isArray(lines) ? lines : [];
  const text = typeof line === 'string' ? line.trim() : '';
  const base = {
    points: list,
    appended: false,
    refused: false,
    duplicate: false,
    reason: null,
    cap: limit,
    atCap: list.length >= limit,
    displaced: [],
    displacedN: 0,
    displacedEngineN: 0,
    displacedPersonN: 0,
  };
  if (!text) return { ...base, reason: 'empty' };
  const key = text.toLowerCase();
  if (list.some((existing) => typeof existing === 'string' && existing.trim().toLowerCase() === key)) {
    return { ...base, duplicate: true, reason: 'duplicate' };
  }
  const candidate = [...list, text];
  const keep = survivorIndices(candidate, limit);
  if (!keep.has(candidate.length - 1)) {
    // Every slot is claimed by a topic the person raised. Their words outrank an
    // engine prompt by the declared policy, so the prompt is refused — and the
    // caller is expected to print that, not to bury it.
    return { ...base, refused: true, reason: 'queue-held-by-person-raised', atCap: true };
  }
  const points = candidate.filter((_, index) => keep.has(index));
  const displaced = [];
  candidate.forEach((existing, index) => {
    if (index === candidate.length - 1) return;
    if (!keep.has(index)) displaced.push({ text: existing, index, engine: isEngineAuthored(existing) });
  });
  return {
    ...base,
    points,
    appended: true,
    atCap: points.length >= limit,
    displaced,
    displacedN: displaced.length,
    displacedEngineN: displaced.filter((d) => d.engine).length,
    displacedPersonN: displaced.filter((d) => !d.engine).length,
  };
}

/**
 * The refusal channel. A refused write must be REPORTED; but a rule re-fires on
 * every transaction while its condition holds, so an unbounded stream of
 * identical lines would be its own failure mode. This records at most one line
 * per person per transaction and at most `QUEUE_REFUSAL_WARNING_CAP` named
 * people, with the remainder counted in one printed line — the same bounded,
 * honest-remainder convention the rest of the workspace uses.
 *
 * State is derived entirely from the warnings array the store already shares
 * across a transaction, so nothing is stored and nothing drifts.
 */
export const QUEUE_REFUSAL_WARNING_CAP = 3;

const REFUSAL_STEM = '1:1 waiting list:';
const NAMED_REFUSAL = /^1:1 waiting list: .+ — /;
const REMAINDER_REFUSAL = /^1:1 waiting list: (\d+) further (?:person|people)/;

export function recordQueueRefusal(warnings, personLabel, cap = TALKING_QUEUE_CAP) {
  if (!Array.isArray(warnings)) return false;
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP;
  const name = typeof personLabel === 'string' && personLabel.trim()
    ? personLabel.trim().slice(0, 60)
    : 'A person';
  const mine = `${REFUSAL_STEM} ${name} —`;
  // One line per person per transaction, however many rules tried.
  if (warnings.some((w) => typeof w === 'string' && w.startsWith(mine))) return false;
  const named = warnings.filter((w) => typeof w === 'string' && NAMED_REFUSAL.test(w)).length;
  const remainderAt = warnings.findIndex((w) => typeof w === 'string' && REMAINDER_REFUSAL.test(w));
  if (named >= QUEUE_REFUSAL_WARNING_CAP) {
    const seen = remainderAt >= 0 ? Number(warnings[remainderAt].match(REMAINDER_REFUSAL)[1]) : 0;
    const line = `${REFUSAL_STEM} ${seen + 1} further ${seen + 1 === 1 ? 'person' : 'people'} also had a prompt refused this pass, because their list is filled by topics they raised.`;
    if (remainderAt >= 0) warnings[remainderAt] = line;
    else warnings.push(line);
    return true;
  }
  warnings.push(`${mine} their list is full (${limit} lines) of topics they raised, so an engine prompt raised in this pass was not queued. Nothing was removed — resolving one of their topics frees the next slot.`);
  return true;
}

/**
 * The index of the line that would be displaced by ONE more engine prompt —
 * the realistic arrival, because rules are what fill this list. Derived by
 * simulating the arrival and diffing survivors, so the answer is the policy's
 * own arithmetic rather than an assumption about which end is truncated.
 *
 * `null` when nothing would move (the list is under the cap).
 */
export function nextEvictedIndex(lines, cap = TALKING_QUEUE_CAP) {
  const list = Array.isArray(lines) ? lines : [];
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP;
  if (list.length < limit) return null;
  // A sentinel that cannot collide with a real line and is unambiguously
  // engine-authored, so the simulation exercises the rule path exactly.
  const sentinel = '[RULE-QUEUE-SENTINEL:x]';
  const before = survivorIndices(list, limit);
  const after = survivorIndices([...list, sentinel], limit);
  const displaced = [];
  list.forEach((_, index) => {
    // The sentinel shifts nothing: it is appended last, so real indices are stable.
    if (before.has(index) && !after.has(index)) displaced.push(index);
  });
  return displaced.length ? displaced[0] : null;
}

/**
 * The one printed sentence a leader reads. Says what the cap is, which rule
 * governs survival, and names the line at risk — or says nothing when the list
 * is under the cap and nothing is at risk.
 */
export function queueCapSentence(lines, cap = TALKING_QUEUE_CAP) {
  const list = Array.isArray(lines) ? lines : [];
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : TALKING_QUEUE_CAP;
  if (list.length < limit) return null;
  const atRisk = nextEvictedIndex(list, limit);
  const head = `This list is at its ${limit}-prompt cap.`;
  const rule = 'Prompts the person raised are kept first and engine prompts survive newest first, so the next rule that writes here removes the OLDEST engine prompt — not the person’s own topic.';
  if (atRisk === null) {
    // Every line at the cap is the person's own. A new engine prompt would be
    // refused rather than displacing one of theirs — say so plainly instead of
    // naming a line that is not at risk.
    return `${head} ${rule} Every line on it right now is theirs, so an engine prompt arriving next is refused outright rather than displacing one of their topics — and the refusal is reported, not swallowed.`;
  }
  const name = String(list[atRisk] || '').slice(0, 80);
  return `${head} ${rule} The line at risk is “${name}”.`;
}
