/**
 * app/views/onboardingClarityPanel.js — `#/onboarding?panel=clarity`, the
 * Cross-Line Role Clarity Reconciliation screen (ADR-0153, Schema v128).
 *
 * THREE VIEWS, ONE QUESTION EACH:
 *
 *   Board   "Across every onboarding in this workspace, which multi-line people
 *            hold job definitions their lines cannot both serve — and which lines
 *            never defined the job at all?" One row per PERSON.
 *   Case    ONE person: the definitions every line holds, side by side, the
 *            closed-lexicon marks each line declared (or refused to declare),
 *            and every structural finding named — before any of it is graded.
 *   Method  the lexicon, the two closed scales, the declared verdict precedence,
 *            the frameworks the lens applies — and what it refuses to compute.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A parse of the brief text. The words are shown; they are never classified,
 *    tagged, weighted or read as a verdict by this lens.
 *  - A mark nobody declared. A brief with no declared marks reads `unscoped-line`
 *    and is excluded from every comparison, named as such.
 *  - A verdict for a line that never briefed. A secondary absence fails the case
 *    to `unbriefed`; the home line carries the plan as a printed presumption and
 *    is never decomposed into domains.
 *  - A settled conflict. `contested` names the two labels that cannot both be
 *    served. Which one wins is a human act this screen cannot perform.
 *  - Any score, rank or read on the person. Every finding is on a line or a
 *    domain, and the export carries no identity at all.
 */
import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  ROLE_CLARITY_DECISION_RIGHTS,
  ROLE_CLARITY_CRITERIA,
  ROLE_CLARITY_DOMAINS,
  ROLE_CLARITY_FRAMEWORKS,
  ROLE_CLARITY_REFUSALS,
  ROLE_CLARITY_VERDICTS,
  ROLE_CLARITY_SPREAD_LIMIT,
} from '../core/domain/roleClarityRegistry.js';
import { ROLE_CLARITY_CSV_COLUMNS } from '../core/domain/roleClarity.js';
import { openOnboardingBriefDialog } from '../ui/onboarding-brief-modals.js';

export const ROLE_CLARITY_PANELS = Object.freeze([
  { key: 'board', label: 'Board', hint: 'Every onboarding whose lines hold clashing definitions of the same person’s job, worst first. One row per person.' },
  { key: 'case', label: 'Case', hint: 'One person: the definitions on record, side by side, and every structural finding named.' },
  { key: 'method', label: 'Method', hint: 'The lexicon, the scales, the verdict precedence, the frameworks — and what this lens refuses to compute.' },
]);

const tabFor = (query) => {
  const key = query?.get?.('tab');
  return ROLE_CLARITY_PANELS.some((p) => p.key === key) ? key : 'board';
};

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const toneBadge = (label, tone) => badge(label, tone || 'neutral');
const boardLink = '#/onboarding?panel=clarity';

/** The URL for one role-clarity case. */
export const roleClarityHref = (selector = {}) => {
  const params = new URLSearchParams({ panel: 'clarity', tab: 'case' });
  if (selector.planId) params.set('plan', selector.planId);
  if (selector.personId) params.set('person', selector.personId);
  return `#/onboarding?${params.toString()}`;
};

const marksSummary = (line) => {
  if (line.outcome !== 'brief') return h('span', { class: 'muted tiny' }, line.outcome === 'declined' ? 'Declined — no marks' : 'No brief');
  if (!line.scoped) return h('span', { class: 'muted tiny' }, 'Briefed, no marks declared');
  return h('div', { class: 'stack-sm' },
    line.domains.length
      ? h('div', { class: 'row-gap' }, ...line.domains.map((d) => toneBadge(d, 'neutral')))
      : h('span', { class: 'muted tiny' }, 'No domains claimed'),
    h('span', { class: 'muted tiny' },
      `Right: ${line.decisionRight || 'not declared'} · Criteria: ${line.criteria || 'not declared'}`));
};

const findingBadge = (finding) => {
  switch (finding.kind) {
    case 'absent-line': return toneBadge('Absent line', 'bad');
    case 'unscoped-line': return toneBadge('Unscoped line', 'warn');
    case 'overlapping-scope': return toneBadge(`Overlap: ${finding.domainLabel || finding.domain}`, 'warn');
    case 'contested-authority': return toneBadge('Contested authority', 'bad');
    case 'divergent-criteria': return toneBadge('Criteria never stated by a line', 'bad');
    default: return toneBadge(finding.kind, 'neutral');
  }
};

function lineActionCell(ctx, report, line) {
  if (!report.hasPlan || !line.inWindow) {
    return h('span', { class: 'muted tiny' }, line.inWindow ? 'No plan' : 'Outside window');
  }
  return h('button', {
    class: 'btn btn-small btn-ghost',
    type: 'button',
    onClick: () => openOnboardingBriefDialog(ctx, { planId: report.planId, line: { ...line, brief: line.outcome === 'none' ? null : {
      outcome: line.outcome,
      declaredOn: line.declaredOn,
      scope: line.scope,
      stakeholders: [],
      stakeholdersN: 0,
      acknowledgedOn: null,
      declaredSource: 'manager',
      domains: line.domains,
      decisionRight: line.decisionRight,
      criteria: line.criteria,
    } } }),
  }, line.outcome === 'brief' ? 'Re-brief with definitions' : 'Write the definition');
}

/* ------------------------------------------------------------------- board */

function boardPanel(board) {
  if (!board.caseN) {
    const unplanned = board.unplannedN
      ? ` ${board.unplannedN} further multi-line person(s) hold no active plan, so there is no window and no definition to read; they are counted here, never given an invented one.`
      : '';
    return card({
      body: emptyState({
        title: 'No multi-line definition is on record yet',
        body: `Every active 30-60-90 plan in this workspace covers a person on a single reporting line.${unplanned} That is a different claim than “every line agreed what the job is”.`,
        action: h('a', { class: 'btn btn-primary', href: '#/onboarding?panel=matrix' }, 'Open the matrix onboarding lens'),
      }),
    });
  }

  const columns = [
    {
      label: 'Person',
      render: (c) => h('div', { class: 'stack-sm' },
        h('a', { class: 'link', href: roleClarityHref({ planId: c.planId, personId: c.personId }) }, c.personName || c.personId),
        h('span', { class: 'muted tiny' }, `started ${dash(c.startDate)} · window to ${dash(c.windowEnd)}`)),
    },
    {
      label: 'Verdict',
      render: (c) => h('div', { class: 'row-gap' },
        toneBadge(c.verdictLabel, c.verdictTone),
        c.duplicatePlanIds?.length ? h('span', { class: 'muted tiny' }, `${c.duplicatePlanIds.length + 1} concurrent plans`) : null),
    },
    {
      label: 'Lines',
      render: (c) => h('div', { class: 'stack-sm' },
        h('span', { class: 'small' }, `${c.totals.inWindowN} in window`),
        h('span', { class: 'muted tiny' }, `${c.totals.scopedN} declaring marks · ${c.totals.unscopedN} briefed without · ${c.totals.absentN} never briefed`)),
    },
    {
      label: 'Findings',
      render: (c) => (c.findingsN
        ? h('div', { class: 'stack-sm' },
            toneBadge(`${c.findingsN} finding(s)`, c.verdictTone === 'bad' ? 'bad' : 'warn'),
            h('span', { class: 'muted tiny' },
              [c.totals.overlapDomainN ? `${c.totals.overlapDomainN} overlap(s)` : null,
               c.totals.contestedAuthorityN ? 'authority in conflict' : null,
               c.totals.divergentCriteriaN ? 'criteria in conflict' : null].filter(Boolean).join(' · ') || 'see the case'))
        : h('span', { class: 'muted tiny' }, 'None — the definitions partition')),
    },
  ];

  return h('div', { class: 'stack' },
    card({
      title: 'Cross-line role clarity',
      subtitle: 'One row per person. A definition nobody declared is never invented, and a conflict is named here — never settled here.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'People on more than one line', value: board.peopleN, hint: 'distinct people with an active plan — never plan-line pairs' }),
        stat({ label: 'Need the conversation', value: board.openN, hint: 'missing or conflicting definitions', tone: board.openN ? 'warn' : 'good' }),
        stat({ label: 'Contested definitions', value: board.contestedN, hint: 'a decision right or criteria spread of two or more steps', tone: board.contestedN ? 'bad' : 'good' }),
        stat({ label: 'Unbriefed secondary line', value: board.unbriefedN, hint: 'no definition exists on that line at all', tone: board.unbriefedN ? 'bad' : 'good' }),
        stat({ label: 'Clean partition', value: board.partitionedN, hint: 'every claimed domain claimed by exactly one line', tone: board.partitionedN ? 'good' : 'neutral' }),
        stat({ label: 'Multi-line with no plan', value: board.unplannedN, hint: 'counted, never given an invented window', tone: board.unplannedN ? 'bad' : 'good' }),
      ),
    }),
    card({
      title: 'Role-clarity cases',
      subtitle: board.truncatedN
        ? `Showing the worst ${board.shown.length} of ${board.caseN}; the remainder is counted in the figures above.`
        : 'Worst first. The verdict is one line; the findings beside it are printed separately on purpose.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: boardLink }, 'Board')],
      body: table({ columns, rows: board.shown }),
    }),
    card({
      body: h('p', { class: 'muted small' }, `Findings across all cases: ${board.overlapDomainN} domain overlap(s), ${board.contestedAuthorityN} decision-right conflict(s), ${board.divergentCriteriaN} criteria conflict(s). Every one names a line or a domain — never the person.`),
    }),
  );
}

/* -------------------------------------------------------------------- case */

function casePanel(ctx, report) {
  if (!report) {
    return card({
      body: emptyState({
        title: 'Choose a case',
        body: 'Pick a person from the board to see the definitions their lines hold, side by side.',
        action: h('a', { class: 'btn btn-primary', href: boardLink }, 'Open the board'),
      }),
    });
  }

  const columns = [
    {
      label: 'Line',
      render: (line) => h('div', { class: 'stack-sm' },
        h('span', { class: 'small' }, line.role === 'primary' ? 'Home line (functional)' : `${line.kind || 'project'} line`),
        h('span', { class: 'muted tiny' }, line.managerName || line.managerId),
        line.fromISO || line.toISO ? h('span', { class: 'muted tiny' }, `${dash(line.fromISO || '…')} → ${dash(line.toISO || '…')}`) : null),
    },
    {
      label: 'The marks this line declared',
      render: (line) => marksSummary(line),
    },
    {
      label: 'What the line wrote',
      render: (line) => {
        if (line.outcome === 'none') {
          return h('span', { class: 'muted tiny' }, line.inWindow
            ? (line.role === 'primary' ? 'No line brief — the plan carries this line as a printed presumption' : 'Nothing — no definition on this line')
            : dash(line.reason));
        }
        if (line.outcome === 'declined') {
          return h('div', { class: 'stack-sm' },
            h('span', { class: 'small' }, 'Declined:'),
            h('span', { class: 'muted tiny' }, line.declineReason));
        }
        return h('div', { class: 'stack-sm' },
          h('span', { class: 'small' }, line.scope),
          h('span', { class: 'muted tiny' }, `Written ${line.declaredOn}${line.supersededBriefN ? ` · supersedes ${line.supersededBriefN} earlier brief(s)` : ''}`));
      },
    },
    { label: 'Act', render: (line) => lineActionCell(ctx, report, line) },
  ];

  const overlapDomains = report.byDomain.filter((d) => d.n >= 2);
  const uniqueDomains = report.byDomain.filter((d) => d.n === 1);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Role clarity',
      title: report.personName || report.personId,
      subtitle: report.hasPlan
        ? `Window ${dash(report.startDate)} → ${dash(report.windowEnd)}. The definitions each line holds for this person, read side by side.`
        : 'This person sits on more than one line and holds no active plan.',
      actions: [h('a', { class: 'btn btn-ghost', href: boardLink }, '← Board')],
    }),
    banner({ tone: report.verdictTone === 'bad' ? 'bad' : report.verdictTone === 'warn' ? 'warn' : 'info', title: report.verdictLabel, body: report.verdictDetail }),
    card({
      title: 'The definitions, side by side',
      subtitle: 'The scope text is shown, never parsed. Only the declared marks beside it can be compared — and only the marks are compared.',
      body: table({ columns, rows: report.lines }),
    }),
    card({
      title: 'Accountability domains',
      subtitle: 'Every domain claimed by at least one line in this window, with its claimants. Domains claimed by two lines are the matrix’s expected shape — and the place two managers can grade the same deliverable against different bars.',
      body: h('div', { class: 'stack' },
        overlapDomains.length
          ? h('div', { class: 'stack-sm' },
              h('h4', { class: 'onboarding-subhead' }, 'Claimed by more than one line'),
              ...overlapDomains.map((d) => h('div', { class: 'panel-note' },
                toneBadge(d.label, 'warn'),
                h('span', { class: 'small' }, `${d.n} lines: ${d.managers.join(' · ')}`),
                h('span', { class: 'muted tiny' }, `decision rights declared: ${d.rights.map((r) => r || 'not declared').join(' · ')}`))))
          : h('p', { class: 'muted small' }, 'No domain is claimed by more than one line in this window.'),
        uniqueDomains.length
          ? h('div', { class: 'stack-sm' },
              h('h4', { class: 'onboarding-subhead' }, 'Claimed by exactly one line'),
              h('div', { class: 'row-gap' }, ...uniqueDomains.map((d) => toneBadge(d.label, 'neutral'))))
          : null,
        !report.byDomain.length
          ? h('p', { class: 'muted small' }, 'No line in this window declared a domain. Nothing is inferred from the prose below; the comparison is refused rather than invented.')
          : null,
      ),
    }),
    report.findings.length
      ? card({
          title: `Structural findings (${report.findingsN}${report.refusedFindingsN ? `, ${report.refusedFindingsN} further not shown` : ''})`,
          subtitle: 'Every finding is on a line or a domain — never on the person. A conflict is named, not settled.',
          body: h('ul', { class: 'list' }, ...report.findings.map((f) => h('li', { class: 'small' }, findingBadge(f), h('span', null, ` ${f.detail}`)))),
        })
      : card({
          title: 'Structural findings',
          body: h('p', { class: 'muted small' }, report.verdict === 'single-chain'
            ? 'Single line for the whole window — there is no second definition to reconcile.'
            : 'No finding in this window: every claimed domain is claimed by exactly one line, and no decision-right or criteria spread reaches two steps.'),
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

function methodPanel(ctx) {
  return h('div', { class: 'stack' },
    card({
      title: 'The accountability-domain lexicon',
      subtitle: 'Ten closed domains. They are finer than a job family and coarser than a task list — exactly the altitude of a role definition. A domain is deliberately not a skill taxonomy and not a workload measure.',
      body: h('div', { class: 'row-gap' }, ...ROLE_CLARITY_DOMAINS.map((d) => toneBadge(d.label, 'neutral'))),
    }),
    card({
      title: 'The two closed scales',
      subtitle: `A spread of ${ROLE_CLARITY_SPREAD_LIMIT} or more steps is a conflict — the scales are three steps wide, so two is the widest spread there is, and declaring it declares the scale, not a fitted threshold. There are no conventions to clamp.`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'stack-sm' },
          h('h4', { class: 'onboarding-subhead' }, 'Decision right (RACI-informed)'),
          h('ul', { class: 'list' }, ...ROLE_CLARITY_DECISION_RIGHTS.map((r) => h('li', { class: 'small' }, `${r.label} — rank ${r.rank}`)))),
        h('div', { class: 'stack-sm' },
          h('h4', { class: 'onboarding-subhead' }, 'Success-criteria standing'),
          h('ul', { class: 'list' }, ...ROLE_CLARITY_CRITERIA.map((c) => h('li', { class: 'small' }, `${c.label} — rank ${c.rank}`)))),
      ),
    }),
    card({
      title: 'How a case reads',
      subtitle: 'Six verdicts with a declared precedence, so the board, the case and the export cannot disagree about a word.',
      body: h('ul', { class: 'list' }, ...ROLE_CLARITY_VERDICTS.map((v) => h('li', { class: 'small' }, toneBadge(v.label, v.tone), h('span', { class: 'muted' }, ` — ${v.detail}`)))),
    }),
    card({
      title: 'What this screen refuses to compute',
      body: h('ul', { class: 'list' }, ...ROLE_CLARITY_REFUSALS.map((r) => h('li', { class: 'small' }, r))),
    }),
    card({
      title: 'Frameworks applied',
      body: h('ul', { class: 'list' }, ...ROLE_CLARITY_FRAMEWORKS.map((f) => h('li', { class: 'small' }, f))),
    }),
    card({
      title: 'Export',
      subtitle: 'Aggregate only: no person, no name, no manager identifier, no brief text.',
      body: h('div', null,
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => {
            const csv = ctx.api?.roleClarityCsv?.();
            if (!csv?.ok) {
              toast(csv?.error || 'The export declined to be built at this seat.', 'bad');
              return;
            }
            downloadText(
              serializeCsv(ROLE_CLARITY_CSV_COLUMNS.map((key) => ({ key, header: key })), csv.rows),
              'leados-role-clarity.csv',
            );
          },
        }, 'Download CSV #115'),
        h('p', { class: 'muted small' }, 'Every figure in CSV #115 equals the figure on this screen: both are recomputed from the same stored briefs on every read, and nothing derived is stored.')),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderOnboardingClarityPanel(ctx) {
  const tab = tabFor(ctx.query);
  const header = pageHeader({
    eyebrow: 'Role clarity',
    title: 'Did the lines agree what the person is *for*?',
    subtitle: 'Both briefs were dated and both read as reasonable sentences — and nothing in the workspace ever put them side by side. This lens compares only the marks each line declared, never the prose, and names the conflict before it is graded as the person’s performance.',
    actions: [h('a', { class: 'btn btn-ghost', href: '#/onboarding?panel=matrix' }, '← Matrix onboarding')],
  });

  const tabsRow = tabs({
    active: tab,
    onChange: (key) => {
      const plan = ctx.query.get('plan');
      const person = ctx.query.get('person');
      const extra = plan ? `&plan=${encodeURIComponent(plan)}` : person ? `&person=${encodeURIComponent(person)}` : '';
      ctx.navigate(`#/onboarding?panel=clarity&tab=${key}${key === 'case' ? extra : ''}`);
    },
    items: ROLE_CLARITY_PANELS.map((p) => ({ key: p.key, label: p.label })),
  });

  let result = null;
  try {
    result = ctx.api?.roleClarityBoard?.() || ctx.api?.roleClarityAggregate?.() || null;
  } catch {
    result = null;
  }

  if (!result?.ok) {
    return h('div', { class: 'page' }, header, tabsRow, card({
      body: banner({
        tone: 'warn',
        title: 'Not readable at this seat',
        body: result?.error || 'The role-clarity report declined to be read here. Nothing is shown rather than showing a zero.',
      }),
    }));
  }

  const board = result.board;
  if (tab === 'method') return h('div', { class: 'page' }, header, tabsRow, methodPanel(ctx));
  if (tab === 'case') {
    const planId = ctx.query.get('plan') || '';
    const personId = ctx.query.get('person') || '';
    let report = null;
    try {
      const read = ctx.api?.roleClarityRead?.({ planId, personId });
      report = read?.ok ? read.report : null;
      if (!read?.ok && read?.error) toast(read.error, 'bad');
    } catch {
      report = null;
    }
    return h('div', { class: 'page' }, header, tabsRow, casePanel(ctx, report));
  }
  return h('div', { class: 'page' }, header, tabsRow, boardPanel(board));
}
