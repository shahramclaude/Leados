/**
 * app/views/hiring.js — Selection & hiring workspace (`#/hiring`, `#/hiring/:id`).
 *
 * The view is deliberately built around three questions a leader actually has:
 *   1. Which roles are open, and what are they costing? (funnel + vacancy)
 *   2. What evidence do I have on each candidate, and what is missing?
 *   3. What happens when I decide? (decision dialog + propagation)
 *
 * Every number shown is derived from records; anything unmeasured says so.
 */

import { h, confirmDialog, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge } from '../ui/components.js';
import { openExportDisclosureDialog } from '../ui/export-dialogs.js';
import { formatDate } from '../core/time.js';
import {
  CANDIDATE_OUTCOME_LABELS,
  CANDIDATE_STAGE_LABELS,
  EVIDENCE_KIND_LABELS,
  REQUISITION_REASON_LABELS,
  REQUISITION_STATUS_LABELS,
  assessCandidate,
  hiringSummary,
  isOpenCandidate,
  measurableEffort,
  requisitionSummary,
} from '../core/domain/hiring.js';
import { LEVEL_LABELS } from '../core/schema.js';
import { AUTOMATION_RULES } from '../core/domain/automation.js';
import { linksForEntity } from '../core/domain/cases.js';
import {
  openAcceptOfferDialog,
  openCandidateDialog,
  openEvidenceDialog,
  openHiringDecisionDialog,
  openRequisitionDialog,
} from '../ui/hiring-modals.js';

const TONE_BY_DIRECTION = { 'leans-yes': 'good', unclear: 'neutral', 'leans-no': 'caution' };
const BAND_LABEL = { thin: 'thin', moderate: 'moderate', strong: 'strong' };

function money(currency, amount) {
  return `${currency} ${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function statusBadge(status) {
  const tone = status === 'filled' ? 'good' : status === 'cancelled' ? 'neutral' : status === 'offer' ? 'caution' : 'info';
  return badge(REQUISITION_STATUS_LABELS[status] || status, tone);
}

function directionBadge(assessment) {
  const label = assessment.direction === 'leans-yes'
    ? 'leaning yes'
    : assessment.direction === 'leans-no'
      ? 'leaning no'
      : 'inconclusive';
  return badge(label, TONE_BY_DIRECTION[assessment.direction] || 'neutral', 'Evidence-weighted estimate, not a prediction');
}

function linksStrip(links, ctx) {
  if (!links.length) return h('p', { class: 'muted tiny' }, 'No cross-module links yet.');
  return h(
    'div',
    { class: 'link-strip' },
    ...links.map((item) => h(
      'a',
      {
        class: 'link-pill',
        href: item.peer.route,
        onClick: (event) => {
          event.preventDefault();
          ctx.navigate(item.peer.route);
        },
      },
      h('span', { class: 'link-pill-rel' }, item.relationLabel),
      h('strong', null, item.peer.title),
    )),
  );
}

function funnelLine(funnel) {
  if (!funnel.total) return 'No candidates yet.';
  return `${funnel.total} candidate(s) · ${funnel.active} active · ${funnel.reached.interviewing} interviewed · ${funnel.reached.offer} at offer · ${funnel.reached.hired} hired`;
}

function conversionTable(funnel) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table-tight' },
      h('caption', { class: 'sr-only' }, 'Funnel conversion for this role'),
      h(
        'thead',
        null,
        h('tr', null, h('th', { scope: 'col' }, 'Step'), h('th', { scope: 'col' }, 'Rate'), h('th', { scope: 'col' }, 'Count')),
      ),
      h(
        'tbody',
        null,
        ...funnel.conversions.map((step) => h(
          'tr',
          null,
          h('th', { scope: 'row' }, step.label),
          h('td', null, step.rate === null ? 'no data' : `${Math.round(step.rate * 100)}%`),
          h('td', null, `${step.numerator} of ${step.denominator}`),
        )),
      ),
    ),
  );
}

function evidenceTable(candidate, requisition, audit) {
  if (!candidate.signals.length) {
    return h('p', { class: 'muted small' }, 'No evidence recorded yet. An opinion without a written observation cannot be reviewed, and cannot be fairly challenged.');
  }
  const competencyName = (id) => (requisition.competencies || []).find((c) => c.id === id)?.name || 'General';
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table table-tight' },
      h('caption', { class: 'sr-only' }, `Evidence recorded for ${candidate.name}`),
    h(
      'thead',
      null,
      h('tr', null,
        h('th', { scope: 'col' }, 'Date'),
        h('th', { scope: 'col' }, 'Method'),
        h('th', { scope: 'col' }, 'Competency'),
        h('th', { scope: 'col' }, 'Rating'),
        h('th', { scope: 'col' }, 'Weight'),
        h('th', { scope: 'col' }, 'Note'),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')),
      ),
    ),
    h(
      'tbody',
      null,
      ...candidate.signals.map((signal) => {
        const contribution = audit.contributions.find((c) => c.signalId === signal.id);
        return h(
          'tr',
          null,
          h('th', { scope: 'row' }, signal.date ? formatDate(signal.date) : 'undated'),
          h('td', null, EVIDENCE_KIND_LABELS[signal.kind] || signal.kind),
          h('td', null, competencyName(signal.competencyId)),
          h('td', null, `${signal.rating}/5`),
          h('td', { title: contribution?.repeatedReason || 'independent observation' }, contribution ? contribution.contribution.toFixed(2) : '0.00'),
          h('td', null, signal.note || h('span', { class: 'muted' }, '—')),
          h('td', null, h(
            'button',
            {
              class: 'btn btn-tiny btn-ghost',
              type: 'button',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Remove this evidence record?',
                  message: 'The record is removed from the estimate. The deletion itself stays in the audit history, because removing evidence is also a decision.',
                  confirmLabel: 'Remove evidence',
                  danger: true,
                });
                if (!ok) return;
                const res = ctx.api.deleteEvidence(candidate.id, signal.id);
                if (res.ok) toast('Evidence record removed.', 'good');
                else toast(res.error, 'bad');
              },
            },
            'Remove',
          )),
        );
      }),
    ),
    ),
  );
}

function assessmentCard(ctx, requisition, candidate) {
  const assessment = assessCandidate(candidate, requisition, { prior: ctx.state.settings?.hiringBaseRate });
  const { audit, coverage } = assessment;
  return h(
    'div',
    { class: 'stack-sm', id: `candidate-${candidate.id}` },
    h(
      'div',
      { class: 'row-between wrap' },
      h('div', null,
        h('h3', { class: 'card-title' }, candidate.name),
        h('p', { class: 'muted small' }, `${CANDIDATE_STAGE_LABELS[candidate.stage]} · in process since ${formatDate(candidate.appliedOn)}${candidate.source ? ` · ${candidate.source}` : ''}`),
      ),
      h('div', { class: 'row-gap' }, directionBadge(assessment), isOpenCandidate(candidate)
        ? h('button', { class: 'btn btn-tiny btn-secondary', type: 'button', onClick: () => openEvidenceDialog(ctx, { requisition, candidate }) }, 'Record evidence')
        : null),
    ),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Evidence estimate', value: `${Math.round(audit.posterior * 100)}%`, hint: `${audit.band} band (${audit.totalWeight.toFixed(2)} weight)` }),
      stat({ label: 'Observations', value: String(audit.signalCount), hint: `${audit.distinctKinds} method(s) · ${audit.raterCount} rater(s)` }),
      stat({
        label: 'Competency coverage',
        value: coverage.measured ? `${coverage.pct}%` : 'n/a',
        hint: coverage.measured ? `${coverage.rows.filter((r) => r.covered).length} of ${coverage.rows.length} assessed` : 'no competencies on the role',
      }),
    ),
    coverage.measured
      ? h(
          'ul',
          { class: 'list-tight small' },
          ...coverage.rows.map((row) => h(
            'li',
            { class: row.covered ? '' : 'tone-caution' },
            `${row.name} (weight ${row.weight}${row.required ? '' : ', optional'}) — ${row.covered ? `${row.evidenceCount} observation(s)` : 'not assessed'}`,
          )),
        )
      : null,
    assessment.blockers.length
      ? h(
          'div',
          { class: 'banner banner-warn', role: 'status' },
          h('strong', null, 'What is missing'),
          h('ul', { class: 'list-tight' }, ...assessment.blockers.map((b) => h('li', null, b.message))),
        )
      : h('p', { class: 'muted small' }, 'Evidence meets the app’s offer convention. The decision is still yours.'),
    assessment.warnings.length
      ? h('ul', { class: 'list-tight small muted' }, ...assessment.warnings.map((w) => h('li', null, w.message)))
      : null,
    assessment.flip && assessment.flip.direction !== 'none'
      ? h('p', { class: 'muted small' }, `Falsification check: ${assessment.flip.count} more strong ${assessment.flip.kindLabel.toLowerCase()} observation(s) at the opposite extreme would cross the 50% line.`)
      : null,
    h('h4', { class: 'sub-title' }, 'Recorded evidence'),
    evidenceTable(candidate, requisition, audit),
    h(
      'div',
      { class: 'row-gap' },
      isOpenCandidate(candidate)
        ? h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openHiringDecisionDialog(ctx, { requisition, candidate }) }, 'Record a decision')
        : null,
      candidate.stage === 'offer'
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAcceptOfferDialog(ctx, { requisition, candidate }) }, 'Offer accepted')
        : null,
      isOpenCandidate(candidate)
        ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCandidateDialog(ctx, { requisition, candidate }) }, 'Edit candidate')
        : null,
      !candidate.personId
        ? h(
            'button',
            {
              class: 'btn btn-ghost',
              type: 'button',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: `Delete ${candidate.name}’s record?`,
                  message: 'This removes the candidate record, its evidence and any links. Data minimisation is a real obligation: once a process ends, keeping it without a reason is a liability, not an archive.',
                  confirmLabel: 'Delete record',
                  danger: true,
                });
                if (!ok) return;
                const res = ctx.api.deleteCandidate(candidate.id);
                if (res.ok) toast('Candidate record deleted.', 'good');
                else toast(res.error, 'bad');
              },
            },
            'Delete record',
          )
        : null,
    ),
    candidate.decision?.outcome && candidate.decision.outcome !== 'pending'
      ? h('p', { class: 'muted small' },
        `Last decision: ${CANDIDATE_OUTCOME_LABELS[candidate.decision.outcome] || candidate.decision.outcome}${candidate.decision.decidedOn ? ` on ${formatDate(candidate.decision.decidedOn)}` : ''}. ${candidate.decision.rationale}${candidate.decision.evidenceGapAcknowledged ? ' (Proceeded with acknowledged evidence gaps.)' : ''}`)
      : null,
  );
}

/* --------------------------------------------------------------- index view */

function renderIndex(ctx) {
  const now = ctx.now;
  const summary = hiringSummary(ctx.state, { now, settings: ctx.state.settings || {} });
  const active = summary.summaries.filter((row) => row.active);
  const closed = summary.summaries.filter((row) => !row.active);

  const exportHiringCsv = async () => {
    const decision = await openExportDisclosureDialog(ctx, {
      format: 'csv',
      csvScope: 'hiring',
      csvLabel: 'Hiring & Candidates',
      mode: 'download',
    });
    if (!decision.confirmed) return;
    const result = ctx.exportCSV('hiring', decision.redactions);
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: result.filename });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`Downloaded ${result.filename} (${result.rowCount} row${result.rowCount === 1 ? '' : 's'})`, 'good');
        return;
      }
    } catch {
      /* fall through to copyable modal */
    }
    const form = buildForm([
      {
        name: 'csv',
        label: `${result.label} (${result.filename} · ${result.rowCount} row${result.rowCount === 1 ? '' : 's'})`,
        type: 'textarea',
        rows: 12,
        value: result.csv,
      },
    ]);
    openModal({
      title: `CSV export — ${result.label}`,
      description: 'Select all and copy into a .csv file or spreadsheet.',
      body: form.node,
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
      size: 'lg',
    });
  };

  const header = pageHeader({
    eyebrow: 'Selection & hiring',
    title: 'Hiring',
    subtitle: 'Every role you open spends the team’s interview capacity. This is where the evidence, the decision and the capacity stay connected.',
    actions: [
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openRequisitionDialog(ctx) }, 'Open a role'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportHiringCsv }, 'Export hiring CSV'),
      h(
        'button',
        {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx.api.syncHiring();
            if (!res.ok) {
              toast(res.error, 'bad');
              return;
            }
            const n = res.propagations.length;
            const e = res.escalations.length;
            toast(`${n} capacity update(s) reconciled${e ? `; ${e} stalled role(s) escalated to an operational case` : ''}.`, 'good');
          },
        },
        'Sync rules',
      ),
    ],
  });

  const stats = h(
    'div',
    { class: 'stat-row' },
    stat({ label: 'Active roles', value: String(active.length), hint: `${summary.openCandidates} candidate(s) in process` }),
    stat({ label: 'Decisions waiting', value: String(summary.needsDecision.length), hint: 'Candidates at final or offer stage' }),
    stat({
      label: 'Interview effort in the plan',
      value: `${summary.plannedInterviewDays}`,
      hint: summary.unmeasuredEffort.length ? `${summary.unmeasuredEffort.length} role(s) with no estimate` : 'person-days reserved',
    }),
    stat({
      label: 'Vacancy exposure',
      value: summary.vacancyMeasured ? money(summary.vacancyCurrency, summary.vacancyExposure) : 'unmeasured',
      hint: summary.vacancyMeasured ? 'Recorded cost of empty seats, to date' : 'No daily cost recorded on any role',
    }),
  );

  const empty = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-body stack-sm' },
      h('h2', { class: 'card-title' }, 'No roles open yet'),
      h('p', { class: 'muted' }, 'A requisition is a decision to spend interview time on a seat. Opening one asks what the role must be able to do, who will interview, and what the role costs the team while it is empty — so the hiring decision and the capacity decision stay one decision.'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openRequisitionDialog(ctx) }, 'Open your first role'),
    ),
  );

  const cards = active.map((row) => {
    const { requisition, funnel } = row;
    const effort = measurableEffort(requisition.effortDays);
    return card({
      title: requisition.title,
      subtitle: `${LEVEL_LABELS[requisition.level] || requisition.level} · ${REQUISITION_REASON_LABELS[requisition.reason] || requisition.reason} · open ${funnel.daysOpen} day(s)`,
      className: 'hiring-card',
      actions: [
        statusBadge(requisition.status),
        h('button', { class: 'btn btn-tiny btn-secondary', type: 'button', onClick: () => ctx.navigate(`#/hiring/${requisition.id}`) }, 'Open role'),
      ],
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', { class: 'muted small' }, funnelLine(funnel)),
        h(
          'div',
          { class: 'kv-list' },
          h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Target start'), h('span', { class: 'kv-value' }, requisition.targetStartOn ? formatDate(requisition.targetStartOn) : 'not set')),
          h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Days since movement'), h('span', { class: `kv-value ${funnel.stalled ? 'tone-caution' : ''}` }, String(funnel.daysSinceActivity ?? '—'))),
          h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Interview effort'), h('span', { class: 'kv-value' }, effort ? `${effort.mostLikely} person-day(s)` : 'not estimated')),
          h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Vacancy cost'), h('span', { class: 'kv-value' }, funnel.vacancy.measured ? money(funnel.vacancy.currency, funnel.vacancy.cost) : 'unmeasured')),
        ),
        funnel.targetSlipDays !== null && funnel.targetSlipDays > 0
          ? h('p', { class: 'tone-caution small' }, `${funnel.targetSlipDays} day(s) past the target start. Either the date or the plan it protects has to move.`)
          : null,
        row.needDecision.length
          ? h('p', { class: 'small' }, `${row.needDecision.length} candidate(s) at a decision point: ${row.needDecision.map((r) => r.candidate.name).join(', ')}.`)
          : null,
        h('div', { class: 'row-gap' },
          h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => openCandidateDialog(ctx, { requisition }) }, 'Add candidate'),
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openRequisitionDialog(ctx, { requisition }) }, 'Edit role'),
        ),
      ),
    });
  });

  const closedCard = closed.length
    ? card({
        title: 'Closed roles',
        subtitle: 'Kept as history: fills, cancellations and the evidence behind them.',
        body: h(
          'ul',
          { class: 'list-tight' },
          ...closed.map((row) => h(
            'li',
            null,
            h(
              'button',
              { class: 'linkish', type: 'button', onClick: () => ctx.navigate(`#/hiring/${row.requisition.id}`) },
              row.requisition.title,
            ),
            ' ',
            statusBadge(row.requisition.status),
            h('span', { class: 'muted small' }, ` · ${row.funnel.total} candidate(s) · closed ${row.requisition.closedOn ? formatDate(row.requisition.closedOn) : 'date unknown'}`),
          )),
        ),
      })
    : null;

const retentionCard = summary.retention.enabled
    ? card({
        title: 'Data minimisation: candidate records past your window',
        subtitle: `${summary.retention.windowDays}-day retention window. Nothing is deleted automatically — you decide, record by record.`,
        actions: [badge(summary.retention.count ? `${summary.retention.count} to review` : 'nothing due', summary.retention.count ? 'caution' : 'good')],
        body: h(
          'div',
          { class: 'stack-sm', id: 'retention' },
          h('p', { class: 'muted small' }, summary.retention.reason),
          summary.retention.count
            ? h(
                'div',
                { class: 'table-wrap' },
                h(
                  'table',
                  { class: 'table table-tight' },
                  h('caption', { class: 'sr-only' }, 'Candidate records past the retention window, with their age and a delete action'),
                  h('thead', null, h('tr', null,
                    h('th', { scope: 'col' }, 'Candidate'),
                    h('th', { scope: 'col' }, 'Role'),
                    h('th', { scope: 'col' }, 'Last recorded fact'),
                    h('th', { scope: 'col' }, 'Age'),
                    h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')),
                  )),
                  h('tbody', null, ...summary.retention.due.map((row) => h(
                    'tr',
                    null,
                    h('td', null, h('strong', null, row.candidate.name)),
                    h('td', null, row.requisition ? row.requisition.title : 'role no longer exists'),
                    h('td', null, formatDate(row.anchorOn)),
                    h('td', { class: 'tone-caution' }, `${row.ageDays} days`),
                    h('td', null, h(
                      'button',
                      {
                        class: 'btn btn-tiny btn-ghost',
                        type: 'button',
                        'aria-label': `Delete record — Delete the record for ${row.candidate.name}`,
                        onClick: async () => {
                          const ok = await confirmDialog({
                            title: `Delete ${row.candidate.name}’s record?`,
                            message: `Last recorded fact: ${formatDate(row.anchorOn)} (${row.ageDays} days ago). This removes the candidate record, its ${row.candidate.signals.length} piece(s) of evidence and any graph links. The deletion is logged, but the record itself cannot be recovered from inside the app.`,
                            confirmLabel: 'Delete record',
                            danger: true,
                          });
                          if (!ok) return;
                          const res = ctx.api.deleteCandidate(row.candidate.id);
                          if (res.ok) toast(`${row.candidate.name}’s record deleted.`, 'good');
                          else toast(res.error, 'bad');
                        },
                      },
                      'Delete record',
                    )),
                  ))),
                ),
              )
            : null,
          summary.retention.exempt.length
            ? h('p', { class: 'muted small' }, `${summary.retention.exempt.length} record(s) are exempt because you marked them “keep in touch”: ${summary.retention.exempt.map((r) => r.candidate.name).join(', ')}. Keeping a record on purpose is a decision — it is listed here so it stays one.`)
            : null,
        ),
      })
    : card({
        title: 'Data minimisation is switched off',
        subtitle: 'Candidate retention review is disabled (0 days in Settings).',
        body: h('p', { class: 'muted small' }, 'Candidate records are the most sensitive notes in this workspace. With the review off, nothing will ever prompt you to look at records from roles that closed long ago. Set a window in Settings if you want the reminder — it still never deletes anything for you.'),
      });

  const rules = card({
    title: 'Automation active on this module',
    subtitle: 'These rules run inside the same event engine as every other module.',
    body: h(
      'ul',
      { class: 'list-tight' },
      ...AUTOMATION_RULES.filter((rule) => rule.id.startsWith('RULE-HIRE')).map((rule) => h(
        'li',
        null,
        h('strong', null, `${rule.id} · ${rule.name}`),
        h('p', { class: 'muted small' }, rule.description),
      )),
    ),
  });

  return h('div', { class: 'stack' }, header, stats, active.length ? h('div', { class: 'card-grid' }, ...cards) : empty, retentionCard, closedCard, rules);
}

/* -------------------------------------------------------------- detail view */

function renderDetail(ctx, requisition) {
  const now = ctx.now;
  const settings = ctx.state.settings || {};
  const candidates = (ctx.state.candidates || []).filter((c) => c.reqId === requisition.id);
  const row = requisitionSummary(requisition, candidates, { now, settings });
  const { funnel, parity } = row;
  const activeCandidates = candidates.filter(isOpenCandidate);
  const closedCandidates = candidates.filter((c) => !isOpenCandidate(c));
  const selectedId = ctx.query?.get?.('candidate') || null;
  const selected = candidates.find((c) => c.id === selectedId) || null;
  const links = linksForEntity(ctx.state, 'requisition', requisition.id);
  const effort = measurableEffort(requisition.effortDays);

  const header = pageHeader({
    eyebrow: `${LEVEL_LABELS[requisition.level] || requisition.level} · ${REQUISITION_REASON_LABELS[requisition.reason] || requisition.reason}`,
    title: requisition.title,
    subtitle: `${requisition.team || 'Team not recorded'} · opened ${formatDate(requisition.openedOn)}${requisition.closedOn ? ` · closed ${formatDate(requisition.closedOn)}` : ''}`,
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/hiring') }, '← All roles'),
      statusBadge(requisition.status),
      row.active
        ? h('a', { class: 'btn btn-ghost', href: `#/scenarios?hireReq=${encodeURIComponent(requisition.id)}` }, 'Simulate Brooks hire')
        : null,
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openRequisitionDialog(ctx, { requisition }) }, 'Edit role'),
      row.active
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openCandidateDialog(ctx, { requisition }) }, 'Add candidate')
        : null,
    ].filter(Boolean),
  });

  const stats = h(
    'div',
    { class: 'stat-row' },
    stat({ label: 'Days open', value: String(funnel.daysOpen ?? '—'), hint: funnel.lastActivityOn ? `last movement ${formatDate(funnel.lastActivityOn)}` : 'no activity recorded' }),
    stat({
      label: 'Cycle time',
      value: funnel.cycleMedianDays === null ? 'not measured' : `${funnel.cycleMedianDays}d`,
      hint: funnel.cycleMedianDays === null ? funnel.cycleReason : `median of ${funnel.cycleObservations} completed hire(s)`,
    }),
    stat({ label: 'Interview effort', value: effort ? `${effort.mostLikely}d` : 'not estimated', hint: effort ? `PERT ${effort.optimistic}/${effort.mostLikely}/${effort.pessimistic}` : row.effortSuggested.measured ? `suggested ≈${row.effortSuggested.mostLikely}d` : 'no pipeline to estimate from' }),
    stat({
      label: 'Vacancy cost',
      value: funnel.vacancy.measured ? money(funnel.vacancy.currency, funnel.vacancy.cost) : 'unmeasured',
      hint: funnel.vacancy.measured ? `${funnel.vacancy.daily}/day over ${funnel.vacancy.days} day(s)` : 'no daily cost recorded',
    }),
  );

  const candidatesCard = card({
    title: 'Candidates',
    subtitle: 'Evidence is weighted by method; the estimate is decision support, not a prediction.',
    body: h(
      'div',
      { class: 'stack-sm' },
      h('p', { class: 'muted small' }, funnelLine(funnel)),
      activeCandidates.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'table' },
              h('caption', { class: 'sr-only' }, 'Candidates in this role'),
              h('thead', null, h('tr', null,
                h('th', { scope: 'col' }, 'Candidate'),
                h('th', { scope: 'col' }, 'Stage'),
                h('th', { scope: 'col' }, 'Observations'),
                h('th', { scope: 'col' }, 'Evidence'),
                h('th', { scope: 'col' }, 'Coverage'),
                h('th', { scope: 'col' }, 'Read'),
                h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Actions')),
              )),
              h(
                'tbody',
                null,
                ...activeCandidates.map((candidate) => {
                  const assessment = assessCandidate(candidate, requisition, { prior: settings.hiringBaseRate });
                  return h(
                    'tr',
                    { class: selected?.id === candidate.id ? 'is-selected' : '' },
                    h('th', { scope: 'row' }, candidate.name),
                    h('td', null, CANDIDATE_STAGE_LABELS[candidate.stage]),
                    h('td', null, String(assessment.audit.signalCount)),
                    h('td', null, `${Math.round(assessment.audit.posterior * 100)}% · ${BAND_LABEL[assessment.audit.band]}`),
                    h('td', null, assessment.coverage.measured ? `${assessment.coverage.pct}%` : 'n/a'),
                    h('td', null, directionBadge(assessment)),
                    h('td', null, h('button', { class: 'btn btn-tiny btn-secondary', type: 'button', onClick: () => ctx.navigate(`#/hiring/${requisition.id}?candidate=${candidate.id}`) }, 'Open')),
                  );
                }),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, 'No active candidates. Add one to start recording evidence.'),
      closedCandidates.length
        ? h(
            'details',
            { class: 'disclosure' },
            h('summary', null, `${closedCandidates.length} closed candidate record(s)`),
            h(
              'ul',
              { class: 'list-tight small' },
              ...closedCandidates.map((c) => h('li', null,
                h('button', { class: 'linkish', type: 'button', onClick: () => ctx.navigate(`#/hiring/${requisition.id}?candidate=${c.id}`) }, c.name),
                ` — ${CANDIDATE_STAGE_LABELS[c.stage]}${c.decision?.decidedOn ? ` on ${formatDate(c.decision.decidedOn)}` : ''}`,
              )),
            ),
          )
        : null,
    ),
  });

  const competenciesCard = card({
    title: 'What this role must be able to do',
    subtitle: 'The same list for every candidate is what makes the process structured.',
    body: requisition.competencies.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table table-tight' },
            h('caption', { class: 'sr-only' }, 'Competencies and coverage across candidates'),
            h('thead', null, h('tr', null,
              h('th', { scope: 'col' }, 'Competency'),
              h('th', { scope: 'col' }, 'Weight'),
              h('th', { scope: 'col' }, 'Required'),
              h('th', { scope: 'col' }, 'Candidates assessed'),
            )),
            h('tbody', null, ...(parity.measured ? parity.rows : requisition.competencies.map((c) => ({
              competencyId: c.id,
              name: c.name,
              weight: c.weight,
              required: c.required,
              covered: activeCandidates.filter((cand) => cand.signals.some((s) => s.competencyId === c.id)).length,
              total: activeCandidates.length,
            }))).map((r) => {
              const competency = requisition.competencies.find((c) => c.id === r.competencyId) || r;
              return h('tr', null,
                h('th', { scope: 'row' }, r.name),
                h('td', null, String(competency.weight ?? '—')),
                h('td', null, competency.required === false ? 'optional' : 'required'),
                h('td', null, r.total ? `${r.covered} of ${r.total}` : 'no active candidates'),
              );
            })),
          ),
        )
      : h('p', { class: 'muted small' }, 'No competencies defined, so candidates cannot be assessed against the role.'),
  });

  const selectedCard = selected
    ? card({
        title: selected.name,
        subtitle: 'Full evidence trail, blockers and the falsification check.',
        actions: [h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/hiring/${requisition.id}`) }, 'Close')],
        body: assessmentCard(ctx, requisition, selected),
      })
    : activeCandidates.length
      ? card({
          title: 'Evidence by candidate',
          subtitle: 'Select a candidate above to see every observation, its weight and what is still missing.',
          body: h('p', { class: 'muted small' }, 'Nothing is scored on vibes: each observation carries its method’s validity weight, and repeated ratings from the same interviewer are discounted.'),
        })
      : null;

  const parityCard = parity.measured
    ? card({
        title: 'Process parity',
        subtitle: 'The fairness check this app can honestly make without storing any protected attribute.',
        body: parity.uneven.length
          ? h('ul', { class: 'list-tight' },
              ...parity.uneven.map((r) => h('li', { class: 'tone-caution' }, `${r.name}: assessed for ${r.covered} of ${r.total} candidates who reached the interview stage.`)))
          : h('p', { class: 'muted small' }, `All ${parity.candidatesCompared} candidates who reached the interview stage were assessed on the same competencies.`),
      })
    : null;

  const linksCard = card({
    title: 'Cross-module links',
    subtitle: 'Created by the rules engine, not by hand.',
    body: linksStrip(links, ctx),
  });

  const notesCard = requisition.notes
    ? card({ title: 'Role notes', body: h('p', { class: 'preserve-lines' }, requisition.notes) })
    : null;

  return h(
    'div',
    { class: 'stack' },
    header,
    stats,
    funnel.vacancy.measured ? null : h('p', { class: 'muted small' }, funnel.vacancy.reason),
    candidatesCard,
    selectedCard,
    competenciesCard,
    parityCard,
    linksCard,
    notesCard,
  );
}

/* -------------------------------------------------------------- entrypoints */

export function renderHiring(ctx) {
  return renderIndex(ctx);
}

export function renderHiringDetail(ctx, reqId) {
  const requisition = (ctx.state.requisitions || []).find((r) => r.id === reqId);
  if (!requisition) {
    return h(
      'div',
      { class: 'stack' },
      pageHeader({ eyebrow: 'Selection & hiring', title: 'Role not found', subtitle: 'That requisition may have been deleted.' }),
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => ctx.navigate('#/hiring') }, '← All roles'),
    );
  }
  return renderDetail(ctx, requisition);
}
