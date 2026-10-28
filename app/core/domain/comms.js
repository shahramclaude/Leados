/**
 * app/core/domain/comms.js — Stakeholder Comms Outbox (RULE-COMMS-01..04).
 *
 * Session 50. An Operational Case already schedules stakeholder check-ins
 * (RULE-STAKE-01) but never produces the message itself, so the leader still
 * re-types the same facts for every stakeholder. This module turns each
 * committed case event into a set of *drafts*, one per key stakeholder, built
 * only from facts recorded on the case. Nothing is ever sent by the app: a
 * draft waits for a human to approve it, and "sent" is recorded only when the
 * leader marks it sent or logs a stakeholder touch.
 *
 * Named techniques (Section 0.2 of the product doctrine):
 *  - Mendelow (1981) power × interest audience selection: only key players
 *    (manage-closely / keep-satisfied) and opposing stakeholders (blocker /
 *    skeptical, whatever their quadrant) receive a brief. Keep-informed and
 *    monitor stakeholders stay on the digest cadence to avoid message spam.
 *  - Closed-loop incident communication (ITIL 4 service-management practice):
 *    a stakeholder who was actually briefed is owed a closure note. A
 *    stakeholder who was never briefed is not sent one.
 *  - Content-addressed idempotence: each draft carries the canonical
 *    "basis" of the facts it was written from. An unchanged basis is a no-op;
 *    a changed basis supersedes the old draft and keeps it in the history.
 *    Re-approval is required whenever an approved draft's basis changes, so an
 *    approved message cannot silently go out stale.
 *  - Explicit gaps, not invented facts: a missing owner, review date or
 *    mitigation is rendered as "[to confirm — …]" and counted in a readiness
 *    score. Readiness below 100% requires an explicit acknowledgement before
 *    approval. A missing risk rating is never back-filled with the FMEA default
 *    of 5.
 *  - Exposure-aware drafting: a financial exposure is quoted only when a PERT
 *    estimate exists; otherwise the draft says it has not been estimated.
 *
 * Pure module: no DOM, storage, network or global clock. Callers pass `now`,
 * an id factory and a logger. Rules receive the same context shape as every
 * other post-commit rule (ADR-0008).
 */

import { dayKey } from '../time.js';
import {
  CASE_KIND_LABELS,
  CASE_STATUS_LABELS,
  classifyMendelowStakeholder,
  computeFmea,
  computePertImpact,
  isCaseOpen,
} from './cases.js';

export const COMMS_ENGINE_VERSION = 'comms-2026.10-v1';

export const COMMS_RULE_IDS = Object.freeze({
  BRIEF: 'RULE-COMMS-01',
  CLOSURE: 'RULE-COMMS-02',
  WITHDRAW: 'RULE-COMMS-03',
  TOUCH: 'RULE-COMMS-04',
});

export const COMMS_RULES = Object.freeze([
  {
    id: COMMS_RULE_IDS.BRIEF,
    name: 'Stakeholder brief drafts from case facts',
    framework: 'Mendelow (1981) power × interest audience & closed-loop incident communication (ITIL 4)',
    trigger: 'case.created / case.updated / case.reopened',
    targetModule: 'comms',
    description: 'For each key or opposing stakeholder of an open case, drafts a status brief from recorded facts only (rating, owner, mitigation, review date). Unchanged facts are a no-op; changed facts supersede the open draft and keep it in history. Gaps are shown as explicit “to confirm” items with a readiness score.',
  },
  {
    id: COMMS_RULE_IDS.CLOSURE,
    name: 'Closure note owed to briefed stakeholders',
    framework: 'Closed-loop incident communication (ITIL 4) & Reason (1990) learning loop',
    trigger: 'case.resolved',
    targetModule: 'comms',
    description: 'Withdraws unsent briefs when a case resolves. Drafts one closure note for each stakeholder whose brief was actually sent, with the resolution, the systemic guardrail and the residual rating. Stakeholders who were never briefed receive nothing.',
  },
  {
    id: COMMS_RULE_IDS.WITHDRAW,
    name: 'Reopen withdraws the closure note',
    framework: 'Retraction discipline (a message that no longer holds is withdrawn, never left in the outbox)',
    trigger: 'case.reopened',
    targetModule: 'comms',
    description: 'Supersedes any unsent closure note when a case is reopened, then re-runs the brief rule so stakeholders receive a current status rather than a stale “closed” message.',
  },
  {
    id: COMMS_RULE_IDS.TOUCH,
    name: 'Logged stakeholder touch closes the outbox loop',
    framework: 'Single-entry bookkeeping: a fact recorded once is reflected everywhere it applies',
    trigger: 'case.stakeholder.comms',
    targetModule: 'comms',
    description: 'When a stakeholder brief is logged on the case after an outbox draft was written for that stakeholder, marks the draft as sent on the logged date, so the leader never records the same communication twice.',
  },
]);

export const COMMS_PURPOSES = Object.freeze(['brief', 'closure']);
export const COMMS_PURPOSE_LABELS = Object.freeze({
  brief: 'Status brief',
  closure: 'Closure note',
});

export const COMMS_STATUSES = Object.freeze(['draft', 'approved', 'sent', 'superseded', 'dismissed']);
export const COMMS_OPEN_STATUSES = Object.freeze(['draft', 'approved']);
export const COMMS_STATUS_LABELS = Object.freeze({
  draft: 'Awaiting approval',
  approved: 'Approved — not yet sent',
  sent: 'Sent',
  superseded: 'Superseded',
  dismissed: 'Dismissed',
});

/** An approved draft waiting this long without being marked sent is a signal. */
export const COMMS_STALE_APPROVAL_DAYS = 3;
export const COMMS_MAX_SUBJECT = 160;
export const COMMS_MAX_BODY = 4000;
export const COMMS_MAX_CHANNEL = 80;

const AUDIENCE_QUADRANTS = Object.freeze(['manage-closely', 'keep-satisfied']);
const OPPOSING_STANCES = Object.freeze(['blocker', 'skeptical']);

/* ------------------------------------------------------------ helpers */

function clampText(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function firstNameOf(name) {
  const trimmed = clampText(name, 120);
  if (!trimmed || trimmed === 'Unnamed stakeholder') return '';
  return trimmed.split(' ')[0];
}

/** Stable key for a stakeholder embedded on a case (id preferred, name fallback). */
export function stakeholderKeyOf(stakeholder) {
  if (!stakeholder) return '';
  if (stakeholder.id) return `id:${stakeholder.id}`;
  return `name:${clampText(stakeholder.name, 120).toLowerCase()}`;
}

function ensureDrafts(draft) {
  draft.commsDrafts = Array.isArray(draft.commsDrafts) ? draft.commsDrafts : [];
  return draft.commsDrafts;
}

function openDraftsFor(drafts, caseId, key, purpose) {
  return drafts.filter(
    (d) => d && d.caseId === caseId && d.stakeholderKey === key && d.purpose === purpose
      && COMMS_OPEN_STATUSES.includes(d.status),
  );
}

function latestDraftFor(drafts, caseId, key, purpose) {
  const matches = drafts.filter((d) => d && d.caseId === caseId && d.stakeholderKey === key && d.purpose === purpose);
  return matches.length ? matches[matches.length - 1] : null;
}

/**
 * Who should receive a status brief. Keep-informed and monitor stakeholders
 * are deliberately excluded: they remain on the Mendelow digest cadence.
 */
export function commsAudience(caseRecord, todayStr = null) {
  if (!caseRecord || !Array.isArray(caseRecord.stakeholders)) return [];
  const out = [];
  for (const stakeholder of caseRecord.stakeholders) {
    if (!stakeholder) continue;
    const classified = classifyMendelowStakeholder(stakeholder, todayStr);
    const keyPlayer = AUDIENCE_QUADRANTS.includes(classified.quadrant);
    const opposing = OPPOSING_STANCES.includes(classified.stance);
    if (!keyPlayer && !opposing) continue;
    out.push({ stakeholder, classified, key: stakeholderKeyOf(stakeholder) });
  }
  return out;
}

/* ------------------------------------------------------------ facts */

/**
 * Every fact the drafts may use, read from the case and the roster. Absent
 * values are null, never defaulted. Returns the same shape regardless of
 * purpose so the fingerprint and the readiness check see one source of truth.
 */
export function buildCommsFacts(caseRecord, { people = [] } = {}) {
  const rawFmea = caseRecord?.fmea || {};
  const rated = ['severity', 'probability', 'detectability'].every(
    (k) => rawFmea[k] !== null && rawFmea[k] !== undefined && rawFmea[k] !== '' && Number.isFinite(Number(rawFmea[k])),
  );
  const fmea = computeFmea(rawFmea);
  const pert = computePertImpact(caseRecord?.financial || {}, fmea);
  const owner = caseRecord?.ownerId
    ? (people || []).find((p) => p && p.id === caseRecord.ownerId)
    : null;
  const preventive = clampText(caseRecord?.rca?.preventiveAction, 1000) || null;
  const barrier = clampText(caseRecord?.rca?.systemicBarrier, 1000) || null;
  const residualComplete = ['residualSeverity', 'residualProbability', 'residualDetectability'].every(
    (k) => Number.isFinite(Number(caseRecord?.fmea?.[k])) && caseRecord?.fmea?.[k] !== null && caseRecord?.fmea?.[k] !== '',
  );
  const residual = residualComplete
    ? `severity ${caseRecord.fmea.residualSeverity} × probability ${caseRecord.fmea.residualProbability} × detection ${caseRecord.fmea.residualDetectability}`
    : null;
  return {
    title: clampText(caseRecord?.title, 200) || 'Untitled case',
    kind: CASE_KIND_LABELS[caseRecord?.kind] || 'Case',
    statusLabel: CASE_STATUS_LABELS[caseRecord?.status] || 'open',
    rated,
    priority: rated ? fmea.actionPriority : null,
    rpn: rated ? fmea.rpn : null,
    owner: owner ? clampText(owner.name, 120) : null,
    reviewOn: caseRecord?.reviewOn || null,
    preventive,
    barrier,
    exposure: pert.hasFinancialEstimate
      ? `${pert.currency} ${Math.round(pert.cost.expected).toLocaleString('en-US')} expected`
      : null,
    resolvedOn: caseRecord?.resolvedOn || null,
    resolutionNotes: clampText(caseRecord?.resolutionNotes, 1000) || null,
    residual,
  };
}

/* ------------------------------------------------------------ rendering */

function gap(label) {
  return `[to confirm — ${label}]`;
}

/**
 * Deterministic, explainable draft for one stakeholder. Returns the subject,
 * body, the list of unfilled required facts and a readiness fraction.
 */
export function renderCommsDraft({ caseRecord, stakeholder = null, purpose = 'brief', facts, classified = null, stakeholderName = '' }) {
  const name = stakeholder?.name || stakeholderName || 'there';
  const first = firstNameOf(name);
  const greeting = first ? `Hi ${first},` : 'Hello,';
  const stance = classified?.stance || stakeholder?.stance || 'neutral';
  const missing = [];

  if (purpose === 'closure') {
    if (!facts.resolvedOn) missing.push('resolution date');
    if (!facts.resolutionNotes || facts.resolutionNotes.length < 5) missing.push('what resolved it');
    if (!facts.barrier) missing.push('systemic guardrail');
    const subject = clampText(`Closed: ${facts.title}`, COMMS_MAX_SUBJECT);
    const body = [
      greeting,
      '',
      `The case “${facts.title}” was resolved on ${facts.resolvedOn || gap('resolution date not recorded')}.`,
      `What resolved it: ${facts.resolutionNotes || gap('resolution not recorded')}`,
      `Guardrail now in place: ${facts.barrier || gap('no systemic guardrail recorded')}`,
      `Residual rating (severity × probability × detection): ${facts.residual || 'not rated after resolution'}`,
      '',
      'Thank you for your patience while this was worked. Tell me if you see anything that still needs attention.',
    ].join('\n');
    return finish({ subject, body, missing, total: 3 });
  }

  // Status brief
  if (!facts.rated) missing.push('risk rating');
  if (!facts.owner) missing.push('owner');
  if (!facts.preventive) missing.push('preventive action');
  if (!facts.reviewOn) missing.push('review date');

  let opener;
  let ask;
  if (OPPOSING_STANCES.includes(stance)) {
    opener = 'Before anything is decided on this, I want to share the facts as they stand and hear your concerns directly.';
    ask = 'What would you need to see before you are comfortable with the next step?';
  } else if (stance === 'champion' || stance === 'supportive') {
    opener = 'A short update on where this stands, and where your support would help most.';
    ask = facts.preventive
      ? 'Your support for the mitigation above would help us move on it.'
      : 'Your view on the next step would help us shape it.';
  } else {
    opener = 'A short status update on where this stands.';
    ask = 'Let me know if anything here changes your picture.';
  }

  const subject = OPPOSING_STANCES.includes(stance)
    ? clampText(`Input needed: ${facts.title}`, COMMS_MAX_SUBJECT)
    : clampText(`Update: ${facts.title}`, COMMS_MAX_SUBJECT);

  const ratingLine = facts.rated
    ? `Risk priority ${facts.priority} (FMEA RPN ${facts.rpn}).`
    : gap('risk not yet rated');
  const lines = [
    greeting,
    '',
    opener,
    '',
    `Where it stands: “${facts.title}” is ${facts.statusLabel.toLowerCase()}. ${ratingLine}`,
    `Owner: ${facts.owner || gap('no owner assigned')}`,
    `Mitigation: ${facts.preventive || gap('no preventive action recorded yet')}`,
    `Financial exposure: ${facts.exposure || 'not yet estimated'}`,
  ];
  if (clampText(stakeholder?.keyMessage, 600)) {
    lines.push(`Last time we aligned on: ${clampText(stakeholder.keyMessage, 600)}`);
  }
  lines.push(`Next checkpoint: ${facts.reviewOn || gap('no review date set')}`);
  lines.push('', ask, 'I will confirm the outcome at the next checkpoint.');
  return finish({ subject, body: lines.join('\n'), missing, total: 4 });
}

function finish({ subject, body, missing, total }) {
  // Readiness is recorded/required facts, not a model confidence: the leader
  // can see exactly how much of the message is sourced from the case.
  const unfilled = missing.length;
  return {
    subject: clampText(subject, COMMS_MAX_SUBJECT),
    body: String(body).slice(0, COMMS_MAX_BODY),
    missing,
    readiness: total > 0 ? Math.round(((total - unfilled) / total) * 100) / 100 : 1,
    unfilled,
  };
}

/* ------------------------------------------------------------ fingerprints */

/**
 * Canonical basis of a brief: only facts that change what the stakeholder
 * should be told. Free text is clipped so a long edit cannot make an
 * otherwise-identical brief look new.
 */
export function briefBasis(caseRecord, stakeholderKey, stakeholderName, classified, facts) {
  return JSON.stringify({
    v: 1,
    p: 'brief',
    c: caseRecord.id,
    s: stakeholderKey,
    n: stakeholderName,
    t: facts.title,
    k: caseRecord.kind || '',
    st: caseRecord.status || '',
    r: facts.rated ? [facts.priority, facts.rpn] : null,
    o: facts.owner,
    rv: facts.reviewOn,
    pa: facts.preventive ? facts.preventive.slice(0, 300) : null,
    b: facts.barrier ? facts.barrier.slice(0, 300) : null,
    x: facts.exposure,
    stn: classified ? classified.stance : null,
    q: classified ? classified.quadrant : null,
  });
}

export function closureBasis(caseRecord, stakeholderKey, stakeholderName, facts) {
  return JSON.stringify({
    v: 1,
    p: 'closure',
    c: caseRecord.id,
    s: stakeholderKey,
    n: stakeholderName,
    t: facts.title,
    rs: facts.resolvedOn,
    rn: facts.resolutionNotes ? facts.resolutionNotes.slice(0, 300) : null,
    b: facts.barrier ? facts.barrier.slice(0, 300) : null,
    res: facts.residual,
  });
}

/* ------------------------------------------------------------ drafting */

function summarizeChange(prev, next) {
  if (!prev) return 'first draft';
  try {
    const a = JSON.parse(prev.fingerprint);
    const b = JSON.parse(next);
    const changed = Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    const LABELS = { t: 'title', st: 'status', r: 'risk rating', o: 'owner', rv: 'review date', pa: 'mitigation', b: 'guardrail', x: 'exposure', stn: 'stance', q: 'quadrant', rs: 'resolution date', rn: 'resolution', res: 'residual rating' };
    const named = changed.map((k) => LABELS[k] || k).filter(Boolean);
    return named.length ? `facts changed: ${named.join(', ')}` : 'facts changed';
  } catch {
    return 'facts changed';
  }
}

function makeDraft({ caseRecord, key, name, purpose, rendered, basis, idFactory, nowIso, todayStr, supersedesId = null }) {
  return {
    id: idFactory('comms'),
    caseId: caseRecord.id,
    stakeholderKey: key,
    stakeholderName: clampText(name, 120) || 'Unnamed stakeholder',
    purpose,
    status: 'draft',
    subject: rendered.subject,
    body: rendered.body,
    missing: rendered.missing,
    readiness: rendered.readiness,
    fingerprint: basis,
    engineVersion: COMMS_ENGINE_VERSION,
    edited: false,
    createdOn: todayStr,
    createdAt: nowIso,
    approvedOn: null,
    approvedAcknowledgedGaps: 0,
    sentOn: null,
    channel: '',
    supersedesId,
    supersededById: null,
    supersededReason: '',
    supersededOn: null,
    dismissedReason: '',
    updatedAt: nowIso,
  };
}

function supersede(draftRow, reason, { todayStr, nowIso, supersededById = null }) {
  draftRow.status = 'superseded';
  draftRow.supersededReason = clampText(reason, 300);
  draftRow.supersededOn = todayStr;
  draftRow.supersededById = supersededById;
  draftRow.updatedAt = nowIso;
}

function linkDraft(draft, caseRecord, commsId, ruleId, { idFactory, todayStr, nowIso }) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some(
    (l) => l && l.sourceType === 'case' && l.sourceId === caseRecord.id && l.targetType === 'comms'
      && l.targetId === commsId && l.relation === 'communicates',
  );
  if (exists) return false;
  draft.links.push({
    id: idFactory('lnk'),
    sourceType: 'case',
    sourceId: caseRecord.id,
    targetType: 'comms',
    targetId: commsId,
    relation: 'communicates',
    ruleId,
    summary: 'Stakeholder outbox draft',
    createdOn: todayStr,
    createdAt: nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetId, summary, out) {
  const entry = { ruleId, action, targetType: 'comms', targetId, summary: clampText(summary, 300) };
  out.push(entry);
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'comms',
      entityId: targetId,
      summary: `[${ruleId}] ${entry.summary}`.slice(0, 300),
    });
  }
}

/** RULE-COMMS-01: sync brief drafts for an open case (or withdraw them if it is not open). */
function syncBriefs(draft, caseRecord, ctx, out) {
  const drafts = ensureDrafts(draft);
  const { todayStr, nowIso, idFactory, people } = ctx;
  if (!isCaseOpen(caseRecord)) {
    for (const row of drafts.filter((d) => d && d.caseId === caseRecord.id && d.purpose === 'brief' && COMMS_OPEN_STATUSES.includes(d.status))) {
      supersede(row, 'the case is no longer open', { todayStr, nowIso });
      note(ctx, COMMS_RULE_IDS.BRIEF, 'superseded', row.id, `Withdrew brief for ${row.stakeholderName}: the case is no longer open`, out);
    }
    return;
  }

  const audience = commsAudience(caseRecord, todayStr);
  const audienceKeys = new Set(audience.map((a) => a.key));
  for (const row of drafts.filter((d) => d && d.caseId === caseRecord.id && d.purpose === 'brief' && COMMS_OPEN_STATUSES.includes(d.status))) {
    if (!audienceKeys.has(row.stakeholderKey)) {
      supersede(row, 'the stakeholder is no longer in the briefing audience', { todayStr, nowIso });
      note(ctx, COMMS_RULE_IDS.BRIEF, 'superseded', row.id, `Withdrew brief for ${row.stakeholderName}: no longer in the briefing audience`, out);
    }
  }

  const facts = buildCommsFacts(caseRecord, { people });
  for (const { stakeholder, classified, key } of audience) {
    const name = stakeholder.name || 'Unnamed stakeholder';
    const basis = briefBasis(caseRecord, key, name, classified, facts);
    const latest = latestDraftFor(drafts, caseRecord.id, key, 'brief');
    if (latest && latest.fingerprint === basis) continue; // unchanged, sent, or dismissed: no new draft

    const open = openDraftsFor(drafts, caseRecord.id, key, 'brief');
    const rendered = renderCommsDraft({ caseRecord, stakeholder, purpose: 'brief', facts, classified });
    const fresh = makeDraft({
      caseRecord, key, name, purpose: 'brief', rendered, basis, idFactory, nowIso, todayStr,
      supersedesId: open.length ? open[open.length - 1].id : null,
    });
    const reason = summarizeChange(open[open.length - 1] || null, basis);
    for (const row of open) {
      const reapproval = row.status === 'approved' ? ' — re-approval required' : '';
      supersede(row, `${reason}${reapproval}`, { todayStr, nowIso, supersededById: fresh.id });
    }
    drafts.push(fresh);
    linkDraft(draft, caseRecord, fresh.id, COMMS_RULE_IDS.BRIEF, { idFactory, todayStr, nowIso });
    const approvalNote = open.some((o) => o.status === 'approved') ? ' (previous approval withdrawn)' : '';
    note(
      ctx,
      COMMS_RULE_IDS.BRIEF,
      'drafted',
      fresh.id,
      `Drafted brief for ${fresh.stakeholderName} (${rendered.unfilled ? `${rendered.missing.length} fact(s) to confirm` : 'ready'})${approvalNote}`,
      out,
    );
  }
}

/** RULE-COMMS-02: a resolved case withdraws unsent briefs and owes closure to briefed stakeholders. */
function syncClosure(draft, caseRecord, ctx, out) {
  const drafts = ensureDrafts(draft);
  const { todayStr, nowIso, idFactory, people } = ctx;
  syncBriefs(draft, caseRecord, ctx, out); // case is now closed: withdraws open briefs

  const briefed = new Map();
  for (const row of drafts) {
    if (row && row.caseId === caseRecord.id && row.purpose === 'brief' && row.status === 'sent') {
      if (!briefed.has(row.stakeholderKey)) briefed.set(row.stakeholderKey, row);
    }
  }
  if (!briefed.size) return;

  const facts = buildCommsFacts(caseRecord, { people });
  for (const [key, briefRow] of briefed) {
    const stakeholder = (caseRecord.stakeholders || []).find((s) => stakeholderKeyOf(s) === key) || null;
    const name = stakeholder?.name || briefRow.stakeholderName;
    const basis = closureBasis(caseRecord, key, name, facts);
    const latest = latestDraftFor(drafts, caseRecord.id, key, 'closure');
    if (latest && latest.fingerprint === basis) continue;
    const open = openDraftsFor(drafts, caseRecord.id, key, 'closure');
    const rendered = renderCommsDraft({ caseRecord, stakeholder, purpose: 'closure', facts, stakeholderName: name });
    const fresh = makeDraft({
      caseRecord, key, name, purpose: 'closure', rendered, basis, idFactory, nowIso, todayStr,
      supersedesId: open.length ? open[open.length - 1].id : null,
    });
    for (const row of open) supersede(row, 'a newer closure note replaces it', { todayStr, nowIso, supersededById: fresh.id });
    drafts.push(fresh);
    linkDraft(draft, caseRecord, fresh.id, COMMS_RULE_IDS.CLOSURE, { idFactory, todayStr, nowIso });
    note(
      ctx,
      COMMS_RULE_IDS.CLOSURE,
      'drafted',
      fresh.id,
      `Owed closure note to ${fresh.stakeholderName}, who was briefed on ${briefRow.sentOn || briefRow.createdOn}`,
      out,
    );
  }
}

/** RULE-COMMS-03: a reopened case withdraws the closure note, then re-briefs. */
function withdrawClosures(draft, caseRecord, ctx, out) {
  const drafts = ensureDrafts(draft);
  for (const row of drafts.filter((d) => d && d.caseId === caseRecord.id && d.purpose === 'closure' && COMMS_OPEN_STATUSES.includes(d.status))) {
    supersede(row, 'the case was reopened, so the closure note no longer holds', { todayStr: ctx.todayStr, nowIso: ctx.nowIso });
    note(ctx, COMMS_RULE_IDS.WITHDRAW, 'superseded', row.id, `Withdrew closure note for ${row.stakeholderName}: case reopened`, out);
  }
}

/** RULE-COMMS-04: a logged stakeholder brief marks the matching open drafts as sent. */
function markTouches(draft, caseRecord, ctx, out) {
  const drafts = ensureDrafts(draft);
  for (const stakeholder of caseRecord.stakeholders || []) {
    const key = stakeholderKeyOf(stakeholder);
    const touchedOn = stakeholder.lastCommsOn;
    if (!touchedOn) continue;
    for (const row of openDraftsFor(drafts, caseRecord.id, key, 'brief')) {
      // A touch counts only if it is dated on or after the draft was written.
      if (touchedOn < row.createdOn) continue;
      row.status = 'sent';
      row.sentOn = touchedOn;
      row.channel = 'logged stakeholder brief';
      row.updatedAt = ctx.nowIso;
      note(ctx, COMMS_RULE_IDS.TOUCH, 'sent', row.id, `Marked brief to ${row.stakeholderName} as sent (logged on ${touchedOn})`, out);
    }
  }
}

/**
 * Post-commit rule. Dispatches on the committed case event. Non-case events
 * and cases with `autoPropagate: false` are ignored, matching the case engine.
 */
export function commsRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type.startsWith('case.')) return [];
  if (!event.entityId) return [];
  const caseRecord = (draft.cases || []).find((c) => c && c.id === event.entityId) || null;
  if (!caseRecord || caseRecord.autoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
    people: draft.people || [],
  };
  const out = [];
  switch (event.type) {
    case 'case.stakeholder.comms':
      markTouches(draft, caseRecord, runCtx, out);
      break;
    case 'case.resolved':
      syncClosure(draft, caseRecord, runCtx, out);
      break;
    case 'case.reopened':
      withdrawClosures(draft, caseRecord, runCtx, out);
      syncBriefs(draft, caseRecord, runCtx, out);
      break;
    case 'case.created':
    case 'case.updated':
    case 'case.automation.refresh':
      // A case edited into a closed state by a plain update (updateCase accepts
      // any status) is still closed for stakeholders: the closure rule applies
      // regardless of which action closed it.
      if (isCaseOpen(caseRecord)) syncBriefs(draft, caseRecord, runCtx, out);
      else syncClosure(draft, caseRecord, runCtx, out);
      break;
    default:
      break;
  }
  return out;
}

/* ------------------------------------------------------------ user actions (pure) */

/** Readiness check used by the approval gate. */
export function approvalGate(row) {
  if (!row) return { ok: false, reason: 'That draft no longer exists.' };
  if (row.status !== 'draft' && row.status !== 'approved') {
    return { ok: false, reason: `This draft is ${COMMS_STATUS_LABELS[row.status] || row.status}, so it cannot be approved.` };
  }
  return { ok: true, unfilled: Array.isArray(row.missing) ? row.missing.length : 0 };
}

/**
 * Human-facing signals for the Comms outbox. Mirrors the shape of the other
 * domain signal functions so the insights feed can merge them unchanged.
 */
export function commsSignals(state = {}, now = new Date()) {
  const drafts = Array.isArray(state.commsDrafts) ? state.commsDrafts : [];
  const todayStr = dayKey(now);
  const signals = [];

  const awaiting = drafts.filter((d) => d && d.status === 'draft');
  if (awaiting.length) {
    const withGaps = awaiting.filter((d) => (d.missing || []).length > 0);
    signals.push({
      ruleId: 'COMMS-01',
      domain: 'Comms',
      title: `${awaiting.length} stakeholder draft${awaiting.length === 1 ? '' : 's'} awaiting your approval`,
      detail: withGaps.length
        ? `${withGaps.length} of them still have facts to confirm on the case. Approval needs an explicit acknowledgement for those.`
        : 'Every draft is fully sourced from recorded case facts.',
      severity: withGaps.length ? 2 : 1,
      confidence: 'high',
      evidence: awaiting.slice(0, 3).map((d) => `${COMMS_PURPOSE_LABELS[d.purpose] || d.purpose} for ${d.stakeholderName}`),
      action: { label: 'Review the outbox', route: '#/comms?tab=approve' },
    });
  }

  const stale = drafts.filter((d) => d && d.status === 'approved' && d.approvedOn
    && daysBetween(d.approvedOn, todayStr) >= COMMS_STALE_APPROVAL_DAYS);
  if (stale.length) {
    signals.push({
      ruleId: 'COMMS-02',
      domain: 'Comms',
      title: `${stale.length} approved message${stale.length === 1 ? ' has' : 's have'} not gone out`,
      detail: `Approved ${COMMS_STALE_APPROVAL_DAYS}+ days ago and still not marked sent. Either send it or dismiss it — an approved message left in the outbox quietly goes stale.`,
      severity: 3,
      confidence: 'high',
      evidence: stale.slice(0, 3).map((d) => `${d.stakeholderName}: approved ${d.approvedOn}`),
      action: { label: 'Mark sent or dismiss', route: '#/comms?tab=ready' },
    });
  }

  const closureOwed = drafts.filter((d) => d && d.purpose === 'closure' && d.status === 'draft');
  if (closureOwed.length) {
    signals.push({
      ruleId: 'COMMS-03',
      domain: 'Comms',
      title: `${closureOwed.length} briefed stakeholder${closureOwed.length === 1 ? ' is' : 's are'} owed a closure note`,
      detail: 'These people heard about the risk while it was open. Telling them how it ended closes the loop; leaving it open is how stakeholders learn to stop listening.',
      severity: 2,
      confidence: 'high',
      evidence: closureOwed.slice(0, 3).map((d) => `${d.stakeholderName}: ${d.subject}`),
      action: { label: 'Review closure notes', route: '#/comms?tab=approve' },
    });
  }
  return signals;
}

function daysBetween(fromDay, toDay) {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

