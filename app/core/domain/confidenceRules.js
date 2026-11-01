/**
 * app/core/domain/confidenceRules.js — the Confidence Transport Terminal's four
 * post-commit rules (Schema v72, ADR-0064).
 *
 * RULE-CTR-01  Certify. When transport is supported out of sample and no
 *              certificate is open, freeze one — with the map's parameters, the
 *              prequential scores that justified it and a review day — and attach
 *              it to the live promises it reads furthest from. The certificate is
 *              the only prospective test the terminal has, so it is written the
 *              moment a claim becomes worth testing, not when someone remembers
 *              to press a button.
 * RULE-CTR-02  Read. For each source module with open declarations inside a
 *              certified reading by at least the declared gap, one owned task per
 *              module per ISO week: here is what you wrote, here is what the
 *              certificate reads, decide whether to keep the number. Every listed
 *              record is linked with a typed `recalibrates-belief` edge.
 * RULE-CTR-03  Grade. Certificates past their review day are graded once from the
 *              forecasts that resolved inside the window; a window that closed
 *              with nothing inside lapses rather than being credited. A
 *              certificate that LOST to the declared numbers opens one blameless
 *              process task and, at most once per ISO week, one governed decision
 *              about whether to keep transporting.
 * RULE-CTR-04  Reconcile. An explicit scan removes edges that point at deleted
 *              certificates, so the graph never advertises a record that is gone.
 *
 * All four are marker-idempotent and write inside the caller's transaction. None
 * of them rewrites a declared probability, and none of them scores a person: the
 * unit is the leader's own probability vocabulary across modules.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  CONFIDENCE_DOMAIN,
  CONFIDENCE_EVENTS,
  CONFIDENCE_RULE_IDS,
  confidenceSource,
} from './confidenceRegistry.js';
import {
  buildConfidenceCertificate,
  certificateDue,
  confidenceConventions,
  confidenceReport,
  gradeConfidenceCertificate,
} from './confidence.js';

/**
 * Every event that can add a settled forecast or open a new declaration. The
 * module reads the whole workspace on each trigger, so this list only decides
 * WHEN to look, never what a sample means.
 */
const CONFIDENCE_TRIGGER_EVENTS = Object.freeze([
  'premise.outcome',
  'premise.updated',
  'decision.reviewed',
  'decision.updated',
  'decision.made',
  'impact.scored',
  'performance.review.recorded',
  'survival.reading.graded',
  'integrity.verdict',
  'voi.settled',
  'voi.scanned',
]);

export const CONFIDENCE_TRIGGERS = Object.freeze([...CONFIDENCE_TRIGGER_EVENTS, CONFIDENCE_EVENTS.SCAN]);

const MARKER_CAP = 400;
const CERTIFICATE_CAP = 40;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function addMarker(draft, tag) {
  draft.confidenceMarkers = Array.isArray(draft.confidenceMarkers) ? draft.confidenceMarkers : [];
  if (draft.confidenceMarkers.includes(tag)) return false;
  draft.confidenceMarkers.push(tag);
  if (draft.confidenceMarkers.length > MARKER_CAP) {
    draft.confidenceMarkers.splice(0, draft.confidenceMarkers.length - MARKER_CAP);
  }
  return true;
}

const seen = (draft, tag) => (draft.confidenceMarkers || []).includes(tag);

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, spec) {
  return ensureEntityLink(draft, spec, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 7) {
  return {
    id: ctx.idFactory('delegation'),
    personId: ownerId,
    title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn: addDays(ctx.now, dueDays),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function newDecision(ctx, ownerName, title, question, rationale, options, ruleId) {
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: String(ownerName || '').slice(0, 120),
    approver: String(ownerName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({
      id: ctx.idFactory('opt'),
      label: label.slice(0, 200),
      pros: pros.slice(0, 400),
      cons: cons.slice(0, 400),
    })),
    chosen: '',
    rationale: `Opened by ${ruleId}: ${rationale}`.slice(0, 2000),
    reviewOn: addDays(ctx.now, 7),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

const pctText = (value) => (Number.isFinite(value) ? `${value}%` : 'withheld');

/* ---------------------------------------------------------------- CTR-01 */

function certifyRule(draft, ctx, report, week, effects) {
  if (report.verdict !== 'supported' || report.chosen === 'identity') return;
  draft.confidenceCertificates = Array.isArray(draft.confidenceCertificates) ? draft.confidenceCertificates : [];
  const open = draft.confidenceCertificates.find((cert) => cert && !cert.graded && !cert.lapsedOn);
  if (open) return;
  const tag = `${CONFIDENCE_RULE_IDS.CERTIFY}:${report.chosen}:${week}`;
  if (seen(draft, tag)) return;
  const built = buildConfidenceCertificate(report, {
    id: ctx.idFactory('ccert'),
    nowIso: ctx.now.toISOString(),
  });
  if (!built.ok) return;
  addMarker(draft, tag);
  draft.confidenceCertificates.unshift(built.record);
  if (draft.confidenceCertificates.length > CERTIFICATE_CAP) {
    draft.confidenceCertificates.splice(CERTIFICATE_CAP);
  }
  effects.push(effect(CONFIDENCE_RULE_IDS.CERTIFY, 'frozen', 'certificate', built.record.id,
    `Certified the ${built.record.mapType} map: Brier ${built.record.chosenBrier} transported against ${built.record.brierDeclared} declared on ${built.record.scoredN} out-of-sample settlements; review ${built.record.reviewOn}.`));
  // Attach the certificate to the promises it reads furthest from. Three is a
  // deliberately small number: a certificate is provenance, not a task list.
  for (const row of report.live.rows.slice(0, 3)) {
    if (link(draft, ctx, {
      sourceType: 'certificate',
      sourceId: built.record.id,
      targetType: confidenceSource(row.source)?.entityType || '',
      targetId: row.recordId,
      relation: 'recalibrates-belief',
      ruleId: CONFIDENCE_RULE_IDS.CERTIFY,
      summary: `Certified reading ${row.transportedPct}% against the declared ${row.declaredPct}%`,
    })) {
      effects.push(effect(CONFIDENCE_RULE_IDS.CERTIFY, 'linked', row.source, row.recordId,
        'Linked the certificate to an open promise it reads furthest from.'));
    }
  }
}

/* ---------------------------------------------------------------- CTR-02 */

function readRule(draft, ctx, report, week, owner, effects) {
  if (!owner || report.verdict !== 'supported') return;
  const flagged = report.live.rows.filter((row) => row.absGapPp >= report.conventions.gapPct);
  if (!flagged.length) return;
  const bySource = new Map();
  for (const row of flagged) {
    const list = bySource.get(row.source) || [];
    list.push(row);
    bySource.set(row.source, list);
  }
  for (const [sourceId, rows] of bySource) {
    const tag = `${CONFIDENCE_RULE_IDS.READ}:${sourceId}:${week}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const source = confidenceSource(sourceId);
    const listed = rows.slice(0, report.conventions.taskCap);
    const certificate = (draft.confidenceCertificates || []).find((cert) => cert && !cert.graded && !cert.lapsedOn)
      || (draft.confidenceCertificates || [])[0];
    const task = newTask(
      ctx,
      owner.id,
      `Re-read ${listed.length} open ${String(source?.label || sourceId).toLowerCase()} declaration(s) against your own calibration record`,
      listed.map((row) => `“${String(row.label).slice(0, 60)}”: declared ${row.declaredPct}%, certified reading ${row.transportedPct}% (${row.gapPp > 0 ? '+' : ''}${row.gapPp} points).`).join(' ')
      + ` The ${certificate ? certificate.mapType : report.chosen} map that produces the second reading beat your numbers out of sample on ${report.race.scored} settlements `
      + `(Brier ${report.verdicts.chosen === 'identity' ? '—' : report.race.models.find((m) => m.key === report.chosen)?.brier} against ${report.race.models[0].brier}); `
      + `the paired 90% interval is ${report.verdicts.interval ? `${report.verdicts.interval.lo} to ${report.verdicts.interval.hi}` : 'unavailable'}. `
      + 'For each: keep the number and write why, or re-state it at the certified reading. Nothing has been changed for you.',
      'The declaration is the record and stays exactly as written. This task exists because the arithmetic downstream of that number '
      + '(expected value, cost of carry, value of information) inherits whatever bias the number carries — and the leader is the only '
      + 'one who can decide whether this particular promise is like the rest of their record.',
      tag,
      5,
    );
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(effect(CONFIDENCE_RULE_IDS.READ, 'created', 'delegation', task.id,
      `Opened one re-read task for ${listed.length} ${source?.label || sourceId} declaration(s) ${report.conventions.gapPct}+ points from the certified reading.`));
    for (const row of listed) {
      if (link(draft, ctx, {
        sourceType: 'delegation',
        sourceId: task.id,
        targetType: source?.entityType || '',
        targetId: row.recordId,
        relation: 'recalibrates-belief',
        ruleId: CONFIDENCE_RULE_IDS.READ,
        summary: `Declared ${row.declaredPct}%, certified reading ${row.transportedPct}%`,
      })) {
        effects.push(effect(CONFIDENCE_RULE_IDS.READ, 'linked', row.source, row.recordId,
          'Linked the re-read task to a declaration it reads differently.'));
      }
    }
  }
}

/* ---------------------------------------------------------------- CTR-03 */

function gradeRule(draft, ctx, conventions, week, owner, effects) {
  const today = dayKey(ctx.now);
  draft.confidenceCertificates = Array.isArray(draft.confidenceCertificates) ? draft.confidenceCertificates : [];
  for (const cert of draft.confidenceCertificates) {
    if (!certificateDue(cert, today)) continue;
    const grade = gradeConfidenceCertificate(cert, draft, ctx.now);
    if (!grade) {
      const lateBy = daysBetween(cert.reviewOn, today) ?? 0;
      if (lateBy >= conventions.reviewDays) {
        cert.lapsedOn = today;
        effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'lapsed', 'certificate', cert.id,
          `No forecast resolved inside ${cert.label}'s window, or inside the review period after it; the certificate lapsed untested rather than being credited.`));
      } else {
        effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'withheld', 'certificate', cert.id,
          'The window closed with nothing resolved inside it; the grade is withheld rather than guessed.'));
      }
      continue;
    }
    cert.graded = grade;
    const lost = grade.brierTransported > grade.brierDeclared + conventions.materialBrier;
    effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'graded', 'certificate', cert.id,
      `Graded ${cert.label}: ${grade.successes}/${grade.observed} resolved as declared; Brier ${grade.brierTransported} transported vs ${grade.brierDeclared} declared${lost ? ' — transported lost' : ''}.`));
    if (lost && owner) {
      const tag = `${CONFIDENCE_RULE_IDS.GRADE}:task:${cert.id}`;
      if (!seen(draft, tag)) {
        addMarker(draft, tag);
        const task = newTask(
          ctx,
          owner.id,
          'A frozen calibration certificate lost to your own numbers — decide whether to stop transporting',
          `The certificate issued ${cert.issuedOn} carried a ${cert.mapType} map and was graded on ${grade.observed} settlement(s) that resolved inside its window: `
          + `Brier ${grade.brierTransported} transported against ${grade.brierDeclared} declared, on ${grade.successes} occurrence(s). `
          + 'Write down whether this record still supports a translation, or whether the words were already well calibrated and the map fitted noise.',
          'A process finding about the instrument, not about a person. It is closed by a written ruling or a new certificate, never by a conversation about someone\'s judgement.',
          tag,
        );
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.unshift(task);
        effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'created', 'delegation', task.id,
          'Opened one blameless process task after a certificate lost to the declared numbers.'));
        if (link(draft, ctx, {
          sourceType: 'certificate', sourceId: cert.id, targetType: 'delegation', targetId: task.id,
          relation: 'recalibrates-belief', ruleId: CONFIDENCE_RULE_IDS.GRADE, summary: 'Graded certificate opened the process review',
        })) {
          effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'linked', 'delegation', task.id, 'Linked the graded certificate to its process task.'));
        }
      }
      const decisionTag = `${CONFIDENCE_RULE_IDS.GRADE}:decision:${week}`;
      if (!seen(draft, decisionTag)) {
        addMarker(draft, decisionTag);
        const decision = newDecision(
          ctx,
          owner?.name || draft.settings?.leaderName || '',
          'Transporting my probability words lost to my own numbers — keep it, restrict it, or stop?',
          `A frozen certificate said translating the leader's declared probabilities would beat them out of sample. Graded prospectively it did not: `
          + `Brier ${grade.brierTransported} transported against ${grade.brierDeclared} declared on ${grade.observed} settlement(s). `
          + 'The declared numbers stay the record either way. Choose what the terminal is allowed to claim next.',
          `Proper-score comparison of a frozen map against the declarations it translated (Brier 1950), graded once from forecasts that resolved inside the certificate window. `
          + `Materiality is ${Math.round(conventions.materialBrier * 10000) / 100} Brier points.`,
          [
            ['Stop transporting on this record', 'The terminal goes back to counting only what the words did.', 'Small-sample bands lose the correction they had.'],
            ['Keep transporting, and restrict it to one horizon band', 'The correction may hold where it was measured.', 'Needs the band to clear its own floors.'],
            ['Keep transporting and re-certify at the next window', 'One lost window can be noise.', 'If it was not, the loss compounds.'],
          ],
          CONFIDENCE_RULE_IDS.GRADE,
        );
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.unshift(decision);
        effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'created', 'decision', decision.id,
          'Opened one governed decision after a certificate lost prospectively.'));
        if (link(draft, ctx, {
          sourceType: 'certificate', sourceId: cert.id, targetType: 'decision', targetId: decision.id,
          relation: 'recalibrates-belief', ruleId: CONFIDENCE_RULE_IDS.GRADE, summary: 'Lost certificate opened this ruling',
        })) {
          effects.push(effect(CONFIDENCE_RULE_IDS.GRADE, 'linked', 'decision', decision.id, 'Linked the lost certificate to the ruling it opened.'));
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- CTR-04 */

function reconcileRule(draft, isScan, effects) {
  if (!isScan) return;
  const ids = new Set((draft.confidenceCertificates || []).map((cert) => cert && cert.id).filter(Boolean));
  if (!Array.isArray(draft.links)) return;
  const before = draft.links.length;
  const kept = draft.links.filter((l) => l && !((l.sourceType === 'certificate' && !ids.has(l.sourceId))
    || (l.targetType === 'certificate' && !ids.has(l.targetId))));
  if (kept.length !== before) {
    draft.links = kept;
    effects.push(effect(CONFIDENCE_RULE_IDS.RECONCILE, 'reconciled', 'links', '',
      `Removed ${before - kept.length} edge(s) to certificates that no longer exist.`));
  }
}

/* ---------------------------------------------------------------- engine */

export { CONFIDENCE_EVENTS, CONFIDENCE_RULE_IDS };

export function confidenceRule(draft, ctx = {}) {
  if (!draft || !ctx.event || typeof ctx.event.type !== 'string') return [];
  const type = ctx.event.type;
  const isScan = type === CONFIDENCE_EVENTS.SCAN;
  if (!isScan && !CONFIDENCE_TRIGGER_EVENTS.includes(type)) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const scoped = { ...ctx, now };
  const conventions = confidenceConventions(ctx.settings || draft.settings || {});
  if (!conventions.autoPropagate && !isScan) return [];

  const week = weekKey(now) || dayKey(now);
  const owner = ownerOf(draft);
  const effects = [];

  // Grade first: a certificate must be scored before a new one could be frozen
  // beside it, or the terminal would be certifying while it owes a grade.
  gradeRule(draft, scoped, conventions, week, owner, effects);

  const report = confidenceReport(draft, now, ctx.settings || draft.settings || {});
  if (report.verdict === 'supported') {
    certifyRule(draft, scoped, report, week, effects);
    readRule(draft, scoped, report, week, owner, effects);
  }
  reconcileRule(draft, isScan, effects);

  for (const entry of effects) {
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'automation.propagated',
        entity: 'certificate',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

confidenceRule.id = 'confidence';
confidenceRule.label = 'Confidence transport & calibration certificates (RULE-CTR-01..04)';
confidenceRule.module = 'confidenceRules.js';
confidenceRule.triggers = CONFIDENCE_TRIGGERS;
confidenceRule.effect = (draft, event, context = {}) => confidenceRule(draft, { ...context, event });
Object.freeze(confidenceRule);

export { CONFIDENCE_DOMAIN, daysBetween };
