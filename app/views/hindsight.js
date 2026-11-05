/**
 * app/views/hindsight.js — `#/hindsight`, the Hindsight Lock (`#/hindsight`,
 * ADR-0102).
 *
 * Six panels, six different questions:
 *   Desk         "What should I do at this altitude, and what is waiting?"
 *   The locks    "Which decisions are frozen, and what did each rest on?"
 *   Information  "What did this decision know, what was knowable, what came later?"
 *   Luck         "Were the wins earned, and is the association real at this n?"
 *   Roll-up      "How does this look above me and below me?"
 *   Method       "What exactly is claimed here, what is refused, and what can I re-declare?"
 *
 * Nothing on this screen rates a person. Above director rank it prints counts by
 * altitude only, and a suppressed cell is blank, never zero.
 */
import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { HINDSIGHT_QUADRANTS, HINDSIGHT_PANELS } from '../core/domain/hindsightRegistry.js';

const PANELS = HINDSIGHT_PANELS;

const CSV_COLUMNS = ['row_kind', 'scope', 'locks_n', 'open_n', 'ungraded_n', 'graded_n', 'overdue_n',
  'retrospective_n', 'measured_n', 'earned_n', 'resulted_n', 'variance_n', 'fixable_n', 'unmeasured_n',
  'thin_n', 'thick_n', 'share_pct', 'interval_low_pct', 'interval_high_pct', 'p_value',
  'expected_resulted_n', 'met_n', 'missing_n', 'suppressed'];

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((item) => item.key === key) ? key : 'desk';
};
const go = (ctx, panel, lockId = null) => ctx.navigate(`#/hindsight?panel=${panel}${lockId ? `&lock=${encodeURIComponent(lockId)}` : ''}`);
const pct = (value) => (value === null || value === undefined ? 'refused' : `${value}%`);
const quadrantBadge = (key) => {
  const meta = HINDSIGHT_QUADRANTS[key] || { label: key || 'ungraded', tone: 'neutral', meaning: '' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};
const statusBadge = (audit) => {
  if (audit.status === 'settled') return badge('Graded', 'good', 'A call was made and its outcome recorded.');
  if (audit.status === 'pending') return badge('Decided, ungraded', 'warn', 'A call was made; no outcome recorded yet.');
  if (audit.status === 'open') return badge('Undecided', 'neutral', 'No option chosen yet.');
  return badge('Record missing', 'bad', 'The decision behind this lock is no longer in the workspace.');
};
const coverageText = (coverage) => (coverage.refused
  ? 'refused'
  : `${coverage.pct}% (${coverage.knownN}/${coverage.knowableN}; Wilson ${coverage.lowPct}–${coverage.highPct}%)`);

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The hindsight action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.hindsightCsvRows();
  if (!result?.ok) {
    toast(result?.error || 'The hindsight export was refused.', 'bad');
    return;
  }
  downloadText({
    filename: `leados-hindsight-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns: CSV_COLUMNS.map((key) => ({ key, header: key })), rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief(ctx) {
  const result = ctx.api.hindsightBriefText();
  if (!result?.ok) {
    toast(result?.error || 'No brief available.', 'bad');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(result.text).then(
      () => toast('Brief copied to the clipboard.', 'good'),
      () => toast('The clipboard is unavailable in this browser; the brief is shown on the Desk panel.', 'neutral'),
    );
  } else {
    toast('The clipboard is unavailable in this browser; the brief is shown on the Desk panel.', 'neutral');
  }
}

/* ------------------------------------------------------------- desk */

function deskPanel(ctx, report) {
  const pb = report.playbook;
  const s = report.summary;
  const q = report.quadrants;
  const brief = ctx.api.hindsightBriefText();
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: pb.title, body: `${pb.question} Horizon: ${pb.horizon}.` }),
    card({
      title: 'What you can see at this altitude',
      body: h('div', { class: 'stack' },
        h('p', null, pb.see),
        h('p', null, h('strong', null, 'Act: '), pb.act),
        h('p', null, h('strong', null, 'Hand up: '), pb.hand)),
    }),
    card({
      title: 'Position',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Locks in scope', value: String(s.locksN), hint: `${s.totalLocksN} in the workspace; a lock is one frozen information set` }),
        stat({ label: 'Decided, ungraded', value: String(s.pendingN), tone: s.overdueN ? 'warn' : '', hint: `${s.overdueN} past the declared review grace` }),
        stat({ label: 'Graded', value: String(s.settledN), hint: 'A call and its outcome are both recorded' }),
        stat({
          label: 'Resulting share',
          value: q.resultingShare.refused ? 'refused' : `${q.resultingShare.pct}%`,
          tone: q.resultingShare.refused ? '' : q.resultingShare.pct >= 40 ? 'bad' : 'good',
          hint: q.resultingShare.refused ? q.resultingShare.reason : `${q.resultedN} of ${q.goodN} good outcome(s) came out of a thin process`,
        })),
    }),
    report.ungraded.length
      ? card({
        title: 'Decided, never graded',
        subtitle: 'A decision nobody grades cannot teach anything. RULE-HND-04 opens at most one bounded prompt per lock per week.',
        body: table({
          caption: 'Decisions past their review grace with no recorded outcome',
          columns: [
            { label: 'Decided', render: (row) => h('strong', null, row.decisionOn) },
            { label: 'Review date', render: (row) => row.reviewOn || 'none set' },
            { label: 'Age', render: (row) => `${row.ageDays}d` },
            { label: 'Process', render: (row) => `${row.quality.met}/5` },
            { label: 'Open', render: (row) => h('a', { class: 'btn small', href: `#/decisions?decision=${encodeURIComponent(row.decisionId)}` }, 'Grade it') },
          ],
          rows: report.ungraded,
          emptyMessage: 'Nothing overdue.',
        }),
      })
      : null,
    report.flagged.length
      ? card({
        title: 'The calls worth re-reading',
        subtitle: 'Successful mistakes (thin process, good outcome) and decisions that left knowable facts unconsulted.',
        body: table({
          caption: 'Decisions flagged by the process audit',
          columns: [
            { label: 'Decided', render: (row) => h('strong', null, row.decisionOn) },
            { label: 'Quadrant', render: (row) => quadrantBadge(row.quadrant) },
            { label: 'Coverage', render: (row) => coverageText(row.coverage) },
            { label: 'Knowable, unconsulted', render: (row) => String(row.coverage.missedN) },
            { label: 'Read', render: (row) => h('a', { href: `#/hindsight?panel=information&lock=${encodeURIComponent(row.lockId)}` }, 'open the information set') },
          ],
          rows: report.flagged.slice(0, 12),
          emptyMessage: 'Nothing flagged.',
        }),
      })
      : null,
    brief?.ok
      ? card({
        title: 'The brief, as it will be handed up',
        subtitle: 'Identity-free and aggregate-only: safe to paste upward without leaking a name, a title or a decision.',
        body: h('pre', { class: 'brief-text', tabindex: '0' }, brief.text),
      })
      : null);
}

/* ------------------------------------------------------------ locks */

function lockDetail(ctx, audit) {
  return card({
    id: `lock-${audit.lockId}`,
    title: `Lock of ${audit.decisionOn} — ${HINDSIGHT_QUADRANTS[audit.quadrant]?.label || 'not yet graded'}`,
    subtitle: `Frozen ${audit.frozenOn}${audit.retrospective ? ' (retrospectively: the information set is reconstructed from the link history, which carries its own date)' : ' in the transaction that recorded the decision'}.`,
    actions: [
      h('button', { class: 'btn small', type: 'button', onClick: () => go(ctx, 'information', audit.lockId) }, 'Information set'),
      h('a', { class: 'btn small btn-ghost', href: `#/decisions?decision=${encodeURIComponent(audit.decisionId)}` }, 'Open the decision'),
    ],
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Coverage', value: audit.coverage.refused ? 'refused' : `${audit.coverage.pct}%`, tone: audit.coverage.refused ? '' : audit.coverage.pct >= report0(ctx).conventions.hindsightCoveragePct ? 'good' : 'warn', hint: audit.coverage.refused ? audit.coverage.reason : `${audit.coverage.knownN} consulted of ${audit.coverage.knowableN} knowable, Wilson ${audit.coverage.lowPct}–${audit.coverage.highPct}%` }),
        stat({ label: 'Frozen process', value: `${audit.quality.met}/5`, hint: audit.quality.missing.length ? `missing: ${audit.quality.missing.join('; ')}` : 'every declared requirement met' }),
        stat({ label: 'Arrived later', value: String(audit.coverage.laterN), hint: 'Dated after the decision — never charged to it' }),
        stat({ label: 'Information age', value: audit.lagDays === null ? '—' : `${audit.lagDays}d`, hint: 'Decision date minus the newest consulted fact' })),
      audit.quadrantReason ? h('p', { class: 'muted' }, audit.quadrantReason) : null,
      audit.title ? h('p', null, h('strong', null, 'Decision: '), audit.title) : null)});
}

function report0(ctx) {
  return ctx.api.hindsightReport();
}

function locksPanel(ctx, report) {
  const selectedId = ctx.query?.get?.('lock');
  const selected = report.audits.find((audit) => audit.lockId === selectedId) || null;
  return h('div', { class: 'stack' },
    selected ? lockDetail(ctx, selected) : null,
    card({
      title: 'Every frozen decision',
      subtitle: 'One row per lock. Coverage is the share of the knowable set the decision actually rested on; the process column is the record’s own quality bar, frozen at the moment of the call.',
      body: report.audits.length
        ? table({
          caption: 'Frozen decision locks, newest first',
          columns: [
            { label: 'Decided', render: (row) => h('strong', null, row.decisionOn) },
            { label: 'State', render: (row) => statusBadge(row) },
            { label: 'Quadrant', render: (row) => (row.quadrant ? quadrantBadge(row.quadrant) : badge('not graded', 'neutral')) },
            { label: 'Coverage', render: (row) => coverageText(row.coverage) },
            { label: 'Knowable, unconsulted', render: (row) => String(row.coverage.missedN) },
            { label: 'Arrived later', render: (row) => String(row.coverage.laterN) },
            { label: 'Process', render: (row) => `${row.quality.met}/5` },
            { label: 'Age', render: (row) => `${row.ageDays}d` },
            { label: 'Open', render: (row) => h('a', { href: `#/hindsight?panel=information&lock=${encodeURIComponent(row.lockId)}` }, 'information set') },
          ],
          rows: report.audits,
          emptyMessage: 'No decision has been locked yet.',
        })
        : emptyState({
          title: 'No lock yet',
          body: 'A lock is frozen automatically the moment a decision is recorded. Log a decision and come back — the information set it rests on is captured then, not now.',
          action: h('a', { class: 'btn', href: '#/decisions' }, 'Open decisions'),
        }),
    }));
}

/* ------------------------------------------------------ information */

function informationPanel(ctx, report) {
  const selectedId = ctx.query?.get?.('lock');
  const audit = report.audits.find((row) => row.lockId === selectedId) || report.audits[0] || null;
  if (!audit) {
    return emptyState({ title: 'Nothing locked yet', body: 'The information set of a decision appears here the moment the decision is recorded.' });
  }
  const facts = [
    ...audit.known.map((fact) => ({ ...fact, cls: 'known' })),
    ...audit.missed.map((fact) => ({ ...fact, cls: 'missed' })),
    ...audit.later.map((fact) => ({ ...fact, cls: 'later' })),
  ];
  return h('div', { class: 'stack' },
    banner({
      tone: audit.coverage.refused ? 'warn' : audit.coverage.missedN ? 'info' : 'good',
      title: audit.coverage.refused
        ? 'The information set cannot be measured'
        : `${audit.coverage.knownN} known · ${audit.coverage.missedN} knowable and unconsulted · ${audit.coverage.laterN} arrived later`,
      body: audit.coverage.refused
        ? audit.coverage.reason
        : `Coverage ${audit.coverage.pct}% with a Wilson 95% interval of ${audit.coverage.lowPct}–${audit.coverage.highPct}%, against a declared floor of ${report.conventions.hindsightCoveragePct}%. Facts that arrived after the decision are printed and excluded: nobody can be charged for the future.`,
    }),
    card({
      title: `Decision of ${audit.decisionOn}`,
      subtitle: 'The frozen set is what the decision rested on. Everything else here was linked to it afterwards — which is exactly how the workspace learns what turned out to matter.',
      actions: [h('button', { class: 'btn small', type: 'button', onClick: () => go(ctx, 'locks', audit.lockId) }, 'Back to the lock')],
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Known at the time', value: String(audit.coverage.knownN), hint: 'Linked on or before the decision' }),
        stat({ label: 'Knowable, not consulted', value: String(audit.coverage.missedN), tone: audit.coverage.missedN ? 'warn' : '', hint: 'Dated on or before it, linked afterwards' }),
        stat({ label: 'Arrived later', value: String(audit.coverage.laterN), hint: 'Dated after it — excluded from coverage' }),
        stat({ label: 'Undated', value: String(audit.coverage.undatedN), hint: 'Cannot be placed on either side — excluded and printed, never guessed' })),
    }),
    card({
      title: 'The full partition',
      subtitle: 'Type, class and the record’s own date. No titles and no content are copied here — this is an audit of what existed, not a second copy of the record.',
      body: facts.length
        ? table({
          caption: 'Every fact the decision is now understood to rest on, classified by date and link history',
          columns: [
            { label: 'Class', render: (row) => {
              if (row.cls === 'known') return badge('Known', 'good', 'Linked on or before the decision');
              if (row.cls === 'missed') return badge('Knowable, unconsulted', 'warn', 'Dated on or before the decision, linked afterwards');
              return badge('Arrived later', 'neutral', 'Dated after the decision — never charged to it');
            } },
            { label: 'Record type', render: (row) => row.type },
            { label: 'Its own date', render: (row) => row.on || 'undated' },
            { label: 'Days from the decision', render: (row) => {
              const days = row.on ? Math.round((Date.parse(`${audit.decisionOn}T00:00:00Z`) - Date.parse(`${row.on}T00:00:00Z`)) / 86400000) : null;
              return days === null ? '—' : days >= 0 ? `${days} after` : `${Math.abs(days)} before`;
            } },
          ],
          rows: facts,
          emptyMessage: 'No typed link ties any record to this decision — so there is no information set to audit.',
        })
        : emptyState({ title: 'Nothing is linked to this decision', body: 'The workspace has not tied any record to it, so there is no information set to measure. That is a finding about the record, not about the decision.' }),
    }),
    card({
      title: 'What this panel refuses to say',
      body: h('ul', { class: 'list' },
        h('li', null, 'It does not infer relevance: only typed links the workspace already wrote count as a relationship. A record nobody linked is never charged to the decision.'),
        h('li', null, 'It does not treat a fact that arrived after the decision as one the decision missed.'),
        h('li', null, 'It does not name a person, and it does not copy the content of any linked record into this ledger.'))}),
  );
}

/* ------------------------------------------------------------- luck */

function luckPanel(ctx, report) {
  const q = report.quadrants;
  return h('div', { class: 'stack' },
    banner({
      tone: q.resultingShare.refused ? 'info' : q.resultingShare.pct >= 40 ? 'warn' : 'good',
      title: 'Outcome is not process',
      body: 'The quadrant is read from the FROZEN process record and the live information set, never from the outcome alone. A thin process with a good outcome is the one that teaches the wrong lesson; a sound process with a bad outcome is the one that gets punished by mistake.',
    }),
    card({
      title: 'The quadrant table',
      body: h('div', { class: 'stat-row' },
        ...['earned', 'resulted', 'variance', 'fixable', 'unmeasured'].map((key) => stat({
          label: HINDSIGHT_QUADRANTS[key].label,
          value: String(q.counts[key] || 0),
          tone: key === 'resulted' ? 'warn' : key === 'fixable' ? 'bad' : key === 'earned' ? 'good' : '',
          hint: HINDSIGHT_QUADRANTS[key].meaning,
        }))),
    }),
    card({
      title: 'Resulting share',
      subtitle: 'The share of graded GOOD outcomes that came out of a thin or under-informed process — the wins this workspace cannot yet defend.',
      body: h('div', { class: 'stat-row' },
        stat({
          label: 'Share',
          value: q.resultingShare.refused ? 'refused' : `${q.resultingShare.pct}%`,
          tone: q.resultingShare.refused ? '' : q.resultingShare.pct >= 40 ? 'bad' : 'good',
          hint: q.resultingShare.refused ? q.resultingShare.reason : `Wilson 95% interval ${q.resultingShare.lowPct}–${q.resultingShare.highPct}% over ${q.goodN} good outcome(s)`,
        }),
        stat({ label: 'Earned', value: String(q.earnedN), hint: 'Good process and good outcome' }),
        stat({ label: 'Resulted', value: String(q.resultedN), hint: 'Thin process and good outcome' }),
        stat({ label: 'Unmeasured', value: String(q.unmeasuredN), hint: 'Information axis refused or a mixed outcome' })),
    }),
    card({
      title: 'Does process associate with outcome here?',
      subtitle: 'Fisher’s exact test, two-sided, on the 2×2 of frozen process against recorded outcome. Association only: this is not evidence that a better process would have caused a better outcome.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({
            label: 'p-value',
            value: q.test.refused ? 'refused' : q.test.p === null ? '—' : q.test.p.toFixed(3),
            tone: q.test.refused ? '' : q.test.p !== null && q.test.p < 0.05 ? 'warn' : '',
            hint: q.test.refused ? q.test.reason : 'Exact two-sided hypergeometric sum; a small p is a fact about this workspace, not a law.',
          }),
          stat({ label: 'Graded and measurable', value: String(q.measuredN), hint: `Floor ${report.conventions.hindsightSettledFloor}; below it every pattern looks significant` }),
          stat({ label: 'Thin process', value: String(q.thinN), hint: 'Resulted plus fixable' }),
          stat({ label: 'Sound process', value: String(q.thickN), hint: 'Earned plus variance' })),
        q.test.refused ? h('p', { class: 'muted' }, q.test.reason) : h('p', { class: 'muted' },
          `Under independence this workspace would expect ${q.test.expected} resulted decision(s) from the mix it has; it recorded ${q.resultedN}.`)),
    }),
    card({
      title: 'By dated lock cohort',
      subtitle: 'Each month of decision dates. A share is refused below the declared floor — a direction, not a trend line.',
      body: report.cohorts.length
        ? table({
          caption: 'Resulting share by month of decision date',
          columns: [
            { label: 'Cohort', render: (row) => h('strong', null, row.key) },
            { label: 'Locks', render: (row) => String(row.locksN) },
            { label: 'Good outcomes', render: (row) => String(row.goodN) },
            { label: 'Resulted', render: (row) => String(row.resultedN) },
            { label: 'Share', render: (row) => (row.refused ? 'refused' : `${row.sharePct}% (${row.shareLowPct}–${row.shareHighPct}%)`) },
          ],
          rows: report.cohorts,
          emptyMessage: 'No cohorts yet.',
        })
        : emptyState({ title: 'No cohorts yet', body: 'Cohorts appear once decisions carry dated locks.' }),
    }));
}

/* ----------------------------------------------------------- roll-up */

function rollupPanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: `Roll-up as ${report.seat.label}`,
      body: report.seat.rank <= 3
        ? 'Per-span cells inside your own span, each suppressed below the declared cell floor with a complementary partner so a total cannot be differenced back into a withheld cell.'
        : 'Above director rank the per-span rows are withheld: this panel prints counts by altitude, which is what the altitude is competent to act on.',
    }),
    card({
      title: 'By altitude',
      body: report.altitudeRows.length
        ? table({
          caption: 'Locks and quadrants by leadership altitude',
          columns: [
            { label: 'Altitude', render: (row) => h('strong', null, row.altitudeKey) },
            { label: 'Locks', render: (row) => (row.suppressed ? 'suppressed' : String(row.locksN)) },
            { label: 'Measured', render: (row) => (row.suppressed ? 'suppressed' : String(row.measuredN)) },
            { label: 'Earned', render: (row) => (row.suppressed ? 'suppressed' : String(row.earned)) },
            { label: 'Resulted', render: (row) => (row.suppressed ? 'suppressed' : String(row.resulted)) },
            { label: 'Variance', render: (row) => (row.suppressed ? 'suppressed' : String(row.variance)) },
            { label: 'Fixable', render: (row) => (row.suppressed ? 'suppressed' : String(row.fixable)) },
            { label: 'Unmeasured', render: (row) => (row.suppressed ? 'suppressed' : String(row.unmeasured)) },
          ],
          rows: report.altitudeRows,
          emptyMessage: 'Nothing locked in scope yet.',
        })
        : emptyState({ title: 'Nothing in scope', body: 'No lock is owned inside this seat.' }),
    }),
    report.seat.rank <= 3
      ? card({
        title: 'By span',
        subtitle: 'Your own subtree only. A suppressed cell is blanked, and when exactly one cell would be suppressed its smallest partner is blanked with it.',
        body: report.seatRows.length
          ? table({
            caption: 'Locks and quadrants by reporting span inside your subtree',
            columns: [
              { label: 'Span', render: (row) => h('strong', null, row.name) },
              { label: 'Altitude', render: (row) => row.altitudeKey || '—' },
              { label: 'Locks', render: (row) => (row.suppressed ? 'suppressed' : String(row.locksN)) },
              { label: 'In subtree', render: (row) => String(row.subtreeLockN) },
              { label: 'Earned', render: (row) => (row.suppressed ? 'suppressed' : String(row.earnedN)) },
              { label: 'Resulted', render: (row) => (row.suppressed ? 'suppressed' : String(row.resultedN)) },
              { label: 'Fixable', render: (row) => (row.suppressed ? 'suppressed' : String(row.fixableN)) },
              { label: 'Withheld', render: (row) => (row.complementary ? badge('complementary', 'neutral', 'Blanked so its partner cannot be recovered by subtraction') : row.suppressed ? badge('small cell', 'neutral') : '') },
            ],
            rows: report.seatRows,
            emptyMessage: 'No span in your subtree owns a lock yet.',
          })
          : emptyState({ title: 'Nothing below you yet', body: 'Locks owned by the spans inside your subtree appear here.' }),
      })
      : null,
    card({
      title: 'How the roll-up travels',
      body: h('ul', { class: 'list' },
        h('li', null, 'Every lock is a graph node: one edge to the decision it audits, one edge per consulted fact, and one roll-up edge to every leadership ancestor — written in the same transaction as the lock itself.'),
        h('li', null, 'A process finding is owned at the span that holds the decision and rolls up the chain of command like any other decision in this workspace.'),
        h('li', null, 'Nothing is re-entered by hand anywhere on the way up: the aggregate is recomputed from the same locks at every altitude, at that altitude’s own disclosure limit.')),
    }),
    card({
      title: 'Most-missed requirements',
      subtitle: 'Diagnosis of the RECORD, not of a person: which declared requirement the frozen process claims were missing most often.',
      body: report.requirements.length
        ? table({
          caption: 'Declared decision requirements and how often the frozen record was missing them',
          columns: [
            { label: 'Requirement', render: (row) => h('strong', null, row.label) },
            { label: 'Missing on', render: (row) => `${row.missingN} frozen record(s)` },
            { label: 'Met on', render: (row) => String(row.metN) },
          ],
          rows: report.requirements,
          emptyMessage: 'No requirement missing anywhere in scope.',
        })
        : emptyState({ title: 'Nothing missing', body: 'Every frozen record met every declared requirement.' }),
    }));
}

/* ----------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const c = report.conventions;
  const setConventions = (patch) => notify(ctx.api.hindsightSetConventions(patch), 'Conventions re-declared; every quadrant and rate was recomputed from the same locks.');
  const field = (key, label, hint, min, max) => h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('input', {
      class: 'input',
      type: 'number',
      min: String(min),
      max: String(max),
      value: String(c[key]),
      onChange: (event) => {
        const value = Number(event.target.value);
        if (Number.isFinite(value)) setConventions({ [key]: value });
      },
    }),
    h('span', { class: 'field-hint' }, hint));
  return h('div', { class: 'stack' },
    card({ title: 'The premise, stated once', body: h('p', null, report.premise) }),
    card({
      title: 'What is claimed, and what is refused',
      body: h('ul', { class: 'list' }, ...Object.values(report.disclosure).map((line) => h('li', null, line))),
    }),
    card({
      title: 'Conventions',
      subtitle: 'These are declarations with defaults, printed beside every rate they produce — never fitted values. Changing one re-prices every quadrant and rate from the same frozen locks; it never rewrites a lock.',
      body: h('div', { class: 'field-grid' },
        field('hindsightQualityFloor', 'Process floor (of 5)', 'The frozen record’s own quality bar at or above which the process axis counts as sound.', 2, 5),
        field('hindsightCoveragePct', 'Coverage floor (%)', 'The share of the knowable set a decision must have consulted to count as informed.', 30, 95),
        field('hindsightFactFloor', 'Fact floor', 'Below this many dated facts, coverage is refused rather than printed.', 2, 10),
        field('hindsightGapFloor', 'Gap floor', 'Knowable-and-unconsulted facts at or above which a gap finding is worth opening.', 1, 10),
        field('hindsightSettledFloor', 'Settled floor', 'Below this many graded, measurable decisions no resulting share and no p-value are printed.', 4, 40),
        field('hindsightCellFloor', 'Cell floor', 'The smallest cell the roll-up may print.', 2, 10),
        field('hindsightReviewGraceDays', 'Review grace (days)', 'Days after a decision’s own review date before it counts as ungraded.', 0, 90)),
      actions: [h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.hindsightScan(), 'Scan complete.') }, 'Re-audit every lock')],
    }),
    card({
      title: 'Where the numbers come from',
      body: h('ul', { class: 'list' },
        h('li', null, 'Frozen process claim: the decision module’s own five-requirement quality bar, evaluated on the record as it stood at freeze time. One definition of a well-formed decision in this workspace, not two.'),
        h('li', null, 'Coverage: a Wilson (1927) score interval on known ÷ (known + knowable-and-unconsulted), refused below the declared fact floor.'),
        h('li', null, 'Association: Fisher’s exact test, two-sided, by exact hypergeometric enumeration over the observed margins — not a chi-square approximation, because these tables are small by construction.'),
        h('li', null, 'Resulting share: a Wilson interval on the share of good outcomes whose frozen process was thin, refused below the same floor as the cells.')),
    }));
}

/* ------------------------------------------------------------- render */

export function renderHindsight(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.hindsightReport();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The process audit could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'locks'
      ? locksPanel(ctx, report)
      : panel === 'information'
        ? informationPanel(ctx, report)
        : panel === 'luck'
          ? luckPanel(ctx, report)
          : panel === 'rollup'
            ? rollupPanel(ctx, report)
            : methodPanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Integrity',
      title: 'The Hindsight Lock',
      subtitle: 'What did you know when you decided — and were your wins earned, or merely survived?',
      actions: [
        badge(`${report.summary.locksN} lock(s)`, 'neutral', 'One frozen information set per decision'),
        report.quadrants.resultedN
          ? badge(`${report.quadrants.resultedN} resulted`, 'warn', 'Good outcome, thin process — the lesson nobody reviews')
          : badge('no resulting', 'good', 'No good outcome in scope came out of a thin process'),
        report.summary.overdueN
          ? badge(`${report.summary.overdueN} ungraded`, 'warn', 'Decisions past their review grace with no outcome')
          : badge('all graded', 'good', 'Every decided lock inside its grace has an outcome'),
        h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.hindsightScan(), 'Scan complete.') }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: () => exportCsv(ctx) }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
      ],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Hindsight panels' }),
    body,
  );
}
