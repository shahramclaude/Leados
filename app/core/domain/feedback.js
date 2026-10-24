/**
 * app/core/domain/feedback.js — SBI (Situation · Behaviour · Impact) quality
 * and feedback balance.
 *
 * Why this exists: unstructured feedback ("be more proactive") is unusable by
 * the person receiving it. SBI is the standard structure (Center for Creative
 * Leadership) because it separates the observable event from the interpretation
 * and forces the giver to state the consequence. The validator here is a
 * *coaching aid*, not a gate — it warns, it never blocks a save, because a
 * half-remembered note is still better than no feedback at all.
 */

import { daysBetween, daysSince, isOverdue, latestByDate, mean, round } from '../time.js';

const VAGUE_PATTERNS = [
  { re: /\b(always|never|constantly)\b/i, tip: '“always/never” generalises one moment into a character trait — describe the specific occasion.' },
  { re: /\b(attitude|proactive|proactive|leadership presence|not a team player)\b/i, tip: 'That reads as a judgement about the person. Name the behaviour someone could have filmed.' },
  { re: /\b(lazy|sloppy|careless|difficult|negative)\b/i, tip: 'Character labels make people defensive. Describe what happened instead.' },
  { re: /\b(good job|great work|well done|keep it up)\b/i, tip: 'Praise without specifics cannot be repeated. Say what the person actually did.' },
  { re: /\b(everyone|the team|people)\s+(thinks|feels|says)\b/i, tip: 'Speaking for unnamed others is neither checkable nor fair.' },
];

const VAGUE_TIPS = VAGUE_PATTERNS;

/**
 * Validate an SBI note.
 * @returns {{
 *   ok:boolean, complete:boolean, quality:number, fieldIssues:Record<string,string[]>,
 *   tips:string[], missing:string[]
 * }}
 */
export function validateSBI({ situation = '', behavior = '', impact = '' } = {}) {
  const fields = {
    situation: (situation || '').trim(),
    behavior: (behavior || '').trim(),
    impact: (impact || '').trim(),
  };
  const fieldIssues = { situation: [], behavior: [], impact: [] };
  const tips = [];

  if (fields.situation.length > 0 && fields.situation.length < 12) {
    fieldIssues.situation.push('Add enough context that the moment is identifiable (where, when, who was there).');
  }
  if (fields.behavior.length > 0 && fields.behavior.length < 15) {
    fieldIssues.behavior.push('Describe the observable action, not the impression it left.');
  }
  if (fields.impact.length > 0 && fields.impact.length < 12) {
    fieldIssues.impact.push('Say what changed as a result — for the work, the team, or you.');
  }

  for (const [name, value] of Object.entries(fields)) {
    if (!value) continue;
    for (const pattern of VAGUE_TIPS) {
      if (pattern.re.test(value)) {
        const entry = `${name}: ${pattern.tip}`;
        if (!tips.includes(entry)) tips.push(entry);
      }
    }
  }

  const missing = Object.entries(fields)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const complete = missing.length === 0;

  // Quality: 1 point per present field, +1 when all three are specific enough.
  const specific = fields.situation.length >= 20 && fields.behavior.length >= 25 && fields.impact.length >= 15;
  let quality = 3 - missing.length;
  if (complete && specific && tips.length === 0) quality = 4;
  else if (complete && tips.length > 0) quality = Math.min(quality, 3);
  quality = Math.max(0, quality);

  return { ok: complete, complete, quality, fieldIssues, tips, missing };
}

export const QUALITY_LABELS = {
  0: 'Empty',
  1: 'Barely usable',
  2: 'Needs work',
  3: 'Solid',
  4: 'Specific and repeatable',
};

export function feedbackFor(state, personId, { direction = null } = {}) {
  return state.feedback.filter((f) => f.personId === personId && (!direction || f.direction === direction));
}

/**
 * Per-person feedback statistics and the balance verdict.
 * Category names follow Kim Scott's Radical Candor: praise-only is "ruinous
 * empathy" (kind but not clear), constructive-only is "obnoxious aggression"
 * (clear but not kind) when no praise is ever recorded.
 */
export function personFeedbackStats(state, personId, now, settings) {
  const given = feedbackFor(state, personId, { direction: 'given' });
  const received = feedbackFor(state, personId, { direction: 'received' });
  const last = latestByDate(given);
  const lastReceived = latestByDate(received);
  const target = settings?.feedbackTargetDays ?? 21;
  const daysSinceGiven = last ? daysSince(last.date, now) : null;
  const inWindow = given.filter((f) => (daysSince(f.date, now) ?? Infinity) <= 90);
  const praise = inWindow.filter((f) => f.kind === 'praise').length;
  const constructive = inWindow.filter((f) => f.kind === 'constructive').length;
  const total = praise + constructive;
  const praiseRatio = total ? praise / total : null;

  let balance = 'no-feedback';
  if (total > 0) {
    if (total >= 3 && constructive === 0) balance = 'praise-only';
    else if (total >= 3 && praise === 0) balance = 'constructive-only';
    else balance = 'balanced';
  }

  return {
    givenCount: given.length,
    receivedCount: received.length,
    praise,
    constructive,
    total90: total,
    praiseRatio,
    lastGivenDate: last ? last.date : null,
    lastReceivedDate: lastReceived ? lastReceived.date : null,
    daysSinceGiven,
    isStale: daysSinceGiven === null || daysSinceGiven > target,
    balance,
    balanceLabel: BALANCE_LABELS[balance],
  };
}

export const BALANCE_LABELS = {
  'no-feedback': 'No feedback on record',
  'praise-only': 'Praise only — clarity risk',
  'constructive-only': 'Criticism only — trust risk',
  balanced: 'Both kinds present',
};

/** Feedback items with a follow-up date that has arrived and no completion. */
export function followUpsDue(state, now) {
  return state.feedback
    .filter((f) => f.followUpOn && !f.followUpDone && isOverdue(f.followUpOn, now))
    .map((f) => ({ ...f, overdueDays: Math.max(0, daysSince(f.followUpOn, now) || 0) }))
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

/** Team-level distribution, used by the Feedback view header. */
export function teamFeedbackSummary(state, now, settings) {
  const people = state.people.filter((p) => p.status !== 'archived');
  const stats = people.map((p) => ({ person: p, ...personFeedbackStats(state, p.id, now, settings) }));
  const stale = stats.filter((s) => s.isStale);
  const inWindow = state.feedback.filter((f) => f.direction === 'given' && (daysSince(f.date, now) ?? Infinity) <= 90);
  return {
    people: stats,
    stale,
    praise: inWindow.filter((f) => f.kind === 'praise').length,
    constructive: inWindow.filter((f) => f.kind === 'constructive').length,
    staleCount: stale.length,
    never: stats.filter((s) => s.givenCount === 0),
  };
}

/** Median days between feedback events for a person — cadence realism check. */
export function medianGapDays(state, personId) {
  const dates = feedbackFor(state, personId, { direction: 'given' })
    .map((f) => f.date)
    .sort();
  if (dates.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < dates.length; i += 1) gaps.push(daysBetween(dates[i - 1], dates[i]));
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : round((gaps[mid - 1] + gaps[mid]) / 2, 1);
}

export { mean };
