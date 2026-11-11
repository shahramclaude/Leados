/**
 * app/views/benchEvidencePanel.js — `#/succession?panel=evidence`, the Cross-Line
 * Bench-Evidence Sufficiency register (ADR-0168, Schema v134 unchanged).
 *
 * ONE SCREEN, THREE SEPARATE CLAIMS, PRINTED SEPARATELY:
 *
 *   1. **Procedure** — for each current bench claim (a succession readiness
 *      reading), was the evidence behind it gathered from every reporting line
 *      the person actually worked on? The states are closed and have declared
 *      precedence, so this screen cannot disagree with the brief, the export or
 *      the automation rule about a word.
 *   2. **Counts** (`reconciles`) — do the printed state counts add up to the
 *      number of claims printed? A different fact from the third claim.
 *   3. **Population** (`figuresComplete`) — was every claim in scope actually
 *      readable? The counts can add up perfectly over a population that was not
 *      fully read, and this workspace refuses to collapse those two facts.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A rate below the declared floor, over a partially unreadable population, or
 *    over a population with no cross-line claim: BLANK with its reason printed.
 *  - A withheld figure as a zero, ever.
 *  - A per-line contribution share: the workspace does not record which line
 *    produced a piece of evidence, so none is computed. The framework card says so
 *    in the same words the export uses.
 *  - A person's score or rank. Findings are on BENCH CLAIMS and LINE STATES. Above
 *    the matrix detail ceiling the claim rows print no name at all.
 */
import { h, toast } from '../ui/dom.js';
import { card, stat, badge, banner, table, kv, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { renderBenchRegressionSection, readRegressionFor } from './benchRegressionPanel.js';
import {
  BENCH_EVIDENCE_CONVENTIONS,
  BENCH_EVIDENCE_FLOOR,
  BENCH_EVIDENCE_FRAMEWORKS,
  BENCH_EVIDENCE_REFUSALS,
  BENCH_EVIDENCE_STATES,
  BENCH_EVIDENCE_VERDICTS,
  BENCH_EVIDENCE_LIMITS,
} from '../core/domain/benchEvidenceRegistry.js';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`);
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');
const cols = (rows) => rows.map((row) => ({
  ...row,
  render: row.render || ((record) => {
    const value = record[row.key];
    if (value === null || value === undefined) return '—';
    return String(value);
  }),
}));

/**
 * Resolve the read. The panel prefers the API (so it reads exactly what the badge,
 * the brief and the export read) and falls back to the pure read model so a static
 * render — which is how the focused suite exercises it — cannot print `undefined`
 * as "the evidence was complete".
 */
function readFor(ctx) {
  if (ctx?.api?.benchEvidenceRead) {
    const res = ctx.api.benchEvidenceRead();
    if (res && res.ok && res.report) return { report: res.report, viaApi: true };
  }
  if (typeof ctx?.benchEvidence === 'function') {
    return { report: ctx.benchEvidence(), viaApi: false };
  }
  return { report: null, viaApi: false };
}

/* ------------------------------------------------------------- the header */

function header(report) {
  const v = BENCH_EVIDENCE_VERDICTS.find((x) => x.key === report.verdict) || BENCH_EVIDENCE_VERDICTS[0];
  return h('div', { class: 'stack-tight', 'data-testid': 'bench-evidence-header' },
    h('div', { class: 'row-gap' },
      badge(v.label, toneFor(v.tone)),
      badge(`${report.totals.claimsN} bench claim(s)`, 'neutral'),
      report.totals.matrixClaimsN ? badge(`${report.totals.matrixClaimsN} cross-line`, 'neutral') : null,
      report.totals.unreadableN ? badge(`${report.totals.unreadableN} unreadable`, 'warn') : null,
      report.findingsN ? badge(`${report.findingsN} evidence finding(s)`, 'bad') : null),
    h('p', { class: 'small muted' }, v.detail));
}

/* ------------------------------------------------------------ the claims */

function statsSection(report) {
  const t = report.totals;
  return h('div', { class: 'stat-row', 'data-testid': 'bench-evidence-stats' },
    stat({
      label: 'Claims in scope',
      value: t.claimsN,
      hint: `${t.readN} read against a completed review · ${t.excludedN} excluded as no longer on the roster`,
      tone: '',
    }),
    stat({
      label: 'Cross-line claims',
      value: t.matrixClaimsN,
      hint: `${t.singleClaimsN} single-line claim(s) make no cross-line claim`,
      tone: '',
    }),
    stat({
      label: 'Second-line claims',
      value: t.secondLineN,
      hint: `${t.secondLineCleanN} with every line asked and none silent · ${t.secondLineGapN} with a gap`,
      tone: t.secondLineGapN ? 'warn' : '',
    }),
    stat({
      label: 'Evidence-complete rate',
      value: report.ratePrinted ? pct(report.rate) : 'WITHHELD',
      hint: report.ratePrinted
        ? `exact integer counts · floor ${BENCH_EVIDENCE_FLOOR}`
        : report.rateWithheldReason,
      tone: report.ratePrinted ? (report.rate >= 70 ? 'good' : 'warn') : '',
    }));
}

function stateSection(report) {
  const rows = BENCH_EVIDENCE_STATES
    .filter((s) => (report.totals.stateCounts[s.key] || 0) > 0)
    .map((s) => ({
      state: s.label,
      count: String(report.totals.stateCounts[s.key]),
      open: s.open ? 'open' : 'settled',
      detail: s.detail,
    }));
  return card({
    title: 'The evidence states, and what each one means',
    subtitle: 'Declared precedence, worst first. One claim is exactly one state; the brief, this table, the export and the automation rule read the same list.',
    body: rows.length
      ? table({
        caption: 'Bench claims by evidence state',
        columns: cols([
          { key: 'state', label: 'State' },
          { key: 'count', label: 'Claims', align: 'right' },
          { key: 'open', label: 'Standing' },
          { key: 'detail', label: 'What it means' },
        ]),
        rows,
      })
      : emptyState({ title: 'No bench claim is in scope', body: 'No readiness record names a person who is currently on the roster, so there is no evidence claim to read and none is invented.' }),
  });
}

/* --------------------------------------------------------- the two claims */

function claimsSection(report) {
  return card({
    title: 'Two claims kept apart, because they are different facts',
    subtitle: 'That the printed counts add up and that the printed population was readable are not the same sentence, and this screen never merges them into one reassuring word.',
    body: h('div', { class: 'stack-tight', 'data-testid': 'bench-evidence-claims' },
      kv('Counts reconcile', `${report.reconciles ? 'yes' : 'no'} — ${report.reconcilesDetail}`, report.reconciles ? 'good' : 'bad'),
      kv('Evidence population complete', `${report.figuresComplete ? 'yes' : 'no'} — ${report.figuresCompleteDetail}`, report.figuresComplete ? 'good' : 'warn')),
  });
}

/* ------------------------------------------------------------- the table */

function registerSection(report, { namesVisible }) {
  const rows = report.printedRows.map((row) => ({
    claim: namesVisible ? `${row.personName} · ${row.seat}` : `claim ${row.claimId.replace(/[^:]/g, '#').slice(0, 12)}`,
    claimId: row.claimId,
    rating: row.ratingLabel,
    support: row.ratingSupported ? 'supported' : (row.ratingWarning ? 'unsupported' : '—'),
    window: `${row.windowStart}–${row.windowEnd}`,
    review: row.reviewId
      ? `${row.reviewPeriodStart}–${row.reviewPeriodEnd}${row.reviewCompletedOn ? ` (completed ${row.reviewCompletedOn})` : ''}`
      : 'no eligible review',
    lineN: `${row.secondaryLineN} second line(s)`,
    state: row.evidenceStateLabel,
    tone: row.evidenceStateTone,
    detail: row.evidenceDetail,
  }));
  return card({
    title: `Bench claims (${report.printedRows.length} of ${report.totals.printedClaimsN}${report.totals.claimsN > report.totals.printedClaimsN ? `, ${report.totals.claimsN - report.totals.printedClaimsN} counted and not shown` : ''})`,
    subtitle: namesVisible
      ? 'Worst evidence state first. The review shown is the one the review rule chose — the latest COMPLETED review whose period ends on or before the last day of the claim’s evidence window. No neighbouring review is substituted.'
      : `Names are withheld above the matrix detail ceiling, so each row is identified by a stable claim reference only. ${report.totals.claimsN} claim(s) are counted in every figure above.`,
    body: rows.length
      ? table({
        caption: 'Current bench claims and the evidence under each',
        columns: cols([
          { key: 'claim', label: namesVisible ? 'Person · seat' : 'Claim' },
          { key: 'rating', label: 'Rating' },
          { key: 'support', label: 'Readiness evidence' },
          { key: 'window', label: 'Evidence window' },
          { key: 'review', label: 'Review read (rule: nearest-before)' },
          { key: 'lineN', label: 'Lines in force' },
          { key: 'state', label: 'Evidence state', render: (r) => badge(r.state, toneFor(r.tone)) },
          { key: 'detail', label: 'Why' },
        ]),
        rows,
      })
      : emptyState({ title: 'No bench claim to show', body: 'Nothing is in scope on this reading. An empty table here means nothing was claimed — not that every claim was clean.' }),
  });
}

function findingsSection(report) {
  if (!report.findingsN) return null;
  const rows = report.printedFindings.map((f) => ({
    kind: f.kind,
    person: f.personName,
    seat: f.seat,
    rating: f.ratingLabel,
    detail: f.detail,
  }));
  return card({
    title: `Findings (${report.findingsN}${report.findingsCappedN ? `, ${report.findingsCappedN} beyond the print bound and counted` : ''})`,
    subtitle: 'Each finding is about a BENCH CLAIM and a line’s state. None of them is a judgement of the person the claim is about, and none is a score of the manager who was not asked.',
    body: table({
      caption: 'Evidence findings',
      columns: cols([
        { key: 'kind', label: 'State' },
        { key: 'person', label: 'Claim subject' },
        { key: 'seat', label: 'Bench seat' },
        { key: 'rating', label: 'Rating' },
        { key: 'detail', label: 'Finding' },
      ]),
      rows,
    }),
  });
}

/* --------------------------------------------------------- brief and CSV */

function exportSection(ctx, report) {
  return card({
    title: 'Brief and aggregate export',
    subtitle: 'Both read the SAME report this page printed, so an exported figure is provably the figure that was on screen.',
    body: h('div', { class: 'stack-tight' },
      h('div', { class: 'row-gap' },
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx?.api?.benchEvidenceBriefText ? ctx.api.benchEvidenceBriefText() : null;
            if (!res || !res.ok) { toast('The brief could not be built from this surface.', 'bad'); return; }
            const saved = downloadText({ filename: 'leados-bench-evidence-brief.txt', text: res.text, mime: 'text/plain' });
            if (saved) toast('Brief downloaded — identity-free, every refusal printed.', 'good');
          },
        }, 'Download the brief'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx?.api?.scanBenchEvidence ? ctx.api.scanBenchEvidence() : null;
            if (!res || !res.ok) { toast('The scan is not available from this surface.', 'bad'); return; }
            const n = res.propagations?.length || 0;
            toast(n ? `Scan complete — ${n} obligation(s) retried through RULE-BNE-01.` : 'Scan complete — nothing was deferred for this reading.', 'good');
          },
        }, 'Re-run the deferred asks')),
      h('p', { class: 'small muted' },
        'The export is CSV scope #123 (`succession-bench-evidence`): one aggregate summary row with no person, no name, no manager, no seat, no rating and no review id. A withheld rate exports BLANK with `evidence_second_line_pct_withheld = yes`.'),
      report.refusals.length
        ? h('ul', { class: 'list' }, ...report.refusals.map((r) => h('li', { class: 'small' }, r.detail)))
        : null),
  });
}

/* --------------------------------------------------------------- method */

function methodSection(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The review rule this reading applied',
      subtitle: 'A readiness rating is graded on a 90-day window. A review’s line states are stored against a review period. Those windows differ, so the join must choose one review per claim by a stated rule — and print it.',
      body: h('div', { class: 'stack-tight' },
        kv('Review rule', report.conventions.reviewWindow),
        kv('Rating evidence window', `${report.conventions.ratingWindowDays} days, anchored on the reading’s own day where it is in the past`),
        kv('Rate floor', `${BENCH_EVIDENCE_FLOOR} cross-line claims before a percentage is printed`),
        kv('Line right that makes an assessor', report.conventions.right),
        kv('Median convention', report.conventions.median),
        kv('Row bound', `${BENCH_EVIDENCE_LIMITS.rows} claim rows printed; the remainder is counted, never dropped`)),
    }),
    card({
      title: 'The frameworks behind the reading',
      body: table({
        caption: 'Named methods and what each one does here',
        columns: cols([
          { key: 'label', label: 'Framework' },
          { key: 'source', label: 'Source' },
          { key: 'applied', label: 'How it is applied' },
        ]),
        rows: BENCH_EVIDENCE_FRAMEWORKS.map((f) => ({ ...f })),
      }),
    }),
    card({
      title: 'What this reading refuses, by name',
      body: h('ul', { class: 'list' }, ...BENCH_EVIDENCE_REFUSALS.map((r) => h('li', null, r.text))),
    }),
    card({
      title: 'What this reading will never do',
      body: h('ul', { class: 'list' },
        h('li', null, 'Substitute a neighbouring review, or read a period that had not finished by the claim’s evidence window.'),
        h('li', null, 'Invent a per-line contribution share. Feedback, recognition, 1:1 notes and delegations record who the evidence is about, never which line produced it.'),
        h('li', null, 'Collapse "asked and silent" into "never asked", or a reasoned decline into missing evidence.'),
        h('li', null, 'Edit a readiness rating, complete a review, re-point a line, or close the question on anyone’s behalf. A human asks a line; a human answers it.'),
        h('li', null, 'Score, rank or rate a person or a manager. The subject is a bench claim and a line’s state.'),
        h('li', null, 'Store a verdict. The register is re-derived on every render, so the screen cannot drift from the record.')),
    }));
}

/* ------------------------------------------------------------------ view */

/**
 * Render the tab.
 *
 * @param {object} ctx    the shell context (state, now, api)
 * @param {object|null} report  an already-built report (used by focused renders)
 * @param {boolean} namesVisible whether names may be printed at this seat
 */
export function renderBenchEvidenceTab(ctx, report = null, namesVisible = true, regressionReport = null) {
  const resolved = report ? { report } : readFor(ctx);
  const r = resolved.report;
  if (!r) {
    return h('div', { class: 'stack' }, banner({
      tone: 'bad',
      title: 'The bench-evidence reading could not be built',
      body: 'No report is available on this surface. Nothing is printed rather than a partial reading that would look like an assessment.',
    }));
  }
  const showNames = report ? namesVisible : (namesVisibleFor(ctx) && namesVisible);
  // ADR-0172: the regression watch resolves its own report (or takes the focused
  // suite's prebuilt one) and renders as a section of the same duty screen.
  const reg = regressionReport ? { report: regressionReport } : readRegressionFor(ctx);
  return h('div', { class: 'stack', 'data-testid': 'bench-evidence-tab' },
    header(r),
    banner({
      tone: 'info',
      title: 'The question is not "is this person ready" — it is "who said so"',
      body: 'A readiness rating is a claim. This reading asks whether the evidence behind each current bench claim was gathered from every reporting line the person actually worked on, and names the claims where it was not. It never changes a rating and never rates anyone.',
    }),
    statsSection(r),
    stateSection(r),
    claimsSection(r),
    registerSection(r, { namesVisible: showNames }),
    findingsSection(r),
    renderBenchRegressionSection(ctx, reg.report || null, showNames),
    exportSection(ctx, r),
    methodSection(r));
}

/**
 * May this seat print a person's name here? The claim register names a person and
 * a bench seat, so it follows the `readiness` record policy's detail ceiling
 * exactly as every other succession surface does. Fail closed: an unresolvable
 * boundary withholds names rather than printing them.
 */
function namesVisibleFor(ctx) {
  const seat = ctx?.seatContext?.seat || null;
  if (seat) {
    if (seat.fullAccess) return true;
    if (seat.readOnly) return false;
    return Number(seat.rank || 0) <= 2;
  }
  // No seat read on this surface: the shell's own projection has already decided
  // what this caller may see, so print what it handed us.
  return true;
}
