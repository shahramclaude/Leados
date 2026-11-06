/**
 * app/views/jurisdiction.js — `#/jurisdiction`, the Jurisdiction Compiler
 * (ADR-0109, ADR-0111, Schema v111).
 *
 * Six panels, six questions, and a DIFFERENT answer at every altitude:
 *   Map      "Which of my objectives is another branch also working, and who
 *            could resolve the whole thing?"
 *   Hygiene  "Which open work records carry no objective pointer or name a
 *            dropped/deleted goal — and what can my span anchor right now?"
 *   Options  "What do the coalition, the escalation and the boundary redraw
 *            each cost — and which one does the record actually favour?"
 *   Redraw   "If I re-parent this branch head, which cross-branch objectives
 *            collapse, which rolls-up-to edges move, which governed decisions
 *            go stale — and what did nothing?" (director-and-above; dry run)
 *   Grades   "Was the governance route this ledger predicted the one a human
 *            chose?"
 *   Method   "What is declared, clamped, named and refused?"
 *
 * Above the manager detail ceiling the shell serves COMPILED, identity-free
 * cell tables and an auto-generated board-ready synthesis; no objective key,
 * member id, person, title or note is ever rendered there. A suppressed cell is
 * BLANK with its reason, never a zero. This is not differential privacy.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { formatDate } from '../core/time.js';
import { buildSeats, activeSeat } from '../core/domain/seat.js';
import {
  JUR_CONVENTION_BOUNDS, JUR_CONVENTION_DEFAULTS, JUR_GOVERNANCE_OPTIONS,
  JUR_PANELS, JUR_REFUSALS, JUR_ALTITUDE_QUESTIONS,
} from '../core/domain/jurisdictionRegistry.js';
import {
  jurisdictionRead, jurCsvRows, JUR_CSV_COLUMNS, jurConventions,
} from '../core/domain/jurisdiction.js';
import {
  rehearseBoundaryRedraw, redrawBrief, REDRAW_LIMITS,
} from '../core/domain/redrawRehearsal.js';

const PANELS = JUR_PANELS;
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const units = (v) => (v === null || v === undefined ? '—' : `${v} units`);
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const objectiveLabel = (key) => {
  const raw = String(key || '');
  return raw.startsWith('goal:') ? `Objective ${raw.slice(5, 17)}` : `Objective ${raw.slice(0, 12)}`;
};

function safeRead(ctx) {
  try {
    return jurisdictionRead(ctx.state, { now: ctx.now, settings: ctx.state.settings || {} });
  } catch (error) {
    return {
      ok: false, error: String(error?.message || error),
      book: { clusters: [], priced: [], refused: [], totals: {}, hygiene: { openWorkN: 0, anchoredWorkN: 0, unanchoredWorkN: 0, danglingWorkN: 0 } },
      cells: [], hygieneBySource: [], hygieneQueue: [], eligibleGoals: [], ownSpanClusterKeys: [], grades: [],
      withheld: false, conventions: jurConventions({}), brief: '',
    };
  }
}

function seatOf(ctx) {
  try {
    const built = buildSeats(ctx.state, { now: ctx.now, settings: ctx.state.settings || {} });
    return { built, seat: activeSeat(built) };
  } catch {
    return { built: null, seat: null };
  }
}

function act(ctx, fn, okMessage) {
  const result = fn();
  if (!result || result.ok === false) { toast(result?.error || 'That did not work.', 'bad'); return false; }
  if (result.warning) toast(result.warning, 'bad');
  else toast(okMessage, 'good');
  ctx.render?.();
  return true;
}

function openAnchorModal(ctx, row, eligibleGoals) {
  if (!eligibleGoals?.length) {
    toast('No active goals are visible to this seat yet. Create or activate a goal in Goals first.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'goalId',
      label: 'Active objective',
      type: 'select',
      value: eligibleGoals[0].id,
      options: eligibleGoals.map((g) => ({ value: g.id, label: `${g.title} (${g.status})` })),
      help: 'Writes a persistent impacts-goal edge (and updates direct objective fields where applicable) in one atomic transaction.',
    },
  ]);
  openModal({
    title: 'Anchor work record to an active objective',
    description: `Bind “${row.title}” (${row.sourceLabel}) to a live goal inside your span. If another branch is also working that goal, RULE-JUR-01 detects and rolls up the shared mandate in the same commit.`,
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const { goalId } = form.getValues();
        const res = ctx.api.jurAnchorWork({ entityType: row.entityType, recordId: row.recordId, goalId });
        if (!res || res.ok === false) { toast(res?.error || 'Could not anchor work record.', 'bad'); return; }
        closeAllModals();
        toast('Anchored work record to active objective.', 'good');
        ctx.render?.();
      } }, 'Anchor objective'),
    ],
  });
}

/* --------------------------------------------------------------- panels */

function mapPanel(ctx, read, query) {
  const book = read.book;
  if (read.withheld) {
    const rows = (read.cells || []).map((cell) => ({
      rank: `Rank ${cell.rank}`,
      clusters: cell.clusters,
      priced: cell.suppressed ? '—' : cell.priced,
      refused: cell.suppressed ? '—' : cell.refused,
      openWork: cell.openWork ?? 0,
      pointerRefusals: cell.hygieneSuppressed ? '—' : ((cell.unanchoredWork ?? 0) + (cell.danglingWork ?? 0)),
      verdict: cell.suppressed ? 'withheld' : 'measured',
      reason: cell.reason || cell.hygieneReason || '',
    }));
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: `${read.seat?.label || 'This altitude'} reads the jurisdiction map as compiled counts`,
        body: 'Objective keys, member records and person detail are withheld above the manager ceiling (ADR-0086). You are reading identity-free altitude cells with small-cell suppression, alongside counted objective-pointer refusals so dark work never masquerades as alignment.' }),
      table({ caption: 'Cross-branch objectives and pointer hygiene by leadership rank', emptyMessage: 'No cross-branch objectives on record.',
        columns: [
          { label: 'Altitude', key: 'rank' },
          { label: 'Cross-branch objectives', key: 'clusters' },
          { label: 'Priced', key: 'priced' },
          { label: 'Refused', key: 'refused' },
          { label: 'Open work', key: 'openWork' },
          { label: 'Pointer refusals', key: 'pointerRefusals' },
          { label: 'Verdict', key: 'verdict' },
          { label: 'Reason', key: 'reason' },
        ], rows }),
      card({ title: 'Board-ready synthesis', subtitle: 'Auto-generated from the workspace graph — no model, no network, no invented figure.',
        body: h('p', { class: 'muted' }, read.brief) }));
  }

  const scopedSeat = Boolean(read.seat && !read.seat.fullAccess && !read.seat.readOnly);
  const ownSet = new Set(read.ownSpanClusterKeys || []);
  const scopeFilter = scopedSeat && query.get('scope') === 'span' ? 'span' : 'all';
  const sourceClusters = scopeFilter === 'span'
    ? book.clusters.filter((c) => ownSet.has(c.objectiveKey))
    : book.clusters;

  const rows = sourceClusters.map((c) => ({
    objective: objectiveLabel(c.objectiveKey),
    inSpan: ownSet.has(c.objectiveKey),
    members: c.evidenceN,
    branches: c.coalitionSize,
    rungs: c.escalationRungs,
    route: c.verdict === 'priced' ? c.predictedOption : '—',
    confidence: c.confidencePct,
    verdict: c.verdict,
    reason: c.verdict === 'refused' ? (c.refusalKey || '') : '',
  }));

  const controls = scopedSeat ? h('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap;' },
    h('button', {
      class: scopeFilter === 'all' ? 'btn btn-primary' : 'btn btn-ghost',
      type: 'button',
      onClick: () => ctx.navigate('#/jurisdiction'),
    }, `All cross-branch (${book.clusters.length})`),
    h('button', {
      class: scopeFilter === 'span' ? 'btn btn-primary' : 'btn btn-ghost',
      type: 'button',
      onClick: () => ctx.navigate('#/jurisdiction?scope=span'),
    }, `Touching my span (${ownSet.size})`),
  ) : null;

  const hygieneCallout = read.spanHygiene && read.spanHygiene.actionable > 0
    ? banner({
      tone: 'warn',
      title: `${read.spanHygiene.actionable} open work record(s) in your span carry an unanchored or dangling objective pointer`,
      body: 'Unanchored or dropped-goal work is counted as a refusal rather than priced blindly. Open Pointer hygiene to anchor local cases or calls to an active objective in one click.',
      actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/jurisdiction?panel=hygiene') }, 'Open Pointer hygiene')],
    })
    : null;

  if (!rows.length) {
    return h('div', { class: 'stack' },
      controls,
      hygieneCallout,
      emptyState({
        title: scopeFilter === 'span' ? 'No cross-branch objectives touch your span right now' : 'No cross-branch objectives detected',
        body: scopeFilter === 'span'
          ? 'None of the currently anchored cross-branch objectives includes a work record in your reporting subtree. Check Pointer hygiene if local open work has not been anchored to a goal yet.'
          : 'Every anchored objective on record is worked inside a single reporting branch, so one seat already holds the mandate. Check Pointer hygiene for unanchored or dangling work records, or run Compile now.',
      }));
  }

  const columns = [
    { label: 'Objective', key: 'objective' },
    ...(scopedSeat ? [{ label: 'Span', render: (r) => badge(r.inSpan ? 'your span' : 'peer branches', r.inSpan ? 'good' : 'neutral') }] : []),
    { label: 'Work records', key: 'members' },
    { label: 'Branches', key: 'branches' },
    { label: 'Rungs to the ancestor', key: 'rungs' },
    { label: 'Predicted route', key: 'route' },
    { label: 'Confidence floor', render: (r) => pct(r.confidence) },
    { label: 'Verdict', render: (r) => badge(r.verdict, r.verdict === 'priced' ? 'good' : 'neutral') },
    { label: 'Reason', key: 'reason' },
  ];

  return h('div', { class: 'stack' },
    controls,
    hygieneCallout,
    table({ caption: 'Cross-branch objectives and their minimal covering coalitions', emptyMessage: 'No cross-branch objectives.',
      columns, rows }),
    h('p', { class: 'tiny muted' }, 'An objective key is an opaque goal pointer, never a title. Clusters pointing at a missing or dropped goal are counted and refused (`dangling-objective`), never priced.'));
}

function hygienePanel(ctx, read) {
  const totals = read.book.totals || {};
  const sourceRows = (read.hygieneBySource || []).map((s) => ({
    source: s.label,
    open: s.open,
    anchored: s.suppressed ? '—' : dash(s.anchored),
    unanchored: s.suppressed ? '—' : dash(s.unanchored),
    dangling: s.suppressed ? '—' : dash(s.dangling),
    floor: s.suppressed ? '—' : pct(s.anchoringLoPct),
    verdict: s.suppressed ? 'withheld' : (s.open === 0 ? 'empty' : ((s.unanchored + s.dangling) > 0 ? 'refusals-counted' : 'complete')),
    reason: s.reason || '',
  }));

  const statsStrip = h('div', { class: 'grid-3' },
    stat({
      label: 'Anchored / open work',
      value: `${dash(totals.anchoredWork ?? 0)} / ${dash(totals.openWork ?? 0)}`,
      hint: read.spanHygiene ? `${read.spanHygiene.anchoredWork}/${read.spanHygiene.openWork} inside your span` : 'All open cases, calls and funded items',
    }),
    stat({
      label: 'Counted pointer refusals',
      value: `${dash(totals.unanchoredWork ?? 0)} unanchored · ${dash(totals.danglingWork ?? 0)} dangling`,
      hint: 'Surface-counted, never silently dropped',
    }),
    stat({
      label: 'Anchoring completeness floor',
      value: pct(totals.anchoringLoPct),
      hint: totals.anchoringLoPct === null ? 'Refused below evidence floor' : 'Wilson (1927) 95% lower bound',
    }));

  if (read.withheld) {
    const rankRows = (read.cells || []).map((cell) => ({
      rank: `Rank ${cell.rank}`,
      open: cell.openWork ?? 0,
      anchored: cell.hygieneSuppressed ? '—' : dash(cell.anchoredWork),
      unanchored: cell.hygieneSuppressed ? '—' : dash(cell.unanchoredWork),
      dangling: cell.hygieneSuppressed ? '—' : dash(cell.danglingWork),
      floor: cell.hygieneSuppressed ? '—' : pct(cell.anchoringLoPct),
      verdict: cell.hygieneSuppressed ? 'withheld' : (cell.openWork === 0 ? 'empty' : 'measured'),
      reason: cell.hygieneReason || '',
    }));
    return h('div', { class: 'stack' },
      statsStrip,
      banner({
        tone: 'info',
        title: `${read.seat?.label || 'This altitude'} reads objective-pointer hygiene as compiled rates`,
        body: 'Individual work records and titles are withheld above rank 2. Heckman (1979) sample-selection check: if a large share of open work is unanchored or tied to dropped goals, cross-branch boundary counts are a lower bound on true coordination load.',
      }),
      table({
        caption: 'Objective-pointer hygiene by work source',
        emptyMessage: 'No work sources registered.',
        columns: [
          { label: 'Work source', key: 'source' },
          { label: 'Open records', key: 'open' },
          { label: 'Anchored', key: 'anchored' },
          { label: 'Unanchored', key: 'unanchored' },
          { label: 'Dangling / dropped', key: 'dangling' },
          { label: 'Wilson floor', key: 'floor' },
          { label: 'Verdict', key: 'verdict' },
          { label: 'Reason', key: 'reason' },
        ],
        rows: sourceRows,
      }),
      table({
        caption: 'Objective-pointer hygiene by leadership rank',
        emptyMessage: 'No open work records.',
        columns: [
          { label: 'Altitude', key: 'rank' },
          { label: 'Open records', key: 'open' },
          { label: 'Anchored', key: 'anchored' },
          { label: 'Unanchored', key: 'unanchored' },
          { label: 'Dangling / dropped', key: 'dangling' },
          { label: 'Wilson floor', key: 'floor' },
          { label: 'Verdict', key: 'verdict' },
          { label: 'Reason', key: 'reason' },
        ],
        rows: rankRows,
      }));
  }

  const queue = read.hygieneQueue || [];
  const goals = read.eligibleGoals || [];
  return h('div', { class: 'stack' },
    statsStrip,
    table({
      caption: 'Objective-pointer hygiene by work source',
      emptyMessage: 'No work sources.',
      columns: [
        { label: 'Work source', key: 'source' },
        { label: 'Open records', key: 'open' },
        { label: 'Anchored', key: 'anchored' },
        { label: 'Unanchored', key: 'unanchored' },
        { label: 'Dangling / dropped', key: 'dangling' },
        { label: 'Wilson floor', key: 'floor' },
        { label: 'Reason', key: 'reason' },
      ],
      rows: sourceRows,
    }),
    queue.length
      ? card({
        title: read.seat && !read.seat.fullAccess ? 'Span pointer remediation queue' : 'Workspace pointer remediation queue',
        subtitle: 'Open work records inside your detail boundary with no goal pointer or a missing/dropped goal id. Anchoring writes a typed impacts-goal link and runs RULE-JUR-01 in one atomic write.',
        body: table({
          caption: 'Unanchored and dangling open work records eligible for anchoring',
          emptyMessage: 'Every open work record in your span is anchored to an active goal.',
          columns: [
            { label: 'Source', key: 'sourceLabel' },
            { label: 'Work record', key: 'title' },
            { label: 'Dated', render: (r) => dash(r.date) },
            {
              label: 'Refusal',
              render: (r) => badge(
                r.pointerState === 'dangling' ? `dangling (${r.goalStatus})` : 'unanchored',
                r.pointerState === 'dangling' ? 'bad' : 'neutral',
              ),
            },
            { label: 'Printed reason', key: 'reasonNote' },
            {
              label: 'Remediate',
              render: (r) => h('button', {
                class: 'btn btn-ghost',
                type: 'button',
                onClick: () => openAnchorModal(ctx, r, goals),
              }, r.pointerState === 'dangling' ? 'Re-point goal' : 'Anchor goal'),
            },
          ],
          rows: queue,
        }),
      })
      : emptyState({
        title: 'Every visible open work record is anchored to a live objective',
        body: 'No unanchored or dangling goal pointers exist inside this seat’s detail boundary.',
      }),
    h('p', { class: 'tiny muted' }, 'Heckman (1979) sample-selection defence: unlinked open work is never silently dropped from the denominator, and a record pointing at a deleted or dropped goal is never priced into a phantom boundary decision.'));
}

function optionsPanel(ctx, read) {
  if (read.withheld) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: `${read.seat?.label || 'This altitude'} reads governance options as workspace aggregates`,
        body: 'Item-level objective keys are withheld above rank 2. Export the aggregate CSV or read the Map synthesis for route frequencies and suppression-safe altitude cells.',
      }),
      card({ title: 'Board-ready synthesis', subtitle: 'Identity-free governance summary.',
        body: h('p', { class: 'muted' }, read.brief) }));
  }
  const priced = read.book.priced || [];
  const refused = read.book.refused || [];
  if (!priced.length && !refused.length) {
    return emptyState({ title: 'No governance routes priced yet', body: 'Run Compile now, or register two teams’ work against one objective. Every priced route prints its arithmetic; every refusal prints its reason.' });
  }
  const routeCards = JUR_GOVERNANCE_OPTIONS.map((o) => card({
    title: o.label,
    subtitle: o.question,
    body: h('div', { class: 'stack' },
      h('p', { class: 'tiny muted' }, o.note),
      kv('Framework', o.key === 'coalition' ? 'Riker (1962) size principle · minimal antichain' : o.key === 'escalate' ? 'Ashby (1956) requisite variety · Jaques horizons' : 'Coase (1937) / Williamson (1975) governance choice')),
  }));
  const rows = [...priced, ...refused].map((c) => ({
    objective: objectiveLabel(c.objectiveKey),
    coalition: units(c.costCoalition),
    escalate: units(c.costEscalate),
    redraw: units(c.costRedraw),
    advantage: c.advantagePct === null ? '—' : pct(c.advantagePct),
    predicted: c.verdict === 'priced' ? `${c.predictedOption} (${Math.round((c.predictedProbability || 0) * 100)}%)` : 'withheld',
    verdict: c.verdict,
    reason: c.refusalNote || '',
  }));
  return h('div', { class: 'stack' },
    h('div', { class: 'grid-3' }, ...routeCards),
    table({ caption: 'Three priced governance routes per cross-branch objective', emptyMessage: 'No clusters.',
      columns: [
        { label: 'Objective', key: 'objective' },
        { label: 'Coalition (handoff cost)', key: 'coalition' },
        { label: 'Escalate (rung cost)', key: 'escalate' },
        { label: 'Redraw (one-off)', key: 'redraw' },
        { label: 'Advantage', key: 'advantage' },
        { label: 'Predicted (Luce 1959)', key: 'predicted' },
        { label: 'Verdict', render: (r) => badge(r.verdict, r.verdict === 'priced' ? 'good' : 'neutral') },
        { label: 'Reason', key: 'reason' },
      ], rows }),
    h('p', { class: 'tiny muted' }, 'Coordination units are DECLARED, clamped and printed on the Method panel — not money, not fitted from the record. A route is recommended only when it beats the runner-up by the declared materiality band; a dangling goal pointer or tie is refused with its printed reason.'));
}

function gradesPanel(ctx, read) {
  const findings = Array.isArray(ctx.state?.jurFindings) ? ctx.state.jurFindings : [];
  const graded = findings.filter((f) => f?.status === 'graded');
  const ungradable = findings.filter((f) => f?.status === 'ungradable');
  const frozen = findings.filter((f) => f?.status === 'frozen');
  const stats = h('div', { class: 'grid-3' },
    stat({ label: 'Graded once', value: graded.length, hint: 'Out of sample, Brier vs 0.5 base' }),
    stat({ label: 'Stored refusals', value: ungradable.length, hint: 'Never a zero' }),
    stat({ label: 'Awaiting a dated choice', value: frozen.length, hint: 'Silence is not consent' }));
  if (read.withheld) {
    return h('div', { class: 'stack' },
      stats,
      banner({
        tone: 'info',
        title: 'Individual finding keys are withheld above rank 2',
        body: 'Grades are exported per governance route in the aggregate CSV once the cohort clears the declared cell floor.',
      }));
  }
  const rows = [...graded, ...ungradable, ...frozen].map((f) => ({
    objective: objectiveLabel(f.objectiveKey),
    predicted: f.predictedOption ? `${f.predictedOption} (${Math.round((f.predictedProbability || 0) * 100)}%)` : '—',
    actual: f.actualOption || '—',
    brier: f.brier === null || f.brier === undefined ? '—' : f.brier,
    skill: f.skill === null || f.skill === undefined ? '—' : f.skill,
    status: f.status,
    note: f.gradeNote || (f.status === 'frozen' ? JUR_REFUSALS.ungraded : ''),
  }));
  return h('div', { class: 'stack' },
    stats,
    rows.length ? table({ caption: 'Once-only governance forecast grades', emptyMessage: 'No frozen findings yet.',
      columns: [
        { label: 'Objective', key: 'objective' },
        { label: 'Predicted route', key: 'predicted' },
        { label: 'Human choice', key: 'actual' },
        { label: 'Brier', key: 'brier' },
        { label: 'Skill', key: 'skill' },
        { label: 'Status', render: (r) => badge(r.status, r.status === 'graded' ? 'good' : 'neutral') },
        { label: 'Note', key: 'note' },
      ], rows })
      : emptyState({ title: 'No governance forecast has been frozen', body: 'Run Compile now. A finding is graded exactly once, from the dated choice a human actually made on the governed decision it opened.' }),
    h('p', { class: 'tiny muted' }, 'A missing choice, a missing date or a postdated review is a STORED REFUSAL, never a miss. Nothing here rates a leader; the unit is one objective and one dated decision.'));
}

/* -------------------------------------------- boundaries as a premortem */

const redrawPersonLabel = (p) => `${p.name || p.id}${p.role ? ` — ${p.role}` : ''}${p.team ? ` (${p.team})` : ''}`;

function rehearsalStats(report) {
  const d = report.deltas || {};
  const sign = (v) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v}`);
  return h('div', { class: 'grid-4' },
    stat({ label: 'Cross-branch objectives', value: `${report.before.crossBranch} → ${report.after.crossBranch}`, hint: `Δ ${sign(d.crossBranch)} across the redraw` }),
    stat({ label: 'Predicted coordination load', value: `${dash(report.before.recommendedUnits)} → ${dash(report.after.recommendedUnits)}`, hint: `Δ ${sign(d.recommendedUnits)} declared units, per pricing period` }),
    stat({ label: 'One-off redraw cost', value: `${report.oneOffUnits} units`, hint: `${report.moves.length} move(s) × declared jurRedrawUnits` }),
    stat({ label: 'Break-even', value: report.breakEvenPeriods === null ? '—' : `${report.breakEvenPeriods} period(s)`, hint: report.breakEvenPeriods === null ? 'Load does not fall — see note below' : 'On declared units, not money' }));
}

function changeTable({ caption, rows, emptyMessage, columns }) {
  return table({ caption, emptyMessage, columns, rows });
}

/**
 * A declared, enforced (non-full-access) seat rehearses inside its own span:
 * objective pointers are replaced with ordinals and roll-up targets outside
 * the seat's scope are named only as "a span above your boundary" — the same
 * compiled-altitude ceiling the Map honours. The operator view prints real
 * names. `scope === null` means unenforced (operator).
 */
export function redactRehearsalReport(report, scope) {
  if (!scope) return report;
  const ordinals = new Map();
  const anon = (key) => {
    const k = String(key || '');
    if (!ordinals.has(k)) ordinals.set(k, `Objective ${ordinals.size + 1}`);
    return ordinals.get(k);
  };
  const maskSpan = (id, name) => ((id === 'leader' || scope.has(String(id))) ? name : 'A span above your boundary');
  const maskEdge = (id, name) => (scope.has(String(id)) || String(id) === 'leader' ? name : 'A span above your boundary');
  const mapEdges = (row) => ({
    ...row,
    findingId: null,
    governedDecisionId: null,
    objective: anon(row.objectiveKey),
    objectiveKey: null,
    withdrawn: (row.withdrawn || []).map((n, i) => maskEdge((row.withdrawnIds || [])[i], n)),
    added: (row.added || []).map((n, i) => maskEdge((row.addedIds || [])[i], n)),
    withdrawnIds: [],
    addedIds: [],
  });
  return {
    ...report,
    collapsed: report.collapsed.map((r) => ({ ...r, objectiveKey: null, objective: anon(r.objectiveKey), lcaBefore: maskSpan(r.lcaBeforeId, r.lcaBefore), lcaAfter: maskSpan(r.lcaAfterId, r.lcaAfter), lcaBeforeId: null, lcaAfterId: null })),
    created: report.created.map((r) => ({ ...r, objectiveKey: null, objective: anon(r.objectiveKey), lcaAfter: maskSpan(r.lcaAfterId, r.lcaAfter), lcaBeforeId: null, lcaAfterId: null })),
    changed: report.changed.map((r) => ({ ...r, objectiveKey: null, objective: anon(r.objectiveKey), lcaBefore: maskSpan(r.lcaBeforeId, r.lcaBefore), lcaAfter: maskSpan(r.lcaAfterId, r.lcaAfter), lcaBeforeId: null, lcaAfterId: null })),
    rollups: {
      ...report.rollups,
      moved: report.rollups.moved.map(mapEdges),
      readingMoves: report.rollups.readingMoves.map((r) => ({ ...r, nodeId: null, readingId: null, spanName: scope.has(String(r.nodeId)) ? r.spanName : 'A span above your boundary' })),
    },
    decisions: { ...report.decisions, stale: report.decisions.stale.map((d) => ({ ...d, decisionId: null, objective: anon(d.objectiveKey), objectiveKey: null, fromLca: maskSpan(d.fromLcaId, d.fromLca), toLca: maskSpan(d.toLcaId, d.toLca), fromLcaId: null, toLcaId: null })) },
  };
}

function renderRehearsalResults(report, ctx) {
  const frag = h('div', { class: 'stack' });
  frag.appendChild(banner({
    tone: report.ok ? 'good' : 'warn',
    title: report.ok ? 'Rehearsal complete — nothing was written' : 'Rehearsal refused',
    body: report.ok ? report.disclaimer : (report.reasonNote || 'No valid move was selected.'),
  }));
  if (!report.ok) {
    if (report.refusedMoves?.length) {
      frag.appendChild(table({
        caption: 'Refused moves — printed, never silently dropped', emptyMessage: 'No refused moves.',
        columns: [{ label: 'Person', render: (r) => dash(r.personName || r.personId || '—') }, { label: 'Destination', key: 'to' }, { label: 'Reason', key: 'reasonNote' }],
        rows: report.refusedMoves,
      }));
    }
    return frag;
  }
  if (report.refusedMoves?.length) {
    frag.appendChild(banner({
      tone: 'warn',
      title: `${report.refusedMoves.length} move(s) were refused and were NOT applied`,
      body: 'The rehearsal ran on the surviving moves only. Each refusal is printed below with its reason.',
    }));
    frag.appendChild(table({
      caption: 'Refused moves', emptyMessage: 'None.',
      columns: [{ label: 'Person', render: (r) => dash(r.personName || r.personId || '—') }, { label: 'Destination', key: 'to' }, { label: 'Reason', key: 'reasonNote' }],
      rows: report.refusedMoves,
    }));
  }
  frag.appendChild(card({
    title: 'Proposed moves',
    subtitle: 'Applied to a cloned roster only. The live workspace is untouched.',
    body: table({
      caption: 'Reporting lines the rehearsal moved', emptyMessage: 'No moves applied.',
      columns: [
        { label: 'Person', render: (r) => dash(r.personName || r.personId) },
        { label: 'From', render: (r) => dash(r.fromManagerName || 'Workspace leader') },
        { label: 'To', render: (r) => dash(r.toManagerName || 'Workspace leader') },
      ],
      rows: report.moves,
    }),
  }));
  frag.appendChild(rehearsalStats(report));
  frag.appendChild(h('p', { class: 'tiny muted' }, report.breakEvenNote));

  const caps = changeTable({
    caption: 'COLLAPSES — cross-branch objectives that would close under the redraw',
    emptyMessage: 'No cross-branch objective would collapse.',
    columns: [
      { label: 'Objective', key: 'objective' },
      { label: 'Branches before', key: 'branchesBefore' },
      { label: 'Branches after', key: 'branchesAfter' },
      { label: 'Predicted route after', render: (r) => dash(r.predictedAfter || 'single-span') },
    ],
    rows: report.collapsed,
  });
  frag.appendChild(caps);
  if (report.collapsedN > report.collapsed.length) frag.appendChild(h('p', { class: 'tiny muted' }, `…and ${report.collapsedN - report.collapsed.length} more collapse(s) beyond the printed cap.`));

  frag.appendChild(changeTable({
    caption: 'CREATED — single-branch objectives the redraw would tear open',
    emptyMessage: 'No new cross-branch objective would be created.',
    columns: [
      { label: 'Objective', key: 'objective' },
      { label: 'Branches after', key: 'branchesAfter' },
      { label: 'Ancestor after', render: (r) => `${dash(r.lcaAfter)} (rank ${dash(r.lcaAfterRank)})` },
      { label: 'Predicted route after', render: (r) => dash(r.predictedAfter) },
      { label: 'Verdict after', render: (r) => badge(r.verdictAfter || '—', r.verdictAfter === 'priced' ? 'good' : 'neutral') },
    ],
    rows: report.created,
  }));
  if (report.createdN > report.created.length) frag.appendChild(h('p', { class: 'tiny muted' }, `…and ${report.createdN - report.created.length} more created gap(s) beyond the printed cap.`));

  frag.appendChild(changeTable({
    caption: 'MOVED — still cross-branch, but the geometry changes',
    emptyMessage: 'No surviving cross-branch objective changes LCA, coalition, rungs or route.',
    columns: [
      { label: 'Objective', key: 'objective' },
      { label: 'Ancestor before', render: (r) => `${dash(r.lcaBefore)} (rank ${dash(r.lcaBeforeRank)})` },
      { label: 'Ancestor after', render: (r) => `${dash(r.lcaAfter)} (rank ${dash(r.lcaAfterRank)})` },
      { label: 'Branches', render: (r) => `${r.branchesBefore} → ${r.branchesAfter}` },
      { label: 'Rungs', render: (r) => `${r.rungsBefore} → ${r.rungsAfter}` },
      { label: 'Route', render: (r) => `${dash(r.predictedBefore)} → ${dash(r.predictedAfter)}` },
      { label: 'Δ units', render: (r) => dash(r.deltaUnits) },
    ],
    rows: report.changed,
  }));
  if (report.changedN > report.changed.length) frag.appendChild(h('p', { class: 'tiny muted' }, `…and ${report.changedN - report.changed.length} more moved objective(s) beyond the printed cap.`));

  frag.appendChild(card({
    title: 'Persisted rolls-up-to edges that would move',
    subtitle: 'The audience of each frozen finding (and each span reading) is recomputed on the hypothetical tree. An edge that no longer reaches the right seat is named, not silently rewritten.',
    body: h('div', { class: 'stack' },
      report.rollups.moved.length
        ? table({
          caption: 'Finding roll-ups whose audience would change', emptyMessage: 'None.',
          columns: [
            { label: 'Objective', key: 'objective' },
            { label: 'Why', key: 'reason' },
            { label: 'Withdraw', render: (r) => r.withdrawn.join(', ') || '—' },
            { label: 'Add', render: (r) => r.added.join(', ') || '—' },
          ],
          rows: report.rollups.moved,
        })
        : h('p', { class: 'muted' }, 'No persisted finding roll-up would change audience.'),
      h('p', { class: 'tiny muted' }, `Finding edges: ${report.rollups.withdrawnEdges} withdrawn · ${report.rollups.addedEdges} added. Span readings: ${report.rollups.readingWithdrawn} withdrawn · ${report.rollups.readingAdded} added across ${report.rollups.readingMoves.length} reading(s).`)),
  }));

  frag.appendChild(card({
    title: 'Unsettled governed decisions that would go stale',
    subtitle: 'A decision framed to an ancestor the redraw moves names the wrong seat — exactly the drift an agent exploits (Jensen & Meckling 1976). Stale is a prompt to re-frame, never a verdict.',
    body: h('div', { class: 'stack' },
      report.decisions.stale.length
        ? table({
          caption: 'Governed decisions to re-frame or withdraw BEFORE accepting the redraw', emptyMessage: 'None.',
          columns: [
            { label: 'Decision', key: 'title' },
            { label: 'Objective', key: 'objective' },
            { label: 'Why stale', key: 'reasonNote' },
          ],
          rows: report.decisions.stale,
        })
        : h('p', { class: 'muted' }, 'No unsettled governed decision would go stale.'),
      h('p', { class: 'tiny muted' }, `${report.decisions.settledN} settled decision(s) cannot go stale · ${report.decisions.stillValidN} unsettled decision(s) remain valid at their current rung.`)),
  }));

  frag.appendChild(h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
      const text = redrawBrief(report);
      const saved = downloadText({ filename: `leados-boundary-rehearsal-${String(ctx.now.toISOString()).slice(0, 10)}.txt`, text, mime: 'text/plain' });
      if (saved) { toast('Rehearsal brief downloaded.', 'good'); return; }
      const copy = h('textarea', { class: 'input', rows: 12, readonly: true }, text);
      openModal({
        title: 'Download blocked — copy the brief',
        body: h('div', { class: 'stack' }, h('p', null, 'This browser refused the file download. The rehearsal brief is below; select and copy it.'), copy),
        footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
      });
      copy.focus(); copy.select();
    } }, 'Download rehearsal brief'),
    h('p', { class: 'tiny muted', style: 'flex:1;min-width:200px;' }, 'Ephemeral by design: the report lives in this panel only. Nothing is persisted, so a rehearsal can never half-happen. Accepting an actual redraw is a separate, governed human decision.')));
  return frag;
}

function redrawPanel(ctx, read) {
  const seat = read.seat;
  const rank = seat?.rank || 0;
  const enforced = Boolean(seat && !seat.fullAccess);
  const scope = enforced && seat.scope instanceof Set ? seat.scope : null;
  const canRehearse = !seat || (!seat.readOnly && (seat.fullAccess || rank >= 3));
  if (!canRehearse) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'The boundary rehearsal is a director-and-above instrument',
        body: 'Re-parenting a reporting line is an org-design act held at rank 3 and above (or by a full-access seat). Your seat reads the Jurisdiction map and pointer hygiene instead — the rehearsal names spans across the unit, which is above a rank 1–2 detail boundary.',
      }),
      card({ title: 'What it would show you', subtitle: 'So you know what to ask your director for.',
        body: h('ul', { class: 'stack' },
          h('li', null, 'Which cross-branch objectives would collapse — the shared-mandate gap closes.'),
          h('li', null, 'Which single-branch objectives the redraw would tear open — new coordination load.'),
          h('li', null, 'Which persisted rolls-up-to edges would change audience.'),
          h('li', null, 'Which unsettled governed decisions would go stale and need re-framing first.')) }));
  }

  const peopleAll = (Array.isArray(ctx.state?.people) ? ctx.state.people : [])
    .filter((p) => p && p.id && p.status !== 'archived');
  const scopedPeople = scope ? peopleAll.filter((p) => scope.has(p.id)) : peopleAll;
  const people = scopedPeople
    .filter((p) => p.id !== seat?.nodeId)
    .slice()
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  /* Options are ELEMENTS: a DOM node can live in exactly one parent, so each
     row must build its own copies or the earlier selects end up empty. */
  const personOptions = () => [h('option', { value: '' }, '— no move —')]
    .concat(people.slice(0, 400).map((p) => h('option', { value: p.id }, redrawPersonLabel(p))));
  const leaderName = ctx.state?.settings?.leaderName || 'Workspace leader';
  const managerOptions = () => [h('option', { value: '' }, '— destination —')]
    .concat([h('option', { value: 'leader' }, `${leaderName} (workspace leader)`)])
    .concat(people.slice(0, 400).map((p) => h('option', { value: p.id }, redrawPersonLabel(p))));

  const moveRow = (n) => h('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap;' },
    h('label', { style: 'min-width:140px;', for: `redraw-person-${n}` }, `Move ${n} — person to re-parent`),
    h('select', { id: `redraw-person-${n}`, class: 'input', 'aria-label': `Move ${n} person` }, ...personOptions()),
    h('span', { class: 'tiny muted' }, '→'),
    h('label', { style: 'min-width:120px;', for: `redraw-manager-${n}` }, 'Under'),
    h('select', { id: `redraw-manager-${n}`, class: 'input', 'aria-label': `Move ${n} destination manager` }, ...managerOptions()));

  const resultsHost = h('div', { class: 'stack', 'aria-live': 'polite' });
  const formHost = h('div', { class: 'stack' });
  const runRehearsal = () => {
    const moves = [];
    const incomplete = [];
    for (let n = 1; n <= REDRAW_LIMITS.maxMoves; n += 1) {
      const personEl = formHost.querySelector(`#redraw-person-${n}`);
      const managerEl = formHost.querySelector(`#redraw-manager-${n}`);
      const personId = String(personEl?.value || '').trim();
      const newManagerId = String(managerEl?.value || '').trim();
      if (!personId && !newManagerId) continue;
      if (personId && !newManagerId) { incomplete.push({ personId, personName: null, to: '', reasonKey: 'unknown-manager', reasonNote: 'A person was chosen with no destination — the row is refused, not guessed.' }); continue; }
      moves.push({ personId, newManagerId });
    }
    const raw = rehearseBoundaryRedraw(ctx.state, { moves, now: ctx.now, conventions: read.conventions });
    if (incomplete.length) raw.refusedMoves = [...(raw.refusedMoves || []), ...incomplete];
    resultsHost.replaceChildren(renderRehearsalResults(enforced ? redactRehearsalReport(raw, scope) : raw, ctx));
  };

  const moveReset = () => ctx.navigate('#/jurisdiction?panel=redraw');
  formHost.append(
    moveRow(1), moveRow(2), moveRow(3),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: runRehearsal }, 'Rehearse (dry run)'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: moveReset }, 'Reset')),
  );

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'A premortem for an org-design change',
      body: 'Pick up to three reporting lines and rehearse them against the live workspace. The engine re-harvests every open case, call and funded item on a cloned roster, re-prices every cross-branch objective, and diffs the two books — then names the rolls-up-to edges and unsettled governed decisions that would go stale. Nothing is written, moved or accepted.',
    }),
    card({
      title: 'Proposed reporting-line moves',
      subtitle: `Bounded to ${REDRAW_LIMITS.maxMoves} moves per rehearsal — a larger reorganisation is a programme of dependent changes, not one dry run.`,
      body: formHost,
    }),
    resultsHost,
    card({
      title: 'How to read this honestly',
      subtitle: 'Declared, printed, refusable.',
      body: h('ul', { class: 'stack' },
        h('li', null, 'Coordination units are DECLARED Coase/Williamson conventions (method panel), never money and never measured value.'),
        h('li', null, 'Objective labels are opaque goal pointers, never titles; above the detail ceiling the rehearsal is not available to rank 1–2 seats.'),
        h('li', null, 'A stale decision is a prompt to re-frame it at the new rung — the rehearsal never withdraws, accepts or re-opens anything.'),
        h('li', null, 'Rolled-up audiences are recomputed exactly as RULE-JUR-01/02/04 would re-emit them, but the persisted edges are only NAMED here, not rewritten.'),
        h('li', null, 'Frameworks: Coase (1937) / Williamson (1975) governance choice · Riker (1962) size principle · Ashby (1956) requisite variety · Jensen & Meckling (1976) residual control · Klein (1998) premortem.')) }));
}

function methodPanel(ctx, read) {
  const conventions = read.conventions || jurConventions({});
  const rows = Object.keys(JUR_CONVENTION_DEFAULTS).map((key) => ({
    key,
    value: typeof conventions[key] === 'boolean' ? (conventions[key] ? 'on' : 'off') : dash(conventions[key]),
    bound: JUR_CONVENTION_BOUNDS[key] ? `${JUR_CONVENTION_BOUNDS[key][0]}–${JUR_CONVENTION_BOUNDS[key][1]}` : 'on / off',
  }));
  const refusals = Object.entries(JUR_REFUSALS).map(([key, text]) => ({ key, text }));
  return h('div', { class: 'stack' },
    card({ title: 'Declared conventions', subtitle: 'Clamped, printed, never fitted.',
      body: table({ caption: 'Declared jurisdiction conventions and their bounds',
        columns: [{ label: 'Convention', key: 'key' }, { label: 'Declared value', key: 'value' }, { label: 'Bound', key: 'bound' }], rows }) }),
    card({ title: 'Every refusal this screen can print', subtitle: 'A blank is a reason, never a zero.',
      body: table({ caption: 'Printed refusals',
        columns: [{ label: 'Code', key: 'key' }, { label: 'Printed reason', key: 'text' }], rows: refusals }) }),
    card({ title: 'Named frameworks, implemented', subtitle: 'Not name-dropped.',
      body: h('ul', { class: 'stack' },
        h('li', null, 'Riker (1962) size principle — the minimal covering antichain of branches, never a grand coalition.'),
        h('li', null, 'Coase (1937) / Williamson (1975) — declared cross-boundary transaction costs: k(k−1)/2 handoff pairs, one cost per rung escalated, one one-off redraw.'),
        h('li', null, 'Heckman (1979) sample-selection coverage — open work with no objective pointer or a dropped/missing goal id is counted in the denominator as a named refusal, never silently excluded.'),
        h('li', null, 'Wilson (1927) — score intervals on attribution completeness and objective-anchoring completeness; lower bounds are printed and refused below the evidence floor.'),
        h('li', null, 'Luce (1959) choice axiom — a softmax over −cost at a declared temperature gives the route probability.'),
        h('li', null, 'Brier (1950) — once-only, out-of-sample grade against a strictly-prior 0.5 base.'),
        h('li', null, 'Ashby (1956) requisite variety — a single decider must reconcile as many branches as the cluster holds.')) }),
    card({ title: 'Honest limits', subtitle: 'Printed, not glossed over.',
      body: h('ul', { class: 'stack' },
        h('li', null, 'Local seats are auditable workflow declarations, not authentication.'),
        h('li', null, 'Small-cell suppression is a refusal, not differential privacy.'),
        h('li', null, 'Coordination units are declared conventions, not measured money; a boundary redraw is never executed automatically.'),
        h('li', null, 'Clusters are joined by a shared objective pointer or impacts-goal link; two teams naming different goals are not inferred to be one objective.'),
        h('li', null, 'A grade is an association between a predicted route and one dated choice, not a causal claim.')) }));
}

function openConventions(ctx) {
  const conventions = jurConventions(ctx.state.settings || {});
  const specs = Object.keys(JUR_CONVENTION_DEFAULTS).map((key) => {
    const bound = JUR_CONVENTION_BOUNDS[key];
    if (!bound) return { name: key, label: key, type: 'select', value: conventions[key] ? 'on' : 'off', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], help: 'Pauses every automatic pass. An explicit scan still runs.' };
    return { name: key, label: key, type: 'number', value: conventions[key], min: bound[0], max: bound[1], step: 1, help: `Declared bound ${bound[0]}–${bound[1]}.` };
  });
  const form = buildForm(specs);
  openModal({
    title: 'Jurisdiction conventions',
    description: 'Every one is declared and clamped. None is fitted from your record. Re-declaring re-prices every cross-branch objective in this workspace and requires a full-access seat.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const values = form.getValues();
        const patch = {};
        for (const key of Object.keys(JUR_CONVENTION_DEFAULTS)) {
          patch[key] = typeof JUR_CONVENTION_DEFAULTS[key] === 'boolean' ? values[key] === 'on' : Number(values[key]);
        }
        const result = ctx.api.jurSetConventions(patch);
        if (!result || result.ok === false) { toast(result?.error || 'Could not re-declare.', 'bad'); return; }
        closeAllModals();
        toast(result.changed?.length ? `Re-declared: ${result.changed.join(', ')}` : 'Nothing changed.', 'good');
        ctx.render?.();
      } }, 'Re-declare'),
    ],
  });
}

/* ---------------------------------------------------------------- view */

export function renderJurisdiction(ctx) {
  const query = ctx.query instanceof Map ? ctx.query : new URLSearchParams(String(ctx.query || ''));
  const requested = query.get('panel') || 'map';
  const panel = PANELS.some((p) => p.key === requested) ? requested : 'map';
  const read = safeRead(ctx);
  const { seat } = seatOf(ctx);
  const rank = read.seat?.rank || seat?.rank || 0;
  const question = JUR_ALTITUDE_QUESTIONS[({ 1: 'frontline', 2: 'manager', 3: 'director', 4: 'exec', 5: 'chief' })[rank]] || JUR_ALTITUDE_QUESTIONS.frontline;
  const totals = read.book.totals || {};
  const panels = {
    map: () => mapPanel(ctx, read, query),
    hygiene: () => hygienePanel(ctx, read),
    options: () => optionsPanel(ctx, read),
    redraw: () => redrawPanel(ctx, read),
    grades: () => gradesPanel(ctx, read),
    method: () => methodPanel(ctx, read),
  };

  const header = pageHeader({
    eyebrow: `LeadOS · Jurisdiction Compiler · ${read.seat?.label || 'Operator view'}`,
    title: 'When work crosses spans, who can actually resolve it?',
    subtitle: question,
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button',
        onClick: () => act(ctx, () => ctx.api.jurScan(), 'Compiled cross-branch objectives, pointer hygiene, priced routes and rolled up span readings'), }, 'Compile now'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openConventions(ctx) }, 'Conventions'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        try {
          const rows = jurCsvRows(ctx.state, { now: ctx.now, settings: ctx.state.settings || {} });
          const text = serializeCsv(JUR_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
          const saved = downloadText({ filename: `leados-jurisdiction-${ctx.now.toISOString().slice(0, 10)}.csv`, text, mime: 'text/csv' });
          if (saved) { toast('Aggregate CSV downloaded.', 'good'); return; }
          const copy = h('textarea', { class: 'input', rows: 10, readonly: true }, text);
          openModal({
            title: 'Download blocked — copy the CSV',
            body: h('div', { class: 'stack' }, h('p', null, 'This browser refused the file download. The aggregate CSV is below; select and copy it.'), copy),
            footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
          });
          copy.focus(); copy.select();
        } catch (error) {
          toast(`Could not build the CSV: ${String(error?.message || error)}`, 'bad');
        }
      } }, 'Export aggregate CSV'),
    ],
    meta: h('div', null, kv('Generated', formatDate(ctx.now)), kv('Engine', read.book.engineVersion || 'jurisdiction-2026.11-v2'), kv('Conventions', 'declared, not fitted')),
  });

  return h('div', { class: 'page view-stack', 'data-altitude': read.seat?.rank ? `rank-${read.seat.rank}` : 'operator' },
    header,
    h('div', { class: 'grid-4' },
      stat({ label: 'Objectives on record', value: dash(totals.objectives ?? 0), hint: 'Grouped by goal pointer or link' }),
      stat({ label: 'Cross-branch', value: dash(totals.crossBranch ?? 0), hint: 'No single branch holds the whole objective' }),
      stat({ label: 'Priced / refused', value: `${dash(totals.priced ?? 0)} / ${dash(totals.refused ?? 0)}`, hint: 'Refusals printed, never zeroed' }),
      stat({ label: 'Pointer refusals', value: `${dash(totals.unanchoredWork ?? 0)} / ${dash(totals.danglingWork ?? 0)}`, hint: totals.anchoringLoPct != null ? `Unanchored / dangling · floor ${totals.anchoringLoPct}%` : 'Unanchored / dangling work' })),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, ariaLabel: 'Jurisdiction compiler sections',
      onSelect: (key) => ctx.navigate(key === 'map' ? '#/jurisdiction' : `#/jurisdiction?panel=${key}`) }),
    h('p', { class: 'tiny muted' }, PANELS.find((p) => p.key === panel)?.note || ''),
    panels[panel](),
    h('p', { class: 'tiny muted' }, 'This compiler never moves a reporting line, never reassigns a case, never rates a person and never silently drops unlinked work. Anchoring binds a work record inside your own span to a live goal; a boundary decision remains a governed decision a human must accept.'));
}
