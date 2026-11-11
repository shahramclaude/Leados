/**
 * app/views/matrixHiringPanel.js — `#/matrix?panel=hiring`, Cross-Line Selection
 * Corroboration & Co-Hiring Stewardship (ADR-0176, Schema v141, `RULE-HLC-01`,
 * CSV scope #131).
 *
 * Every figure on this panel is printed straight from `hiringLineReport()` —
 * the same read model the CSV and the rule use — and nothing is recomputed here.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { hiringLineBriefText } from '../core/domain/hiringLines.js';
import {
  HIRING_LINE_LIMITS,
  HIRING_LINE_RULE_ID,
  HIRING_LINE_VERDICTS,
  HIRING_LINE_VERDICT_LABELS,
} from '../core/domain/hiringLineRegistry.js';

const VERDICT_TONES = {
  undeclared: 'neutral', unreadable: 'bad', 'line-unasked': 'bad', 'line-silent': 'warn',
  'line-represented': 'warn', divergent: 'warn', corroborated: 'good', 'single-line-heard': 'neutral',
};
const STATE_TONES = { heard: 'good', represented: 'warn', silent: 'warn', unasked: 'bad', unreadable: 'bad' };

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The co-hiring action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function openDeclareDialog(ctx, row) {
  const people = (ctx.state?.people || [])
    .filter((p) => p && p.status !== 'archived')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const currentHome = row.planLines.find((l) => l.role === 'home')?.managerId || '';
  const currentExtra = new Set(row.planLines.filter((l) => l.role === 'additional').map((l) => l.managerId));
  const homeSelect = h('select', { id: 'hlc-home', name: 'homeManagerId', class: 'input', 'data-testid': 'hlc-home' },
    h('option', { value: '' }, '— choose the home-line manager —'),
    ...people.map((p) => h('option', { value: p.id, ...(p.id === currentHome ? { selected: 'selected' } : {}) }, p.name)));
  const boxes = people.map((p) => h('label', { class: 'row gap small' },
    h('input', { type: 'checkbox', name: 'lineManagerIds', value: p.id, ...(currentExtra.has(p.id) ? { checked: 'checked' } : {}) }),
    h('span', {}, p.name)));
  const note = h('input', { id: 'hlc-note', type: 'text', class: 'input', name: 'note', maxlength: String(HIRING_LINE_LIMITS.noteMax), value: '' });
  const body = h('div', { class: 'stack' },
    h('label', { for: 'hlc-home' }, 'Home-line manager the hire will report to'),
    homeSelect,
    h('fieldset', { class: 'stack' },
      h('legend', {}, `Additional line managers (project, product or functional — up to ${HIRING_LINE_LIMITS.additionalLines})`),
      ...boxes),
    h('label', { for: 'hlc-note' }, 'Note (optional)'),
    note,
    h('p', { class: 'muted small' }, 'A plan is a dated declaration. Re-declaring appends a new act; nothing is overwritten. Leave every box unticked to declare a single-line hire.'));

  openModal({
    title: `Reporting lines for the hire — ${row.title}`,
    description: 'Declare which managers this hire will answer to. Nothing is inferred from the team name or the interview panel.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        'data-testid': 'hlc-declare-save',
        onClick: () => {
          const lineManagerIds = [...body.querySelectorAll('input[name="lineManagerIds"]')].filter((el) => el.checked).map((el) => el.value);
          const res = ctx.api?.hiringLineDeclare?.(row.reqId, { homeManagerId: homeSelect.value, lineManagerIds, note: note.value });
          if (!notify(ctx, res, 'Line plan declared.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Declare line plan'),
    ],
  });
}

function openWithdrawDialog(ctx, row) {
  const form = buildForm([
    { name: 'reason', label: 'Why is this plan withdrawn?', type: 'textarea', required: true, help: `${HIRING_LINE_LIMITS.reasonMin}–${HIRING_LINE_LIMITS.reasonMax} characters. The declaration stays in the ledger.` },
  ]);
  openModal({
    title: `Withdraw the line plan — ${row.title}`,
    description: 'The requisition will read “no line plan declared” again and open asks will close.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api?.hiringLineWithdraw?.(row.reqId, { reason: form.getValues().reason });
          if (!notify(ctx, res, 'Line plan withdrawn.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Withdraw plan'),
    ],
  });
}

function planCell(row) {
  if (!row.declared) return h('span', { class: 'muted' }, 'No line plan declared');
  return h('span', {}, row.planLines.map((l) => `${l.managerWithheld ? 'A manager outside this span' : l.managerName} (${l.role}${l.onRoster ? '' : ', left the roster'}${l.onPanel ? ', on panel' : ''})`).join(' · '));
}

function realisedCell(row) {
  if (!row.realised) return '—';
  const r = row.realised;
  const tone = r.state === 'realised' ? 'good' : r.state === 'drifted' ? 'warn' : 'bad';
  const detail = r.state === 'drifted'
    ? [r.missing.length ? `declared, not held: ${r.missing.join(', ')}` : '', r.undeclared.length ? `held, not declared: ${r.undeclared.join(', ')}` : '', r.homeMoved ? 'home line differs' : ''].filter(Boolean).join('; ')
    : '';
  return h('span', { title: r.reason }, badge(r.state === 'realised' ? 'Lines as declared' : r.state === 'drifted' ? 'Drifted' : 'Cannot be read', tone), detail ? ` ${detail}` : '');
}

export function renderMatrixHiringPanel(ctx, { now = new Date() } = {}) {
  const result = ctx?.api?.hiringLineReport?.();
  if (!result?.ok || !result.report) {
    return card({
      title: 'Co-hiring line corroboration',
      body: banner({ tone: 'bad', title: 'The co-hiring register could not be read', body: result?.error || 'The reader refused this seat.' }),
    });
  }
  const report = result.report;
  const b = report.board;
  const actions = [];
  if (report.actor.canScan && typeof ctx.api?.hiringLineScan === 'function') {
    actions.push(h('button', {
      class: 'btn btn-small btn-primary', type: 'button', 'data-testid': 'hlc-scan-btn',
      onClick: () => {
        const res = ctx.api.hiringLineScan();
        if (!notify(ctx, res, `Scanned co-hiring lines (${HIRING_LINE_RULE_ID}).`)) return;
        refreshView(ctx);
      },
    }, 'Scan lines'));
  }
  if (report.actor.canScan && typeof ctx.api?.updateSettings === 'function') {
    const paused = report.conventions.autoPropagate === false;
    actions.push(h('button', {
      class: 'btn btn-small', type: 'button', 'data-testid': 'hlc-pause-btn',
      onClick: () => {
        const res = ctx.api.updateSettings({ hiringLineAutoPropagate: paused });
        if (!notify(ctx, res, paused ? `${HIRING_LINE_RULE_ID} automatic asks resumed.` : `${HIRING_LINE_RULE_ID} automatic asks paused; an explicit scan still runs.`)) return;
        refreshView(ctx);
      },
    }, paused ? 'Resume automatic asks' : 'Pause automatic asks'));
  }
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'hlc-brief-btn',
    onClick: () => downloadText({ filename: `leados-hiring-lines-brief-${report.generatedOn}.txt`, text: hiringLineBriefText(report) }),
  }, 'Download brief'));
  actions.push(h('button', {
    class: 'btn btn-small', type: 'button', 'data-testid': 'hlc-csv-btn',
    onClick: () => {
      const res = exportWorkspaceCsv(ctx.state || {}, 'hiring-lines', { now });
      if (!res?.ok) { notify(ctx, res, ''); return; }
      downloadText({ filename: res.filename, text: res.csv });
    },
  }, 'Export CSV (#131)'));

  const reconcileBanner = report.inertNote
    ? banner({ tone: 'neutral', title: 'No line plan declared in this scope', body: report.inertNote })
    : (!b.verdictsReconcile || !b.linesReconcile)
      ? banner({ tone: 'bad', title: 'Reconciliation warning — the counts below do not add up', body: `Verdicts ${b.verdictsReconcile ? 'reconcile' : 'DO NOT reconcile'}; line states ${b.linesReconcile ? 'reconcile' : 'DO NOT reconcile'}. Treat every figure as unverified.` })
      : banner({
        tone: (b.verdicts['line-unasked'] + b.verdicts['line-silent'] + b.verdicts.unreadable + b.offersExposedN) > 0 ? 'warn' : 'good',
        title: `Verdicts reconcile (${b.candidatesReadN} candidates) · Line states reconcile (${b.linePairsN} pairs)`,
        body: h('pre', { class: 'small', 'data-testid': 'hlc-brief' }, hiringLineBriefText(report)),
      });

  const rate = b.everyLineHeardPermille === null
    ? stat({ label: 'Every line heard', value: '—', hint: b.rateWithheldReason, tone: '' })
    : stat({ label: 'Every line heard', value: `${b.everyLineHeardPermille}‰`, hint: `${b.everyLineHeardN} of ${b.testedN} tested${b.permilleRemainder ? ' · truncated' : ''}`, tone: b.everyLineHeardN === b.testedN ? 'good' : 'warn' });

  const stats = h('div', { class: 'row gap', 'data-testid': 'hlc-stats' },
    stat({ label: 'Requisitions read', value: String(b.requisitionsReadN), hint: `${b.declaredN} declared · ${b.undeclaredN} undeclared` }),
    stat({ label: 'Decision-stage candidates', value: String(b.candidatesReadN), hint: `${b.linePairsN} (candidate, line) pairs` }),
    stat({ label: 'Line never asked / silent', value: `${b.verdicts['line-unasked']} / ${b.verdicts['line-silent']}`, tone: (b.verdicts['line-unasked'] + b.verdicts['line-silent']) ? 'bad' : 'good', hint: `${b.homeOnlyLoopN} home-line-only loop(s)` }),
    stat({ label: 'Corroborated / divergent', value: `${b.verdicts.corroborated} / ${b.verdicts.divergent}`, tone: b.verdicts.divergent ? 'warn' : '' }),
    stat({ label: 'Offers exposed', value: String(b.offersExposedN), hint: 'at offer or hired with fewer judgements than declared', tone: b.offersExposedN ? 'bad' : 'good' }),
    rate,
    stat({ label: 'Hires: as declared / drifted', value: `${b.realisedN} / ${b.driftedN}`, hint: `${b.hiresReadN} read · ${b.hiresUnreadableN} unreadable`, tone: b.driftedN ? 'warn' : '' }),
    stat({ label: 'Open asks', value: String(b.openAsksN), hint: HIRING_LINE_RULE_ID }),
  );

  const verdictCard = card({
    title: 'Verdict partition',
    subtitle: `Eight closed verdicts; the counts sum to ${b.candidatesReadN}${b.verdictsReconcile ? '' : ' — THEY DO NOT'}`,
    body: table({
      caption: 'Decision-stage candidates by corroboration verdict',
      columns: [
        { label: 'Verdict', render: (v) => badge(HIRING_LINE_VERDICT_LABELS[v], VERDICT_TONES[v]) },
        { label: 'Candidates', render: (v) => h('span', { 'data-testid': `hlc-verdict-${v}` }, String(b.verdicts[v])) },
      ],
      rows: [...HIRING_LINE_VERDICTS],
    }),
  });

  const reqCard = card({
    title: 'Requisitions and their declared reporting lines',
    subtitle: report.scopeNote || `${report.rows.length} requisition(s)`,
    body: report.rows.length === 0
      ? emptyState({ title: 'No requisition in this scope', body: 'Open a requisition under Hiring, then declare which managers the hire will report to.' })
      : table({
        caption: 'Requisition line plans',
        columns: [
          { label: 'Requisition', render: (r) => h('a', { class: 'link', href: `#/hiring/${encodeURIComponent(r.reqId)}` }, r.title) },
          { label: 'Status', render: (r) => r.status },
          { label: 'Declared lines', render: (r) => planCell(r) },
          { label: 'Declared on', render: (r) => r.planDeclaredOn || '—' },
          { label: 'After the hire', render: (r) => realisedCell(r) },
          { label: 'Plan', render: (r) => (report.actor.canDeclare && r.status !== 'cancelled'
            ? h('span', { class: 'row gap' },
              h('button', { type: 'button', class: 'btn btn-tiny btn-primary', 'data-testid': `hlc-declare-${r.reqId}`, onClick: () => openDeclareDialog(ctx, r) }, r.declared ? 'Re-declare' : 'Declare lines'),
              r.declared ? h('button', { type: 'button', class: 'btn btn-tiny', onClick: () => openWithdrawDialog(ctx, r) }, 'Withdraw') : null)
            : h('span', { class: 'muted small' }, 'Operator view only')) },
        ],
        rows: report.rows,
      }),
  });

  const lineRows = report.rows.flatMap((r) => r.candidates.flatMap((c) => (c.lines.length
    ? c.lines.map((l, i) => ({ r, c, l, first: i === 0 }))
    : [{ r, c, l: null, first: true }])));
  const candidateCard = lineRows.length > 0
    ? card({
      title: 'Decision-stage candidates, line by line',
      subtitle: 'A line is heard only by its own manager’s evidence. Ratings are each manager’s lower median on the 1–5 anchors.',
      body: table({
        caption: 'Per-candidate, per-declared-line assessment state',
        columns: [
          { label: 'Requisition', render: (x) => (x.first ? x.r.title : '') },
          { label: 'Candidate', render: (x) => (x.first ? `${x.c.candidateLabel} · ${x.c.stage}` : '') },
          { label: 'Verdict', render: (x) => (x.first ? h('span', { title: x.c.reason }, badge(x.c.verdictLabel, VERDICT_TONES[x.c.verdict]), x.c.offerExposed ? badge('Offer exposed', 'bad') : null, x.c.homeOnlyLoop ? badge('Home-line-only loop', 'warn') : null) : '') },
          { label: 'Line manager', render: (x) => (x.l ? `${x.l.managerWithheld ? 'A manager outside this span' : x.l.managerName} · ${x.l.role}` : '—') },
          { label: 'State', render: (x) => (x.l ? h('span', { title: x.l.reason }, badge(x.l.stateLabel, STATE_TONES[x.l.state])) : '—') },
          { label: 'Own evidence', render: (x) => (x.l ? (x.l.ownSignalN === null ? 'Withheld' : String(x.l.ownSignalN)) : '—') },
          { label: 'Median rating', render: (x) => (x.l ? (x.l.medianRating === null ? '—' : String(x.l.medianRating)) : '—') },
          { label: 'Ask', render: (x) => (x.l && x.l.openAskTaskId ? badge('Ask open', 'warn') : '—') },
        ],
        rows: lineRows,
      }),
    })
    : null;

  return h('div', { class: 'stack', 'data-testid': 'matrix-hiring-panel' },
    reconcileBanner,
    stats,
    card({
      title: 'Co-hiring line corroboration',
      subtitle: `${report.scopeLabel} · generated ${report.generatedOn}`,
      actions,
      body: h('p', { class: 'muted small' },
        `Conventions: divergence at ${report.conventions.divergenceAnchors}+ anchors · rate withheld below ${report.conventions.rateFloor} tested · `,
        `ask due in ${report.conventions.askDueDays}d · ${HIRING_LINE_RULE_ID} auto-asks ${report.conventions.autoPropagate ? 'on' : 'paused'}.`),
    }),
    verdictCard,
    reqCard,
    candidateCard,
    card({
      title: 'Method & honest limits',
      subtitle: 'Structured selection validity (Sackett et al., 2022) · adverse selection (Akerlof, 1970) · multi-principal agency (Holmström & Milgrom, 1991) · role-episode consensus (Kahn et al., 1964)',
      body: h('ul', { class: 'muted small' },
        ...report.method.map((line) => h('li', {}, line)),
        h('li', {}, 'Limits: a line held by the workspace leader cannot be declared (leader evidence carries no attributable interviewer). Seats are workflow declarations, not authentication. The register shows what was RECORDED; a conversation that never reached the evidence log reads as silence.')),
    }),
  );
}

export default renderMatrixHiringPanel;
