/**
 * app/views/onboardingMatrixPanel.js — `#/onboarding?panel=matrix`, the Matrix
 * Onboarding Completeness screen (ADR-0150, Schema v125).
 *
 * THREE VIEWS, ONE QUESTION EACH:
 *
 *   Board   "Across every onboarding in this workspace, which lines never said what
 *            they expect — and which people sit on two lines with no plan at all?"
 *            One row per PERSON, never per plan-line pair.
 *   Case    ONE person: the lines they landed on side by side with what each line
 *            actually wrote, whose word it was, whether the person acknowledged it,
 *            and the two acts that close the gap.
 *   Method  the states, the verdicts, the declared windows, and — printed plainly —
 *            what this screen REFUSES to compute and why.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A single "onboarded" badge. `crossLineComplete` and the plan's own completion
 *    are printed as two different figures, side by side, and never merged.
 *  - A zero for a line that has not written. It reads `unbriefed`, which is a fact
 *    about the process, not a claim about the person's readiness.
 *  - A per-line share of the person. The matrix ledger prints the declared share or
 *    says it is undeclared; nothing here derives one.
 *  - Any score, grade or read on the joiner. Every row is a line or a plan.
 *  - An acknowledgement on somebody else's behalf: the acknowledge form is offered
 *    only where the acting seat is the person themselves, and the action refuses
 *    every other seat.
 */
import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  ONBOARDING_MATRIX_STATES,
  ONBOARDING_MATRIX_VERDICTS,
  ONBOARDING_MATRIX_STATE_LABELS,
  ONBOARDING_MATRIX_STATE_TONES,
} from '../core/domain/onboardingMatrixRegistry.js';
import { ONBOARDING_MATRIX_CSV_COLUMNS } from '../core/domain/onboardingMatrix.js';
import {
  openOnboardingBriefDialog,
  openOnboardingDeclineDialog,
  openOnboardingAcknowledgeDialog,
} from '../ui/onboarding-brief-modals.js';

export const ONBOARDING_MATRIX_PANELS = Object.freeze([
  { key: 'board', label: 'Board', hint: 'Every onboarding in this workspace whose matrix step is not settled, worst first. One row per person — a person is never counted twice.' },
  { key: 'case', label: 'Case', hint: 'One person: the lines they landed on, what each line wrote, whether they acknowledged it, and the acts that close the gap.' },
  { key: 'method', label: 'Method', hint: 'The eight line states, the nine verdicts, the declared windows — and what this screen refuses to compute.' },
]);

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return ONBOARDING_MATRIX_PANELS.some((p) => p.key === key) ? key : 'board';
};

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const toneBadge = (label, tone) => badge(label, tone || 'neutral');

/** The URL for one onboarding case in the matrix lens. */
export const onboardingMatrixHref = (selector = {}) => {
  const params = new URLSearchParams({ panel: 'case' });
  if (selector.planId) params.set('plan', selector.planId);
  if (selector.personId) params.set('person', selector.personId);
  return `#/onboarding?${params.toString()}`;
};

const boardLink = '#/onboarding?panel=matrix';

function lineActionCell(ctx, kase, line, seatId) {
  if (!kase.hasPlan) {
    return h('span', { class: 'muted tiny' }, 'No plan to brief');
  }
  if (!line.inWindow) return h('span', { class: 'muted tiny' }, 'Outside window');
  const isOwner = !seatId || seatId === line.managerId;
  const isPerson = !seatId || seatId === kase.personId;
  const actions = [];
  if (isOwner && !(line.brief && line.brief.acknowledgedOn)) {
    actions.push(h('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      onClick: () => openOnboardingBriefDialog(ctx, { planId: kase.planId, line }),
    }, line.brief?.outcome === 'brief' ? 'Re-brief' : 'Write brief'));
    if (!line.brief || line.brief.outcome !== 'declined') {
      actions.push(h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => openOnboardingDeclineDialog(ctx, { planId: kase.planId, line }),
      }, 'No obligation'));
    }
  }
  if (isPerson && line.brief && line.brief.outcome === 'brief' && !line.brief.acknowledgedOn) {
    actions.push(h('button', {
      class: 'btn btn-small btn-primary',
      type: 'button',
      onClick: () => openOnboardingAcknowledgeDialog(ctx, { planId: kase.planId, line }),
    }, 'Acknowledge'));
  }
  if (!actions.length) {
    // Nothing to do here, and saying WHY is the point: a row that silently shows no
    // buttons reads as a bug rather than as a boundary.
    if (line.brief?.acknowledgedOn) return h('span', { class: 'muted tiny' }, 'Acknowledged');
    if (line.brief?.outcome === 'declined') return h('span', { class: 'muted tiny' }, 'Declined, with reason');
    return h('span', { class: 'muted tiny' }, 'Held by another line');
  }
  return h('div', { class: 'row-gap' }, ...actions);
}

/* ------------------------------------------------------------------- board */

function boardPanel(ctx, board) {
  if (!board.caseN) {
    return card({
      body: emptyState({
        title: 'No person is onboarding into a second line yet',
        body: 'Every active 30-60-90 plan in this workspace covers a person who sits on a single reporting line, so there is nothing for this lens to reconcile. That is a different claim than “every line onboarded everybody”: it means no onboarding here covers a person on more than one line. Declare the second line on the Matrix accountability panel and this lens will find the plan.',
        action: h('a', { class: 'btn btn-primary', href: '#/matrix' }, 'Open the Matrix ledger'),
      }),
    });
  }

  const columns = [
    {
      label: 'Person',
      render: (c) => h('div', { class: 'stack-sm' },
        h('a', { class: 'link', href: onboardingMatrixHref({ planId: c.planId, personId: c.personId }) }, c.personName || c.personId),
        h('span', { class: 'muted tiny' }, c.hasPlan
          ? `${c.kind === 'role-transition' ? 'Role transition' : c.kind === 'reboarding' ? 'Re-boarding' : 'Onboarding'} · started ${dash(c.startDate)}`
          : 'No active 30-60-90 plan')),
    },
    {
      label: 'Verdict',
      render: (c) => h('div', { class: 'row-gap' },
        toneBadge(c.verdictLabel, c.verdictTone),
        c.duplicatePlanIds.length ? h('span', { class: 'muted tiny' }, `${c.duplicatePlanIds.length + 1} concurrent plans`) : null),
    },
    {
      label: 'Lines',
      render: (c) => h('div', { class: 'stack-sm' },
        h('span', { class: 'small' }, `${c.totals.windowLineN} in window`),
        c.totals.presumedN ? h('span', { class: 'muted tiny' }, `${c.totals.presumedN} carried by the plan (presumed)`) : null),
    },
    {
      label: 'A line wrote nothing',
      render: (c) => (c.totals.unbriefedN
        ? h('div', { class: 'stack-sm' },
            toneBadge(`${c.totals.unbriefedN} never briefed`, 'bad'),
            h('span', { class: 'muted tiny' }, c.totals.awaitingBriefN ? `${c.totals.awaitingBriefN} still inside the window` : ''))
        : h('span', { class: 'muted tiny' }, c.totals.awaitingBriefN ? `${c.totals.awaitingBriefN} still inside the window` : 'None')),
    },
    {
      label: 'Awaiting the person',
      render: (c) => (c.totals.briefedN + c.totals.acknowledgementOverdueN
        ? h('div', { class: 'row-gap' },
            toneBadge(`${c.totals.briefedN + c.totals.acknowledgementOverdueN} briefed`, 'warn'),
            c.totals.acknowledgementOverdueN ? h('span', { class: 'muted tiny' }, `${c.totals.acknowledgementOverdueN} overdue`) : null)
        : h('span', { class: 'muted tiny' }, 'None')),
    },
    {
      label: 'Cross-line complete',
      render: (c) => h('div', { class: 'stack-sm' },
        toneBadge(c.crossLineComplete ? 'Yes' : 'No', c.crossLineComplete ? 'good' : c.crossLineSettled ? 'neutral' : 'warn'),
        c.crossLineSettled && !c.crossLineComplete
          ? h('span', { class: 'muted tiny' }, 'settled across lines — a line declined its own onboarding, which is not coverage')
          : null,
        h('span', { class: 'muted tiny' }, c.planComplete
          ? 'the plan itself is marked completed — a separate claim'
          : 'the plan is still active')),
    },
  ];

  return h('div', { class: 'stack' },
    card({
      title: 'Matrix onboarding',
      subtitle: 'One row per person. A line that has written nothing is a named process gap, never a zero and never a claim about the person.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'People on more than one line', value: board.peopleN, hint: 'distinct people — never plan-line pairs' }),
        stat({ label: 'Outstanding step', value: board.openN, hint: 'a line has not written, or a person has not acknowledged', tone: board.openN ? 'warn' : 'good' }),
        stat({ label: 'Lines never briefed', value: board.unbriefedLinesN, hint: 'past the declared brief window', tone: board.unbriefedLinesN ? 'bad' : 'good' }),
        stat({ label: 'Multi-line with no plan', value: board.unplannedN, hint: 'nobody is onboarding them', tone: board.unplannedN ? 'bad' : 'good' }),
        stat({ label: 'Concurrent plans for one person', value: board.duplicateCaseN, hint: 'counts overstate people being onboarded', tone: board.duplicateCaseN ? 'bad' : 'good' }),
      ),
    }),
    card({
      title: 'Onboarding cases',
      subtitle: board.truncatedN
        ? `Showing the worst ${board.shown.length} of ${board.caseN}; the remainder is counted in the figures above.`
        : 'Worst first. The verdict is one line; the counts beside it are printed separately on purpose.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: boardLink }, 'Board')],
      body: table({ columns, rows: board.shown }),
    }),
    board.singleLinePlanN
      ? card({
          body: h('p', { class: 'muted small' }, `${board.singleLinePlanN} active 30-60-90 plan(s) in this workspace cover a person on a single reporting line and are not listed here. They are unaffected by this lens — the ordinary plan screen reads them exactly as it did before.`),
        })
      : null,
  );
}

/* -------------------------------------------------------------------- case */

function casePanel(ctx, report) {
  if (!report) {
    return card({
      body: emptyState({
        title: 'Choose an onboarding case',
        body: 'Pick a person from the board to see the lines they landed on and what each line wrote.',
        action: h('a', { class: 'btn btn-primary', href: boardLink }, 'Open the board'),
      }),
    });
  }
  const seatId = ctx.state?.settings?.activeSeatId || null;
  const scaffold = report.planScaffolding;
  const columns = [
    {
      label: 'Line',
      render: (line) => h('div', { class: 'stack-sm' },
        h('span', { class: 'small' }, line.role === 'primary' ? 'Home line (functional)' : `${line.kind} line`),
        h('span', { class: 'muted tiny' }, `${line.managerName}${line.managerAltitude ? ` · ${line.managerAltitude}` : ''}`),
        line.shareH === null
          ? h('span', { class: 'muted tiny' }, 'Share not declared')
          : h('span', { class: 'muted tiny' }, `${(line.shareH / 100).toFixed(2)}% declared`)),
    },
    {
      label: 'State',
      render: (line) => h('div', { class: 'row-gap' },
        toneBadge(line.stateLabel, line.stateTone),
        line.overdue && line.overdueDays !== null ? h('span', { class: 'muted tiny' }, `${line.overdueDays}d past the brief window`) : null,
        line.ackOverdue && line.ackOverdueDays !== null ? h('span', { class: 'muted tiny' }, `${line.ackOverdueDays}d past the acknowledgement window`) : null,
        line.supersededBriefN ? h('span', { class: 'muted tiny' }, `${line.supersededBriefN} earlier brief(s) superseded`) : null),
    },
    {
      label: 'What the line wrote',
      render: (line) => {
        if (!line.brief) return h('span', { class: 'muted tiny' }, line.inWindow ? 'Nothing — no brief on this line' : dash(line.reason));
        if (line.brief.outcome === 'declined') {
          return h('div', { class: 'stack-sm' },
            h('span', { class: 'small' }, 'Declined:'),
            h('span', { class: 'muted tiny' }, line.brief.reason));
        }
        return h('div', { class: 'stack-sm' },
          h('span', { class: 'small' }, line.brief.scope),
          line.brief.firstWork ? h('span', { class: 'muted tiny' }, `First work: ${line.brief.firstWork}`) : null,
          line.brief.stakeholdersN
            ? h('span', { class: 'muted tiny' }, `To meet: ${(line.brief.stakeholders || []).join(', ')}`)
            : null,
          h('span', { class: 'muted tiny' }, `Written ${line.brief.declaredOn}${line.brief.declaredSource === 'operator' ? ' (recorded by the operator, not by the line holder’s own seat)' : ''}`));
      },
    },
    {
      label: 'Person acknowledged',
      render: (line) => {
        if (!line.brief || line.brief.outcome !== 'brief') return h('span', { class: 'muted tiny' }, '—');
        if (!line.brief.acknowledgedOn) {
          return h('span', { class: 'muted tiny' }, `Not yet${line.ackDueOn ? ` · due ${line.ackDueOn}` : ''}`);
        }
        return h('div', { class: 'stack-sm' },
          h('span', { class: 'small' }, line.brief.acknowledgedOn),
          line.brief.acknowledgement ? h('span', { class: 'muted tiny' }, line.brief.acknowledgement) : null,
          line.brief.acknowledgementSource === 'operator'
            ? h('span', { class: 'muted tiny' }, 'recorded by the operator, not by the person’s own seat')
            : null);
      },
    },
    { label: 'Act', render: (line) => lineActionCell(ctx, report, line, seatId) },
  ];

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Matrix onboarding',
      title: report.personName || report.personId,
      subtitle: report.hasPlan
        ? `${report.kind === 'role-transition' ? 'Role transition' : report.kind === 'reboarding' ? 'Re-boarding' : 'Onboarding'} window ${dash(report.startDate)} → ${dash(report.windowEnd)}.`
        : 'This person sits on more than one reporting line and holds no active 30-60-90 plan.',
      actions: [h('a', { class: 'btn btn-ghost', href: boardLink }, '← Board')],
    }),
    banner({ tone: report.verdictTone === 'bad' ? 'bad' : report.verdictTone === 'warn' ? 'warn' : 'info', title: report.verdictLabel, body: report.verdictDetail }),
    card({
      title: 'Two different claims',
      subtitle: 'They are printed separately because collapsing them is how a completed plan comes to read as a completed onboarding of a person with two managers.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Cross-line complete', value: report.crossLineComplete ? 'Yes' : 'No', hint: report.crossLineSettled && !report.crossLineComplete ? 'settled across lines, but a line declined its own onboarding — not coverage' : 'every line in force wrote its brief AND the person acknowledged it', tone: report.crossLineComplete ? 'good' : report.crossLineSettled ? 'neutral' : 'warn' }),
        stat({ label: 'The plan itself is completed', value: report.planComplete ? 'Yes' : 'No', hint: 'one plan’s completion — not a coverage claim' }),
        stat({ label: 'Lines in the window', value: report.totals.windowLineN, hint: `${report.totals.settledN} settled` }),
        stat({ label: 'Home line presumed', value: report.totals.presumedN, hint: 'carried by the plan, never counted as evidence' })),
    }),
    card({
      title: 'Lines and what each one said',
      subtitle: 'A line that has written nothing reads `unbriefed` or `awaiting-brief`; neither is a zero and neither is a judgement about the person.',
      actions: report.hasPlan
        ? [h('a', { class: 'btn btn-small btn-ghost', href: `#/onboarding?plan=${encodeURIComponent(report.planId)}` }, 'Open the 30-60-90 plan')]
        : [h('button', {
            class: 'btn btn-small btn-primary',
            type: 'button',
            onClick: () => toast('Open the plan dialog from the onboarding screen to start a 30-60-90 plan for this person.', 'info'),
          }, 'Start a plan')],
      body: table({ columns, rows: report.lines }),
    }),
    scaffold
      ? card({
          title: 'The plan’s own scaffolding',
          subtitle: 'Printed under its own heading, and never used to derive line coverage.',
          body: h('div', { class: 'stat-row' },
            stat({ label: 'Plan status', value: scaffold.statusLabel, hint: `day ${dash(scaffold.dayNumber)}`, tone: scaffold.statusTone }),
            stat({ label: 'Checkpoints open', value: scaffold.checkpointOpenN, hint: `${scaffold.checkpointOverdueN} overdue of ${scaffold.checkpointN}` }),
            stat({ label: 'Stakeholder intros', value: `${scaffold.stakeholderMetN}/${scaffold.stakeholderN}`, hint: 'the plan’s own list, not a line’s' }),
            stat({ label: 'Scaffolding gaps', value: scaffold.scaffoldingGapN, hint: (scaffold.gapKeys || []).join(', ') || 'none recorded' })),
        })
      : card({
          body: h('p', { class: 'muted small' }, 'There is no plan to read scaffolding from. The finding is the missing plan: two managers may each believe the other one is onboarding this person.'),
        }),
    report.refusals.length
      ? card({
          title: 'What this reading refuses to claim',
          body: h('ul', { class: 'list' }, ...report.refusals.map((r) => h('li', { class: 'small' }, r.detail))),
        })
      : null,
  );
}

/* ------------------------------------------------------------------ method */

function methodPanel(ctx, board) {
  const conv = board.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'How a line reads',
      subtitle: 'Eight states because eight different facts imply eight different next actions. None of them is a score on the person.',
      body: h('ul', { class: 'list' }, ...Object.values(ONBOARDING_MATRIX_STATES).map((key) => h('li', { class: 'small' },
        toneBadge(ONBOARDING_MATRIX_STATE_LABELS[key], ONBOARDING_MATRIX_STATE_TONES[key]),
        h('span', { class: 'muted' }, ` — ${key}`)))),
    }),
    card({
      title: 'How a case reads',
      subtitle: 'Nine verdicts with a declared precedence, so the board, the case and the export cannot disagree about a word.',
      body: h('ul', { class: 'list' }, ...ONBOARDING_MATRIX_VERDICTS.map((v) => h('li', { class: 'small' },
        toneBadge(v.label, v.tone),
        h('span', { class: 'muted' }, ` — ${v.detail}`)))),
    }),
    card({
      title: 'The declared windows',
      subtitle: 'Both printed, both clamped, neither fitted from the record.',
      body: h('ul', { class: 'list' },
        h('li', { class: 'small' }, `A line owes its brief ${conv.onboardingBriefDays} day(s) after the plan starts. Past that, it reads “never briefed” with the late days printed.`),
        h('li', { class: 'small' }, `A standing brief may go ${conv.onboardingAcknowledgeDays} day(s) unacknowledged before it reads overdue. A re-brief restarts the window and re-asks the person, because it is a different text.`),
        h('li', { class: 'small' }, 'Today is the only clock. Nothing here projects a past or a future: a window is measured from the plan’s recorded start date.'),
      ),
    }),
    card({
      title: 'What this screen refuses to compute',
      body: h('ul', { class: 'list' },
        h('li', { class: 'small' }, 'A per-line share of the person. The matrix ledger prints the declared share or says it is undeclared; no allocation is derived here, and none is invented.'),
        h('li', { class: 'small' }, 'A single “onboarded” answer. Cross-line completion and the plan’s own completion are two figures, printed as two.'),
        h('li', { class: 'small' }, 'Coverage from a presumption. The home line with no brief never counts as a settled line: it is named as the plan’s presumption on every surface.'),
        h('li', { class: 'small' }, 'Silence as agreement. An unbriefed line and an unacknowledged brief are their own words, and neither closes anything.'),
        h('li', { class: 'small' }, 'An acknowledgement on somebody else’s behalf. The action refuses any seat that is not the person — a manager acknowledging for a report is the shadow accountability this step exists to prevent.'),
        h('li', { class: 'small' }, 'A plan for a person who has none. Two managers each believing the other is onboarding somebody is reported as it is; the workspace does not open a plan nobody chose.'),
      ),
    }),
    card({
      title: 'Export',
      subtitle: 'Aggregate only: no person, no name, no manager identifier, no brief text, no stakeholder name.',
      body: h('div', null,
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => {
            const result = ctx.api.onboardingMatrixCsv?.() || { ok: false };
            if (!result.ok) {
              toast(result.error || 'The export declined to be built at this seat.', 'bad');
              return;
            }
            downloadText(
              serializeCsv(ONBOARDING_MATRIX_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
              'leados-matrix-onboarding.csv',
            );
          },
        }, 'Download CSV'),
        h('p', { class: 'muted small' }, 'Every figure in the export equals the figure on this screen: both are recomputed from the same stored briefs on every read, and nothing derived is stored.')),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderOnboardingMatrixPanel(ctx) {
  const panel = panelFor(ctx.query);
  const result = (() => {
    try {
      return ctx.api?.onboardingMatrixBoard?.() || null;
    } catch {
      return null;
    }
  })();

  const header = pageHeader({
    eyebrow: 'Matrix onboarding',
    title: 'Onboarding across every reporting line',
    subtitle: 'A 30-60-90 plan written by one manager is not an onboarding of a person who has two. This lens reconciles the plan against every line the person landed on, and prints the plan’s own health separately.',
    actions: [h('a', { class: 'btn btn-ghost', href: '#/onboarding' }, '← 30-60-90 plans')],
  });

  const tabsRow = tabs({
    active: panel,
    onChange: (key) => ctx.navigate(`#/onboarding?panel=${key === 'board' ? 'matrix' : key}${key === 'case' && ctx.query.get('plan') ? `&plan=${encodeURIComponent(ctx.query.get('plan'))}` : ''}`),
    items: ONBOARDING_MATRIX_PANELS.map((p) => ({ key: p.key, label: p.label })),
  });

  if (!result?.ok) {
    return h('div', { class: 'page' }, header, tabsRow, card({
      body: banner({
        tone: 'warn',
        title: 'Not readable at this seat',
        body: result?.error || 'The matrix-onboarding report declined to be read here. Nothing is shown rather than showing a zero.',
      }),
    }));
  }

  const board = result.board;
  if (panel === 'method') return h('div', { class: 'page' }, header, tabsRow, methodPanel(ctx, board));
  if (panel === 'case') {
    const planId = ctx.query.get('plan') || '';
    const personId = ctx.query.get('person') || '';
    let report = null;
    try {
      const read = ctx.api?.onboardingMatrixRead?.({ planId, personId });
      report = read?.ok ? read.report : null;
      if (!read?.ok && read?.error) toast(read.error, 'bad');
    } catch {
      report = null;
    }
    return h('div', { class: 'page' }, header, tabsRow, casePanel(ctx, report));
  }
  return h('div', { class: 'page' }, header, tabsRow, boardPanel(ctx, board));
}
