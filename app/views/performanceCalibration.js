/**
 * app/views/performanceCalibration.js — `#/performance-calibration`, the
 * Performance Calibration Decision Register (ADR-0261, Schema v213).
 *
 * ONE reader (`buildCalibration`) stands behind every distribution, kappa,
 * bias ratio, state and day count this page prints. The page formats what the
 * reader returned; it computes no state, no distribution and no ratio of its
 * own.
 *
 * THE THINGS THIS SCREEN KEEPS APART
 *  - the PROPOSED rating (the manager's assessment on the review) and the
 *    CALIBRATED rating (the committee's decision beside it, with rationale);
 *  - the DISTRIBUTION (counts per rating, derived) and the BIAS ratio
 *    (four-fifths with its counts, or refused with its reason);
 *  - the AGREEMENT (kappa where two lines rated the same person, or refused
 *    below the floor) and the DIVERGENCE (two proposals two steps apart,
 *    never averaged).
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a proposed rating is
 * calibrated: it prints `uncalibrated` until a human records a decision with
 * rationale. It never averages two divergent proposals. It never prints a
 * kappa or a bias ratio below its floor. It never scores a person on worth.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  CAL_CSV_SCOPE,
  CAL_HREF,
  CAL_LIMITS,
  CAL_RATING_KEYS,
  CAL_RATING_LABELS,
  CAL_SESSION_STATUS_KEYS,
  CAL_STATE_BY_KEY,
} from '../core/domain/calRegistry.js';
import { dayLabel } from '../core/domain/calMath.js';

const L = CAL_LIMITS;
const DIAGRAM_URL = './app/assets/performance-calibration-method.jpg';
const VIEWS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'method', label: 'Method' },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []), ...rows.map((row) => ({ value: row.value, label: row.label })),
];

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(stateKey) {
  const state = CAL_STATE_BY_KEY[stateKey];
  if (!state) return h('span', { class: 'badge badge-neutral' }, stateKey);
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.detail,
    'data-testid': `cal-state-${state.key}`,
  }, state.label);
}

function ratingBadge(rating) {
  if (!rating) return h('span', { class: 'badge badge-neutral' }, '—');
  return h('span', { class: 'badge badge-neutral', 'data-testid': `cal-rating-${rating}` }, CAL_RATING_LABELS[rating] || rating);
}

/* -------------------------------------------------------------------- dialogs */

function sessionDialog(ctx, report, candidates, onDone) {
  const form = buildForm([
    { name: 'cycle', label: 'Cycle label', type: 'text', required: true, help: 'As declared — for example H2-2026.' },
    { name: 'title', label: 'Session title', type: 'text', required: true, help: 'The calibration session name.' },
    { name: 'scope', label: 'Scope (as declared)', type: 'text', help: 'Which teams or people this session covers.' },
    { name: 'status', label: 'Status', type: 'select', required: true, options: options(CAL_SESSION_STATUS_KEYS.map((k) => ({ value: k, label: k }))), help: 'Open or closed.' },
    { name: 'openedOn', label: 'Opened day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the session opened.' },
    { name: 'declaredDistribution', label: 'Declared distribution target (optional)', type: 'text', help: 'As declared — for example 10% sets-standard. Its absence is printed as no target declared.' },
    {
      name: 'holders', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this session, across every reporting line. The authority to answer for it is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.recordCalSession({ ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The session was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Session recorded. Distributions and states are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a calibration session',
    description: 'The cycle, title, scope and responsible hands. Decisions are recorded separately, with rationale.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'A proposed rating is not a calibrated rating',
        body: 'The review stores the manager\'s proposal. The calibrated rating — the committee\'s decision beside it, with rationale — is recorded next.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record session', onClick: submit, primary: true }],
  });
}

function decisionDialog(ctx, report, onDone) {
  const openSessions = report.sessions.filter((s) => s.session.status === 'open').map((s) => ({ value: s.session.sessionId, label: `${s.session.cycle} — ${s.session.title}` }));
  const reviews = (ctx.state?.reviews || []).filter((r) => r.status === 'complete' && r.manager?.rating).map((r) => ({ value: r.id, label: `${r.personId} — ${CAL_RATING_LABELS[r.manager.rating] || r.manager.rating} (${r.periodStart} to ${r.periodEnd})` }));
  const form = buildForm([
    { name: 'sessionId', label: 'Session', type: 'select', required: true, options: options(openSessions, { blank: 'Choose a session' }), help: 'Only open sessions take new decisions.' },
    { name: 'reviewId', label: 'Review (proposed rating)', type: 'select', required: true, options: options(reviews, { blank: 'Choose a review' }), help: 'The completed review whose proposed rating this decision calibrates.' },
    { name: 'calibratedRating', label: 'Calibrated rating', type: 'select', required: true, options: options(CAL_RATING_KEYS.map((k) => ({ value: k, label: CAL_RATING_LABELS[k] }))), help: 'The committee\'s decision. It may equal the proposal or differ — the rationale says why.' },
    { name: 'rationale', label: 'Written rationale', type: 'textarea', rows: 4, required: true, help: 'Why this calibrated rating. A calibration nobody justified is refused.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const review = (ctx.state?.reviews || []).find((r) => r.id === values.reviewId);
    const result = ctx.api.recordCalDecision({
      sessionId: values.sessionId,
      reviewId: values.reviewId,
      personId: review?.personId || '',
      proposedRating: review?.manager?.rating || '',
      calibratedRating: values.calibratedRating,
      rationale: values.rationale,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Decision recorded with rationale. The proposed rating is unchanged.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a calibration decision',
    description: 'The committee\'s calibrated rating beside the proposed rating, with written rationale.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'Two divergent proposals are never averaged',
        body: 'If two lines proposed ratings two steps apart, the committee declares one calibrated rating with rationale — or the divergence stays printed.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record decision', onClick: submit, primary: true }],
  });
}

function closeDialog(ctx, report, onDone) {
  const openSessions = report.sessions.filter((s) => s.session.status === 'open').map((s) => ({ value: s.session.sessionId, label: `${s.session.cycle} — ${s.session.title}` }));
  const form = buildForm([
    { name: 'sessionId', label: 'Session', type: 'select', required: true, options: options(openSessions, { blank: 'Choose a session' }), help: 'Only open sessions can be closed.' },
    { name: 'closedOn', label: 'Closed day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the session closed.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.closeCalSession(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The close was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Session closed.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Close a calibration session',
    description: 'The closed day. A closed session takes no new decisions.',
    size: 'md',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Close session', onClick: submit, primary: true }],
  });
}

/* -------------------------------------------------------------------- panels */

function sessionsPanel(ctx, report) {
  const rows = report.sessions.map((s) => {
    const session = s.session;
    return {
      cycle: session.cycle,
      title: session.title,
      status: badge(session.status === 'open' ? 'Open' : 'Closed', session.status === 'open' ? 'warn' : 'neutral'),
      opened: dayLabel(session.openedOn),
      closed: dayLabel(session.closedOn),
      persons: String(s.counts.total),
      calibrated: String(s.counts.calibrated + s.counts.adjusted),
      uncalibrated: String(s.counts.uncalibrated + s.counts.divergentUncalibrated),
      overdue: String(s.counts.overdue),
    };
  });
  return h('div', { class: 'stack' },
    card({
      title: 'Calibration sessions',
      body: rows.length === 0
        ? emptyState({ title: 'No calibration sessions', body: 'Record a session to begin. Distributions and states are derived on read.' })
        : table({
            columns: ['Cycle', 'Title', 'Status', 'Opened', 'Closed', 'Persons', 'Calibrated', 'Uncalibrated', 'Overdue'],
            rows: rows.map((r) => [r.cycle, r.title, r.status, r.opened, r.closed, r.persons, r.calibrated, r.uncalibrated, r.overdue]),
          }),
    }),
  );
}

function decisionsPanel(ctx, report) {
  const rows = [];
  for (const s of report.sessions) {
    for (const row of s.rows) {
      rows.push({
        session: s.session.cycle,
        person: row.personName,
        proposed: ratingBadge(row.proposedRating),
        calibrated: ratingBadge(row.calibratedRating),
        state: stateBadge(row.state),
        rationale: row.rationale || '—',
      });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Calibration decisions',
      body: rows.length === 0
        ? emptyState({ title: 'No decisions', body: 'Record a decision with written rationale. A proposed rating is not a calibrated rating.' })
        : table({
            columns: ['Session', 'Person', 'Proposed', 'Calibrated', 'State', 'Rationale'],
            rows: rows.map((r) => [r.session, r.person, r.proposed, r.calibrated, r.state, r.rationale]),
          }),
    }),
  );
}

function distributionsPanel(ctx, report) {
  const enterprise = report.enterprise;
  const proposed = enterprise.proposedDist;
  const calibrated = enterprise.calibratedDist;
  return h('div', { class: 'stack' },
    card({
      title: 'Rating distributions (derived, never stored)',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Proposed total: ${proposed.total}. Calibrated total: ${calibrated.total}. Counts re-add to their rows; figuresComplete is separate from balances.`),
        table({
          columns: ['Rating', 'Proposed', 'Calibrated'],
          rows: CAL_RATING_KEYS.map((k) => [CAL_RATING_LABELS[k], String(proposed.counts[k]), String(calibrated.counts[k])]),
        }),
        h('p', { class: 'muted small' }, `Unknown proposed: ${proposed.counts.unknown}. Unknown calibrated: ${calibrated.counts.unknown}.`),
      ),
    }),
    card({
      title: 'Agreement and bias (refused below the floor)',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, 'Cohen\'s kappa measures inter-rater agreement where two lines rated the same person. Four-fifths compares favourable rates across declared groups. Both are refused below their floors — never printed as a number without the arithmetic.'),
        h('p', { class: 'muted small' }, 'Kappa and bias are computed per session on read. See each session\'s derived figures.'),
      ),
    }),
  );
}

function methodPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Method',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Performance calibration method illustration (illustrative, not operational evidence)', class: 'method-diagram' }),
        h('p', { class: 'muted small' }, 'Method illustration — illustrative, not operational evidence.'),
        h('p', null, 'Inter-rater reliability (Cohen 1960, Cohen\'s kappa). Adverse impact (four-fifths rule, EEOC 1978). Tournament theory (Lazear & Rosen 1981). Procedural justice (Leventhal 1980, Colquitt et al. 2001).'),
        h('p', { class: 'muted' }, 'A proposed rating is not a calibrated rating. Two divergent proposals are never averaged. Agreement is measured, not asserted. Bias is a ratio with counts, not a colour.'),
      ),
    }),
  );
}

/* -------------------------------------------------------------------- render */

export function renderPerformanceCalibration(ctx) {
  const report = ctx.calibrationReport || { sessions: [], markers: [], warnings: [], conventions: {}, today: '', enterprise: { proposedDist: { counts: {}, total: 0 }, calibratedDist: { counts: {}, total: 0 }, totalPersons: 0, totalSessions: 0, totalDecisions: 0 } };
  const view = ctx.query?.get?.('view') || 'sessions';
  const candidates = (ctx.state?.people || []).map((p) => ({ id: p.id, name: p.name, role: p.role || '' }));
  const active = VIEWS.find((v) => v.key === view) || VIEWS[0];

  const header = pageHeader({
    title: 'Performance calibration',
    subtitle: 'The committee\'s decision beside the manager\'s proposal, with rationale — distributions, agreement and bias derived on read, never stored.',
    actions: [
      button('Record session', () => sessionDialog(ctx, report, candidates, () => ctx.refresh?.()), { primary: true, testid: 'cal-record-session' }),
      button('Record decision', () => decisionDialog(ctx, report, () => ctx.refresh?.()), { testid: 'cal-record-decision' }),
      button('Close session', () => closeDialog(ctx, report, () => ctx.refresh?.()), { testid: 'cal-close-session' }),
      button('Export CSV', () => {
        const csv = exportWorkspaceCsv(ctx.state, CAL_CSV_SCOPE, { now: new Date() });
        downloadText(csv, 'performance-calibration.csv', 'text/csv');
        toast('CSV exported (aggregate, identity-free, floored).', 'good');
      }, { testid: 'cal-export' }),
    ],
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Sessions', value: String(report.enterprise.totalSessions), hint: 'calibration sessions on the register' }),
    stat({ label: 'Persons', value: String(report.enterprise.totalPersons), hint: 'distinct persons across sessions' }),
    stat({ label: 'Decisions', value: String(report.enterprise.totalDecisions), hint: 'calibrated ratings with rationale' }),
    stat({ label: 'Proposed', value: String(report.enterprise.proposedDist.total), hint: 'proposed ratings in scope' }),
  );

  let panel;
  if (active.key === 'sessions') panel = sessionsPanel(ctx, report);
  else if (active.key === 'decisions') panel = decisionsPanel(ctx, report);
  else if (active.key === 'distributions') panel = distributionsPanel(ctx, report);
  else panel = methodPanel(ctx, report);

  return h('div', { class: 'page', 'data-testid': 'performance-calibration-page' },
    header,
    stats,
    tabs({ items: VIEWS, active: active.key, onSelect: (key) => { window.location.hash = `${CAL_HREF}?view=${key}`; }, ariaLabel: 'Calibration register sections' }),
    panel,
  );
}
