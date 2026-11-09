/**
 * app/views/contradiction.js — `#/contradiction`, the Cross-Line Contradiction
 * Audit (ADR-0144, Schema v121).
 *
 * Four panels, and the sentence printed above every finding:
 *
 *   Board   "Two lines of my matrix are each chartered to optimise something.
 *            Does one make the other unachievable for the people on both — and
 *            has anybody ruled on it?"
 *   Finding ONE finding at a time: the two declared charters side by side, the
 *           arithmetic that produced the severity, and the single act that
 *           records a ruling.
 *   Log     every recorded ruling, append-only, with the reasoning and any
 *           obligation it issued.
 *   Method  the lever taxonomy, the couplings, what is provable and what is not,
 *           and the conventions a chief can re-declare.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A "conflict score", a person rating or a manager ranking. A finding is a
 *    property of two declared charters; the audit names the pair, never grades
 *    the people.
 *  - A provable impossibility where only a trade-off exists. Only the queueing
 *    coupling carries arithmetic, and only above the declared knee does it read
 *    `incompatible`; everything else reads `tension` and says so.
 *  - A zero for a missing figure. A missing weight, claim or utilisation target
 *    yields `insufficient evidence` naming the figure, never a favourable default.
 *  - One word for two claims. "The findings add up", "every finding has been
 *    ruled on" and "the rows match the total" are printed on three separate
 *    lines, because they are three separate facts.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  CONTRADICTION_BOUNDS,
  CONTRADICTION_CSV_COLUMNS,
  CONTRADICTION_DIRECTIONS,
  CONTRADICTION_LEVERS,
  CONTRADICTION_PANELS,
  CONTRADICTION_STATE_LABELS,
  CONTRADICTION_VERDICTS,
  contradictionFindingLabel,
} from '../core/domain/contradictionRegistry.js';

const PANELS = CONTRADICTION_PANELS;
let apiRef = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'board';
};
const findingKeyFor = (query) => query?.get?.('finding') || null;
const go = (ctx, panel, key = null) => ctx.navigate(`#/contradiction?panel=${encodeURIComponent(panel)}${key ? `&finding=${encodeURIComponent(key)}` : ''}`);
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const bp = (v) => (Number.isInteger(v) ? `${(v / 100).toFixed(2)}%` : 'not declared');
const severityTone = (s) => (s === 'incompatible' ? 'bad' : s === 'tension' ? 'warn' : s === 'insufficient' ? 'neutral' : 'neutral');
const stateTone = (s) => (s === 'accepted' ? 'good' : s === 'resequenced' ? 'good' : s === 'withheld' ? 'warn' : 'neutral');

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The audit action was refused.', 'bad'); return false; }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = apiRef?.contradictionCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The contradiction export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-contradiction-audit-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv(CONTRADICTION_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
  });
}

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx) {
  const candidates = ctx.api.contradictionCandidates?.() || {};
  if (!candidates.ok) { toast(candidates.error || 'No candidates are readable from this seat.', 'bad'); return; }
  if (!candidates.lines?.length) {
    toast('No line in this span holds a declared reporting line yet. Declare the matrix lines on the Matrix panel first — a charter is attached to a line, and with one line there is nothing to contradict.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'lineManagerId', label: 'Which line is chartered?', type: 'select',
      options: candidates.lines.map((l) => ({ value: l.managerId, label: `${l.name} — ${l.peopleN} person(s), ${l.mandateN} declared charter(s)` })),
      help: 'The line is the manager whose charter this is. A person may sit on several lines; the charter belongs to the line, not the person.',
    },
    { name: 'lever', label: 'Lever', type: 'select', options: CONTRADICTION_LEVERS.map((l) => ({ value: l.key, label: `${l.label} (${l.unit})` })), help: 'The declared taxonomy. The audit can only compare levers it knows, and it refuses a metric outside it rather than guessing one.' },
    { name: 'direction', label: 'Direction', type: 'select', options: CONTRADICTION_DIRECTIONS.map((d) => ({ value: d.key, label: d.label })), help: 'A lever with no declared direction supports nothing.' },
    { name: 'objectiveId', label: 'Objective (optional)', type: 'select', options: [{ value: '', label: '— no objective pointer —' }, ...(candidates.objectives || []).map((o) => ({ value: o.id, label: `${o.title}${o.ownerName ? ` (${o.ownerName})` : ''}` }))], help: 'Points at a real goal on the register. The register keeps the objective; this row only declares what the line is chartered to do with it.' },
    { name: 'weightBp', label: 'Share of the scorecard (basis points, 10000 = 100%)', type: 'number', value: '', help: 'Declared, never inferred. Two lines’ shares are added per person; above 10000 the person is paid more than they can earn.' },
    { name: 'targetValue', label: 'Declared target (optional, in the lever’s unit)', type: 'number', value: '', help: 'For utilisation this is whole percent and must be 1–99. The queueing test needs it; if it is missing the audit refuses rather than assuming a favourable number.' },
    { name: 'envelopeId', label: 'Budget envelope claimed (optional)', type: 'select', options: [{ value: '', label: '— no envelope claim —' }, ...(candidates.envelopes || []).map((b) => ({ value: b.id, label: `${b.name} · ${b.currency} ${b.limit ?? 'no ceiling'}` }))], help: 'Claims are measured against the envelope’s own recorded ceiling; the audit never invents a pool.' },
    { name: 'envelopeClaimBp', label: 'Share of that envelope claimed (basis points)', type: 'number', value: '', help: 'Required when an envelope is named. Two lines claiming more than 10000 bp of one envelope is an exact over-claim.' },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2, help: 'The line’s own words about what it is chartered to do.' },
  ]);
  openModal({
    title: 'Declare a line charter',
    description: 'A charter is a declaration, not a measurement. Nothing here is inferred from a goal’s title or a key result’s numbers, because a leader who wanted 30 from 40 may have wanted less of a bad thing or more of a good one.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.contradictionDeclareMandate(v);
          if (!notify(result, 'Charter declared.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Declare the charter'),
    ],
  });
}

function reviewDialog(ctx, finding, verdict) {
  const spec = CONTRADICTION_VERDICTS.find((v) => v.key === verdict);
  const partyIds = finding.subjectType === 'person'
    ? (finding.lineIds || [])
    : finding.subjectType === 'envelope'
      ? (finding.claimantLineIds || [finding.lineAId, finding.lineBId]).filter(Boolean)
      : [finding.lineAId, finding.lineBId].filter(Boolean);
  const partyName = (id) => (id === finding.lineAId ? finding.lineAName : id === finding.lineBId ? finding.lineBName : (finding.lineIds || []).includes(id) ? id : id);
  const fields = [
    { name: 'rationale', label: 'The reasoning, in your own words', type: 'textarea', rows: 4, help: 'At least twenty characters. A ruling without a reason cannot be told apart from a preference six months from now.' },
    { name: 'reviewOn', label: 'Review on (optional, YYYY-MM-DD)', type: 'text', value: '', help: 'Leave blank to use the declared review horizon. A ruling that is already due is not a review cycle.' },
  ];
  if (verdict === 'resequenced') {
    fields.unshift({
      name: 'resequenceLineId', label: 'Which line must change?', type: 'select',
      options: partyIds.map((id) => ({ value: id, label: partyName(id) })),
      help: 'Only a line whose charter produced the contradiction can be told to revise it. RULE-CNT-01 issues one dated obligation to this line in the same transaction.',
    });
  }
  const form = buildForm(fields);
  openModal({
    title: `Ruling — ${spec.label}`,
    description: finding.headline,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.contradictionReview({
            findingKey: finding.key,
            verdict,
            rationale: v.rationale,
            reviewOn: v.reviewOn,
            resequenceLineId: v.resequenceLineId,
          });
          if (!notify(result, verdict === 'resequenced' ? 'Ruling recorded; the named line has its obligation.' : 'Ruling recorded.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the ruling'),
    ],
  });
}

function withdrawMandateDialog(ctx, mandate) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this charter no longer apply?', type: 'textarea', rows: 3, help: 'Append-only: the charter stays readable with this reason. A charter that disappears without one leaves the contradiction it caused unexplained.' },
  ]);
  openModal({
    title: 'Withdraw a line charter',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.contradictionWithdrawMandate({ mandateId: mandate.id, reason: v.reason });
          if (!notify(result, 'Charter withdrawn.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Withdraw'),
    ],
  });
}

function conventionsDialog(ctx) {
  const form = buildForm([
    { name: 'ctrUtilisationCeiling', label: 'Utilisation ceiling (percent)', type: 'number', value: '', help: `Between ${CONTRADICTION_BOUNDS.utilisationCeiling.min} and ${CONTRADICTION_BOUNDS.utilisationCeiling.max}. Above this the queueing coupling reads incompatible and prints the multiplier.` },
    { name: 'ctrMaterialityBp', label: 'Materiality floor (basis points)', type: 'number', value: '', help: `Between ${CONTRADICTION_BOUNDS.materialityBp.min} and ${CONTRADICTION_BOUNDS.materialityBp.max}. Opposite-direction incentive weights below this are not printed as a contradiction.` },
    { name: 'ctrReviewDays', label: 'Default review horizon (days)', type: 'number', value: '', help: `Between ${CONTRADICTION_BOUNDS.reviewDays.min} and ${CONTRADICTION_BOUNDS.reviewDays.max}. When an accepted contradiction comes back.` },
  ]);
  openModal({
    title: 'Re-declare the audit conventions',
    description: 'Printed on the Method panel precisely so they can be argued with before they are changed. Only a rank-4+ full-access seat may re-declare them, and changing them re-prices nothing already ruled on.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.contradictionSetConventions({
            ctrUtilisationCeiling: v.ctrUtilisationCeiling,
            ctrMaterialityBp: v.ctrMaterialityBp,
            ctrReviewDays: v.ctrReviewDays,
          });
          if (!notify(result, 'Conventions re-declared.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Re-declare'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function checksBlock(report) {
  const c = report.checks;
  const t = report.totals;
  if (c.reconciles && c.reviewed && c.rowsMatch) {
    return h('p', { class: 'muted small' },
      `Audit: ${t.incompatibleN} incompatible + ${t.tensionN} tension + ${t.isolatedN} isolated + ${t.insufficientN} insufficient = ${t.findingN} findings; `
      + `${t.undecidedN} undecided + ${t.acceptedN} accepted + ${t.resequencedN} resequenced + ${t.withheldN} withheld = ${t.findingN}; and the printed rows equal the total. Three separate claims, all holding.`);
  }
  return banner({
    tone: 'bad',
    title: 'The audit does not reconcile',
    body: [
      c.reconciles ? '' : `Severities do not add to ${t.findingN}.`,
      c.reviewed ? '' : `Review states do not add to ${t.findingN}.`,
      c.rowsMatch ? '' : 'The printed rows do not match the finding total.',
      'Treat every figure on this page as unverified and report it. The mandate forbids a page that adds up on screen but not in the record.',
    ].filter(Boolean).join(' '),
  });
}

function boardPanel(ctx, report) {
  const t = report.totals;
  const cards = h('div', { class: 'stat-grid' },
    stat({ label: 'Findings', value: t.findingN, hint: `${t.comparedPairsN} line pair(s) compared` }),
    stat({ label: 'Incompatible', value: t.incompatibleN, tone: t.incompatibleN ? 'bad' : '', hint: t.caughtPeopleN ? `${t.caughtPeopleN} person(s) caught` : 'nobody caught today' }),
    stat({ label: 'Tension', value: t.tensionN, tone: t.tensionN ? 'warn' : '', hint: 'Declared trade-offs, not proofs' }),
    stat({ label: 'Awaiting a ruling', value: t.undecidedN, tone: t.attentionN ? 'warn' : '', hint: t.overdueN ? `${t.overdueN} accepted ruling(s) past review` : 'Incompatible pairs with nobody ruling on them' }),
  );

  const findingRows = report.findings.map((finding) => ({
    className: finding.severity === 'incompatible' ? 'row-warn' : '',
    finding: h('div', null,
      h('strong', null, contradictionFindingLabel(finding.kind)),
      h('p', { class: 'muted small' }, finding.headline)),
    pair: finding.subjectType === 'person'
      ? `${finding.personName} · ${(finding.lineIds || []).length} lines`
      : finding.subjectType === 'envelope'
        ? `${finding.envelopeName} · ${finding.claimantN} claimant(s)`
        : `${finding.lineAName} · ${finding.lineBName}`,
    declared: finding.kind === 'incentive-oversubscription'
      ? `weights ${bp(finding.weightSumBp)} of 100%`
      : finding.kind === 'envelope-overclaim'
        ? `claims ${Number.isInteger(finding.claimSumBp) ? bp(finding.claimSumBp) : 'not declared'}`
        : Number.isFinite(finding.queueMultiplier)
          ? `τ ${finding.utilisationTargetPct}% → ${finding.queueMultiplier.toFixed(2)}×`
          : declaredWeightsCell(finding),
    severity: badge(finding.severity, severityTone(finding.severity)),
    state: badge(CONTRADICTION_STATE_LABELS[finding.state] || finding.state, stateTone(finding.state)),
    action: h('button', { class: 'btn btn-small', type: 'button', onClick: () => go(ctx, 'finding', finding.key) }, 'Open'),
  }));

  const mandateRows = (report.mandates || []).map((m) => ({
    line: h('div', null, h('strong', null, m.lineName), h('p', { class: 'muted small' }, `${m.direction === 'increase' ? '↑' : '↓'} ${m.leverLabel}${m.targetValue !== null ? ` · target ${m.targetValue}` : ''}`)),
    objective: m.objectiveTitle
      ? m.objectiveTitle
      : m.objectiveDangling ? badge('objective deleted', 'warn') : '—',
    weight: badge(bp(m.weightBp), m.weightBp > 5000 ? 'warn' : 'neutral'),
    envelope: m.envelopeId
      ? (m.envelopeDangling ? badge('envelope deleted', 'warn') : `${m.envelopeName} · ${bp(m.envelopeClaimBp)}`)
      : '—',
    since: m.effectiveFrom || m.declaredOn || '—',
    action: h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => withdrawMandateDialog(ctx, m) }, 'Withdraw'),
  }));

  return h('div', { class: 'stack' },
    cards,
    checksBlock(report),
    !report.isMatrix
      ? banner({
        tone: 'info',
        title: 'This workspace is single-chain — so there is nothing for this audit to compare',
        body: 'A cross-line contradiction needs two lines. No person in this workspace carries a second declared reporting line, so every person has exactly one charter and no pair exists. The audit reports that rather than inventing a pairing. Declare the matrix lines on the Matrix accountability panel first; then charters here become comparable.',
      })
      : null,
    card({
      title: 'Findings in this span',
      subtitle: report.findingsDeferredN
        ? `${report.findings.length} shown, ${report.findingsDeferredN} further finding(s) counted and not printed.`
        : 'Worst first — provable incompatibility, then missing evidence, then declared tension, then latent pairs. Never ordered by a score of a person.',
      body: table({
        caption: 'Cross-line contradiction findings',
        columns: [
          { label: 'Finding', key: 'finding' },
          { label: 'Charters', key: 'pair' },
          { label: 'What was declared', key: 'declared' },
          { label: 'Severity', key: 'severity' },
          { label: 'Ruling', key: 'state' },
          { label: '', key: 'action' },
        ],
        rows: findingRows,
        emptyMessage: 'No contradiction found in this span. That is a finding too: the charters were compared and nothing conflicted.',
      }),
    }),
    card({
      title: 'Declared charters',
      subtitle: `${t.mandatesN} live charter(s) across ${t.lineN} line(s) and ${t.objectiveN} objective pointer(s). A charter is a human declaration; the audit derives everything else.`,
      actions: [h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => declareDialog(ctx) }, 'Declare a charter')],
      body: table({
        caption: 'Declared line charters',
        columns: [
          { label: 'Line', key: 'line' },
          { label: 'Objective', key: 'objective' },
          { label: 'Scorecard share', key: 'weight' },
          { label: 'Envelope claim', key: 'envelope' },
          { label: 'Declared', key: 'since' },
          { label: '', key: 'action' },
        ],
        rows: mandateRows,
        emptyMessage: 'No line holds a declared charter yet. Declare one per line to make the audit meaningful.',
      }),
    }),
    report.totals.multiLinePeopleN
      ? card({
        title: 'People on more than one line',
        subtitle: 'Their declared weights are summed EXACTLY in basis points. This is the arithmetic, not a rating.',
        body: table({
          caption: 'Multi-line people and their declared scorecards',
          columns: [
            { label: 'Person', key: 'personName' },
            { label: 'Lines', render: (r) => (r.lineNames || []).join(' · ') },
            { label: 'Declared weights', render: (r) => (r.weightPartsBp || []).map((w) => bp(w)).join(' + ') || '—' },
            { label: 'Total', render: (r) => badge(bp(r.weightSumBp), r.weightState === 'over' ? 'bad' : r.weightState === 'undeclared' ? 'warn' : 'good') },
          ],
          rows: report.people,
          emptyMessage: 'Nobody in this span sits on more than one line.',
        }),
      })
      : null,
  );
}

/** A compact "declared" cell for a pair finding without inventing a figure. */
function declaredWeightsCell(finding) {
  if (Number.isInteger(finding.weightABp) && Number.isInteger(finding.weightBBp)) {
    return `weights ${bp(finding.weightABp)} vs ${bp(finding.weightBBp)}`;
  }
  return 'see the finding';
}

function findingPanel(ctx, report, focusKey) {
  const finding = (report.allFindings || report.findings).find((f) => f.key === focusKey) || report.findings[0] || null;
  if (!finding) {
    return emptyState({
      title: 'No finding to open',
      body: report.isMatrix
        ? 'The charters in this span were compared and produced no contradiction. Declare another charter on the Board panel if a line’s real assignment is not yet written down.'
        : 'This workspace is single-chain, so there is no cross-line pair to open. Declare the matrix lines first.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'board') }, 'Back to the board'),
    });
  }
  const partyIds = finding.subjectType === 'person'
    ? (finding.lineIds || [])
    : [finding.lineAId, finding.lineBId].filter(Boolean);
  const history = (report.reviews || []).filter((r) => r.findingKey === finding.key);

  return h('div', { class: 'stack' },
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => go(ctx, 'board') }, '← All findings'),
      badge(finding.severity, severityTone(finding.severity)),
      badge(CONTRADICTION_STATE_LABELS[finding.state] || finding.state, stateTone(finding.state))),

    banner({
      tone: finding.severity === 'incompatible' ? 'bad' : finding.severity === 'tension' ? 'warn' : 'info',
      title: contradictionFindingLabel(finding.kind),
      body: finding.headline,
    }),

    card({
      title: 'Why the engine says this',
      subtitle: finding.reason,
      body: h('div', { class: 'stack' },
        finding.law ? h('p', null, h('strong', null, 'Law applied: '), finding.law) : null,
        finding.why ? h('p', { class: 'muted' }, finding.why) : null,
        Number.isFinite(finding.queueMultiplier)
          ? h('p', null, h('strong', null, 'The arithmetic: '), `τ/(100−τ) at τ = ${finding.utilisationTargetPct}% gives ${finding.queueMultiplier.toFixed(2)}× (${finding.queueMultiplierDisplay || ''}). The declared ceiling is ${finding.utilisationCeilingPct}%.`)
          : null,
        finding.missingFigure
          ? banner({ tone: 'warn', title: 'A figure is missing', body: `The audit needs ${finding.missingFigure}. Nothing was inferred and no verdict is offered; the missing figure is printed rather than read as zero.` })
          : null,
        finding.subjectType === 'person'
          ? h('p', null, h('strong', null, 'Declared weights: '), `${(finding.weightPartsBp || []).map((w) => bp(w)).join(' + ') || '—'} = ${bp(finding.weightSumBp)}. Materiality floor: ${bp(finding.materialityBp)}.`)
          : null,
        finding.kind === 'envelope-overclaim'
          ? h('p', null, h('strong', null, 'Declared claims: '), `${(finding.claimPartsBp || []).map((w) => bp(w)).join(' + ') || '—'} = ${Number.isInteger(finding.claimSumBp) ? bp(finding.claimSumBp) : 'not declared'} against an envelope ceiling of 100%.`)
          : null,
        h('p', { class: 'muted small' }, finding.sharedPersonN
          ? `${finding.sharedPersonN} person(s) sit on both lines${finding.sharedWithheldN ? `, ${finding.sharedWithheldN} of them outside this seat’s span and withheld rather than named` : ''}.`
          : 'No person sits on both lines today.'),
      ),
    }),

    card({
      title: 'The two charters',
      body: table({
        caption: 'Declared charters in this finding',
        columns: [
          { label: 'Line', render: (r) => r.line },
          { label: 'Lever', render: (r) => r.lever },
          { label: 'Direction', render: (r) => r.direction },
          { label: 'Weight', render: (r) => bp(r.weight) },
        ],
        rows: finding.kind === 'incentive-oversubscription'
          ? (finding.lineIds || []).map((id) => ({
            line: (report.lines.find((l) => l.managerId === id) || {}).managerName || id,
            lever: finding.leverLabel || '—',
            direction: 'both ways',
            weight: null,
          }))
          : [
            { line: finding.lineAName || '—', lever: finding.leverLabel || '—', direction: finding.directionA || '—', weight: finding.weightABp },
            { line: finding.lineBName || '—', lever: finding.leverLabel || '—', direction: finding.directionB || '—', weight: finding.weightBBp },
          ],
        emptyMessage: 'No charter pair to show.',
      }),
    }),

    card({
      title: 'The ruling',
      subtitle: finding.review
        ? `Recorded ${finding.review.decidedOn}${finding.review.reviewOn ? `; review on ${finding.review.reviewOn}${finding.review.reviewDerived ? ' (derived from the declared horizon)' : ''}` : ''}.`
        : 'Nobody has ruled on this contradiction. It is printed as open, not as resolved.',
      body: h('div', { class: 'stack' },
        finding.review
          ? h('div', { class: 'stack' },
            h('p', null, h('strong', null, `${CONTRADICTION_STATE_LABELS[finding.review.verdict] || finding.review.verdict}. `), finding.review.rationale),
            finding.review.resequenceLineId
              ? h('p', null, `The line told to change: ${(report.lines.find((l) => l.managerId === finding.review.resequenceLineId) || {}).managerName || finding.review.resequenceLineId}.`)
              : null,
            finding.review.decisionId ? h('p', { class: 'muted small' }, `Governed decision: ${finding.review.decisionId}.`) : null,
            (finding.review.obligationIssued || []).length
              ? table({
                caption: 'Obligations issued by the ruling',
                columns: [
                  { label: 'Task', key: 'taskId' },
                  { label: 'Line', key: 'lineId' },
                  { label: 'Due', key: 'dueOn' },
                ],
                rows: finding.review.obligationIssued,
              })
              : h('p', { class: 'muted small' }, finding.review.verdict === 'resequenced'
                ? 'The rule has not issued the obligation yet. Run a scan; it will retry, and nothing is silently dropped.'
                : 'This verdict issues no work. Accepting a trade-off is not assigning anybody a task.'),
            finding.review.overdue
              ? banner({ tone: 'warn', title: 'This ruling is past its review date', body: 'An accepted contradiction whose review date has passed is back in the attention queue. Re-rule rather than letting a stale acceptance stand.' })
              : null)
          : null,
        h('div', { class: 'row-actions' },
          ...CONTRADICTION_VERDICTS.map((v) => h('button', {
            class: v.issuesWork ? 'btn btn-primary btn-small' : 'btn btn-small',
            type: 'button',
            onClick: () => reviewDialog(ctx, finding, v.key),
          }, v.label))),
      ),
    }),

    card({
      title: 'Ruling history',
      subtitle: 'Append-only. A later ruling supersedes an earlier one without deleting it.',
      body: table({
        caption: 'Recorded rulings on this finding',
        columns: [
          { label: 'Ruling', render: (r) => badge(r.verdict, stateTone(r.verdict)) },
          { label: 'On', key: 'decidedOn' },
          { label: 'Reasoning', key: 'rationale' },
          { label: 'Review', key: 'reviewOn' },
        ],
        rows: history,
        emptyMessage: 'No ruling has been recorded on this finding.',
      }),
    }),
  );
}

function logPanel(ctx, report) {
  return card({
    title: 'Recorded rulings',
    subtitle: 'Append-only. Every ruling keeps the chief’s reasoning; a resequence keeps its obligation; a withheld finding keeps the reason it could not be decided.',
    body: table({
      caption: 'Contradiction rulings',
      columns: [
        { label: 'Finding', render: (r) => contradictionFindingLabel(r.kind) },
        { label: 'Ruling', render: (r) => badge(r.verdict, stateTone(r.verdict)) },
        { label: 'On', key: 'decidedOn' },
        { label: 'Review', key: 'reviewOn' },
        { label: 'Reasoning', key: 'rationale' },
        { label: '', render: (r) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => go(ctx, 'finding', r.findingKey) }, 'Open finding') },
      ],
      rows: report.reviews || [],
      emptyMessage: 'No ruling has been recorded yet. That is a fact, not an empty state: the contradictions above are still undecided.',
    }),
  });
}

function methodPanel(ctx, report) {
  const c = report.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'What is declared, and by whom',
      body: h('div', { class: 'stack' },
        h('p', null, 'Four numbers are DECLARED, printed here, exported in every CSV, and re-declarable only by a rank-4+ full-access seat. None is fitted from the record.'),
        h('ul', { class: 'stack-tight' },
          h('li', null, h('strong', null, 'Utilisation ceiling: '), `${c.ctrUtilisationCeiling}% — above this the queueing coupling reads incompatible and the multiplier is printed. It is a planning convention; the true knee depends on variability this workspace does not measure.`),
          h('li', null, h('strong', null, 'Materiality floor: '), `${bp(c.ctrMaterialityBp)} — opposite-direction incentive weights below this are not printed as a contradiction, because at that level it is a rounding error, not a conflict.`),
          h('li', null, h('strong', null, 'Review horizon: '), `${c.ctrReviewDays} day(s) — when an accepted contradiction comes back.`),
          h('li', null, h('strong', null, 'Automatic propagation: '), c.ctrAutoPropagate ? 'on — a resequence issues its obligation in the same transaction.' : 'off — no obligation is issued automatically; an explicit scan still runs.'),
        ),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small', type: 'button', onClick: () => conventionsDialog(ctx) }, 'Re-declare the conventions')),
      ),
    }),
    card({
      title: 'The lever taxonomy',
      subtitle: 'A closed vocabulary. Two charters can only be compared if their levers mean the same thing.',
      body: table({
        caption: 'Declared levers',
        columns: [
          { label: 'Lever', key: 'label' },
          { label: 'Unit', key: 'unit' },
          { label: 'Enterprise-good direction', render: (l) => (l.higherIsBetter ? 'higher' : 'lower') },
          { label: 'What it means', key: 'hint' },
        ],
        rows: CONTRADICTION_LEVERS,
      }),
    }),
    card({
      title: 'The declared couplings',
      subtitle: 'Two of these are a proof from declared integers. The rest are a trade-off, and the panel says which.',
      body: table({
        caption: 'Coupled levers',
        columns: [
          { label: 'Pair', render: (x) => `${x.a} ⇄ ${x.b}` },
          { label: 'Law', key: 'law' },
          { label: 'Provable?', render: (x) => badge(x.provable === 'queueing' ? 'arithmetic' : 'trade-off only', x.provable === 'queueing' ? 'bad' : 'warn') },
        ],
        rows: report.couplings,
      }),
    }),
    card({
      title: 'The methods this module applies',
      subtitle: 'Named, not paraphrased. Each one answers a question the others cannot.',
      body: h('div', { class: 'stack' }, ...report.method.map((m) => h('div', null, h('h3', null, m.name), h('p', null, m.why)))),
    }),
    card({
      title: 'What the engine refuses to do',
      body: h('ul', { class: 'stack-tight' },
        h('li', null, 'It does not rate a person or a manager. A finding is a property of two declared charters; the audit names the pair and never ranks the people in it.'),
        h('li', null, 'It does not claim impossibility where only a trade-off exists. Only the queueing coupling carries arithmetic; everything else reads tension.'),
        h('li', null, 'It does not read a missing figure as zero. A missing weight, claim or utilisation target yields insufficient evidence naming the figure.'),
        h('li', null, 'It does not count a latent pair as a live contradiction. Two charters that share no person are isolated and counted separately.'),
        h('li', null, 'It does not issue work from an acceptance. RULE-CNT-01 fires only on a resequence, and only to the named line.'),
        h('li', null, 'It does not rule on its own. A verdict is a human act through the reviewed gateway; the engine only derives the finding.'),
      ),
    }),
    card({
      title: 'The identity this page is built on',
      body: h('p', null, `No finding is stored. Every finding is re-derived on read from the declared charters, the live matrix and the recorded rulings; the ruling state is re-derived from which rulings exist. That is why a hand-edited file cannot close a finding nobody ruled on, and why the three reconciliation claims above are checked against the live total on every render (${report.checks.reconciles && report.checks.reviewed && report.checks.rowsMatch ? 'they hold' : 'THEY DO NOT HOLD — see the Board banner'}).`),
    }),
    report.refusals && (report.refusals.danglingObjective.length || report.refusals.danglingEnvelope.length || report.refusals.unknownLine.length || report.refusals.unreadableWeight.length)
      ? card({
        title: 'Refusals — every one printed, none dropped',
        body: h('ul', { class: 'stack-tight' },
          report.refusals.unknownLine.length ? h('li', null, `${report.refusals.unknownLine.length} charter(s) name a line manager who is not on the active roster. They are counted out, never attached to a guess.`) : null,
          report.refusals.danglingObjective.length ? h('li', null, `${report.refusals.danglingObjective.length} charter(s) point at an objective that no longer exists. The lever is still compared; the deleted pointer is printed.`) : null,
          report.refusals.danglingEnvelope.length ? h('li', null, `${report.refusals.danglingEnvelope.length} charter(s) claim an envelope that no longer exists. The claim is not counted.`) : null,
          report.refusals.unreadableWeight.length ? h('li', null, `${report.refusals.unreadableWeight.length} multi-line person(s) have a charter with no declared weight, so their total is refused rather than summed.`) : null),
      })
      : null,
  );
}

/* -------------------------------------------------------------------- render */

export function renderContradiction(ctx) {
  apiRef = ctx.api;
  const result = ctx.api.contradictionReport?.();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Governance', title: 'Contradiction audit' }),
      banner({ tone: 'bad', title: 'This page is not available', body: result?.error || 'The contradiction audit could not be built.' }));
  }
  const report = result.report;
  const panel = panelFor(ctx.query);
  const focusKey = findingKeyFor(ctx.query);
  const t = report.totals;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Governance',
      title: 'Contradiction audit',
      subtitle: 'Two lines chartered to pull the same lever opposite ways — measured, printed, and ruled on once instead of re-argued every quarter.',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onClick: exportCsv }, 'Download CSV'),
        h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => declareDialog(ctx) }, 'Declare a charter'),
      ],
      meta: h('div', { class: 'row-actions' },
        badge(report.isMatrix ? `${t.lineN} lines under audit` : 'single-chain — nothing to compare', report.isMatrix ? 'neutral' : 'warn'),
        badge(t.incompatibleN ? `${t.incompatibleN} incompatible` : 'no provable contradiction', t.incompatibleN ? 'bad' : 'good'),
        t.attentionN ? badge(`${t.attentionN} awaiting a ruling`, 'warn') : badge('nothing awaiting a ruling', 'good'),
        h('span', { class: 'muted small' }, `read from ${report.altitudeLabel}`)),
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Contradiction audit sections' }),
    h('p', { class: 'muted small' }, PANELS.find((p) => p.key === panel)?.hint || ''),
    panel === 'board' ? boardPanel(ctx, report) : null,
    panel === 'finding' ? findingPanel(ctx, report, focusKey) : null,
    panel === 'log' ? logPanel(ctx, report) : null,
    panel === 'method' ? methodPanel(ctx, report) : null,
  );
}

export default renderContradiction;
