/**
 * app/views/jurisdiction.js — `#/jurisdiction`, the Jurisdiction Compiler
 * (ADR-0109, Schema v111).
 *
 * Four panels, four questions, and a DIFFERENT answer at every altitude:
 *   Map      "Which of my objectives is another branch also working, and who
 *            could resolve the whole thing?"
 *   Options  "What do the coalition, the escalation and the boundary redraw
 *            each cost — and which one does the record actually favour?"
 *   Grades   "Was the governance route this ledger predicted the one a human
 *            chose?"
 *   Method   "What is declared, clamped, named and refused?"
 *
 * Above the director detail ceiling the shell serves a COMPILED, identity-free
 * cell table and an auto-generated board-ready synthesis; no objective key,
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
    return { ok: false, error: String(error?.message || error), book: { clusters: [], priced: [], refused: [], totals: {} }, cells: [], grades: [], withheld: false, conventions: jurConventions({}), brief: '' };
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

/* --------------------------------------------------------------- panels */

function mapPanel(ctx, read) {
  const book = read.book;
  if (read.withheld) {
    const rows = (read.cells || []).map((cell) => ({
      rank: `Rank ${cell.rank}`,
      clusters: cell.clusters,
      priced: cell.suppressed ? '—' : cell.priced,
      refused: cell.suppressed ? '—' : cell.refused,
      verdict: cell.suppressed ? 'withheld' : 'measured',
      reason: cell.reason || '',
    }));
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: `${read.seat?.label || 'This altitude'} reads the jurisdiction map as compiled counts`,
        body: 'Objective keys, member records and person detail are withheld above the director ceiling (ADR-0086). You are reading the same workspace as identity-free altitude cells, with small-cell suppression. Suppression is not differential privacy and is labelled as such.' }),
      table({ caption: 'Cross-branch objectives by leadership rank', emptyMessage: 'No cross-branch objectives on record.',
        columns: [
          { label: 'Altitude', key: 'rank' },
          { label: 'Cross-branch objectives', key: 'clusters' },
          { label: 'Priced', key: 'priced' },
          { label: 'Refused', key: 'refused' },
          { label: 'Verdict', key: 'verdict' },
          { label: 'Reason', key: 'reason' },
        ], rows }),
      card({ title: 'Board-ready synthesis', subtitle: 'Auto-generated from the workspace graph — no model, no network, no invented figure.',
        body: h('p', { class: 'muted' }, read.brief) }));
  }
  const rows = book.clusters.map((c) => ({
    objective: objectiveLabel(c.objectiveKey),
    members: c.evidenceN,
    branches: c.coalitionSize,
    rungs: c.escalationRungs,
    route: c.verdict === 'priced' ? c.predictedOption : '—',
    confidence: c.confidencePct,
    verdict: c.verdict,
    reason: c.verdict === 'refused' ? (c.refusalKey || '') : '',
  }));
  if (!rows.length) {
    return emptyState({ title: 'No cross-branch objectives detected',
      body: 'Every objective on record is worked inside a single reporting branch, so one seat already holds the mandate. Register work in two teams against the same goal, then run Compile now: the gap, the coalition and the three priced routes appear in one atomic write.' });
  }
  return h('div', { class: 'stack' },
    table({ caption: 'Cross-branch objectives and their minimal covering coalitions', emptyMessage: 'No cross-branch objectives.',
      columns: [
        { label: 'Objective', key: 'objective' },
        { label: 'Work records', key: 'members' },
        { label: 'Branches', key: 'branches' },
        { label: 'Rungs to the ancestor', key: 'rungs' },
        { label: 'Predicted route', key: 'route' },
        { label: 'Confidence floor', render: (r) => pct(r.confidence) },
        { label: 'Verdict', render: (r) => badge(r.verdict, r.verdict === 'priced' ? 'good' : 'neutral') },
        { label: 'Reason', key: 'reason' },
      ], rows }),
    h('p', { class: 'tiny muted' }, 'An objective key is an opaque goal pointer, never a title. The confidence floor is a Wilson (1927) lower bound on how much of the cluster the reporting tree can place — not a rating of anyone.'));
}

function optionsPanel(ctx, read) {
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
    h('p', { class: 'tiny muted' }, 'Coordination units are DECLARED, clamped and printed on the Method panel — not money, not fitted from the record. A route is recommended only when it beats the runner-up by the declared materiality band; a tie is printed as a tie, never broken silently. No route ever moves a reporting line on its own.'));
}

function gradesPanel(ctx, read) {
  const findings = Array.isArray(ctx.state?.jurFindings) ? ctx.state.jurFindings : [];
  const graded = findings.filter((f) => f?.status === 'graded');
  const ungradable = findings.filter((f) => f?.status === 'ungradable');
  const frozen = findings.filter((f) => f?.status === 'frozen');
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
    h('div', { class: 'grid-3' },
      stat({ label: 'Graded once', value: graded.length, hint: 'Out of sample, Brier vs 0.5 base' }),
      stat({ label: 'Stored refusals', value: ungradable.length, hint: 'Never a zero' }),
      stat({ label: 'Awaiting a dated choice', value: frozen.length, hint: 'Silence is not consent' })),
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
        h('li', null, 'Wilson (1927) — score interval on attribution completeness; the lower bound is the confidence floor.'),
        h('li', null, 'Luce (1959) choice axiom — a softmax over −cost at a declared temperature gives the route probability.'),
        h('li', null, 'Brier (1950) — once-only, out-of-sample grade against a strictly-prior 0.5 base.'),
        h('li', null, 'Ashby (1956) requisite variety — a single decider must reconcile as many branches as the cluster holds.')) }),
    card({ title: 'Honest limits', subtitle: 'Printed, not glossed over.',
      body: h('ul', { class: 'stack' },
        h('li', null, 'Local seats are auditable workflow declarations, not authentication.'),
        h('li', null, 'Small-cell suppression is a refusal, not differential privacy.'),
        h('li', null, 'Coordination units are declared conventions, not measured money; a boundary redraw is never executed automatically.'),
        h('li', null, 'Clusters are joined by a shared objective pointer; two teams naming different goals are not inferred to be one objective.'),
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
    map: () => mapPanel(ctx, read),
    options: () => optionsPanel(ctx, read),
    grades: () => gradesPanel(ctx, read),
    method: () => methodPanel(ctx, read),
  };

  const header = pageHeader({
    eyebrow: `LeadOS · Jurisdiction Compiler · ${read.seat?.label || 'Operator view'}`,
    title: 'When work crosses spans, who can actually resolve it?',
    subtitle: question,
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button',
        onClick: () => act(ctx, () => ctx.api.jurScan(), 'Compiled cross-branch objectives, priced routes and rolled up span readings'), }, 'Compile now'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openConventions(ctx) }, 'Conventions'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        const rows = jurCsvRows(ctx.state, { now: ctx.now, settings: ctx.state.settings || {} });
        downloadText(`leados-jurisdiction-${ctx.now.toISOString().slice(0, 10)}.csv`,
          serializeCsv({ columns: JUR_CSV_COLUMNS.map((key) => ({ key, header: key })), rows }), 'text/csv');
      } }, 'Export aggregate CSV'),
    ],
    meta: h('div', null, kv('Generated', formatDate(ctx.now)), kv('Engine', read.book.engineVersion || 'jurisdiction-2026.11-v1'), kv('Conventions', 'declared, not fitted')),
  });

  return h('div', { class: 'page view-stack', 'data-altitude': read.seat?.rank ? `rank-${read.seat.rank}` : 'operator' },
    header,
    h('div', { class: 'grid-3' },
      stat({ label: 'Objectives on record', value: dash(totals.objectives ?? 0), hint: 'Grouped by shared goal pointer' }),
      stat({ label: 'Cross-branch', value: dash(totals.crossBranch ?? 0), hint: 'No single branch holds the whole objective' }),
      stat({ label: 'Priced / refused', value: `${dash(totals.priced ?? 0)} / ${dash(totals.refused ?? 0)}`, hint: 'Refusals printed, never zeroed' })),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, ariaLabel: 'Jurisdiction compiler sections',
      onSelect: (key) => ctx.navigate(key === 'map' ? '#/jurisdiction' : `#/jurisdiction?panel=${key}`) }),
    h('p', { class: 'tiny muted' }, PANELS.find((p) => p.key === panel)?.note || ''),
    panels[panel](),
    h('p', { class: 'tiny muted' }, 'This compiler never moves a reporting line, never reassigns a case, never rates a person and never edits another module’s record. A boundary decision is a governed decision a human must accept; silence is never consent. The local seat is a workflow declaration, not authentication.'));
}
