/**
 * app/views/riskAppetite.js — `#/risk-appetite`, the Enterprise Risk Appetite &
 * Tolerance Breach Register (ADR-0219, Schema v173).
 *
 * ONE reader (`buildRiskAppetite`) stands behind every verdict, figure, count
 * and coverage gap this page prints. The page formats what the reader returned;
 * it computes no tolerance, no sum and no verdict of its own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART:
 *   1. the STANCE the enterprise declared (a posture, never a number);
 *   2. the TOLERANCE it declared (an exact integer, cents or a count);
 *   3. the MEASURED figure over the declared population, with that population's
 *      size beside it;
 *   4. whether the WHOLE POPULATION was measured — a separate, printed claim,
 *      because “inside the ceiling” over half the risks is not reassurance.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  RA_APPETITE_LEVELS,
  RA_DOMAINS,
  RA_HREF,
  RA_LIMITS,
  RA_METHOD,
  RA_MEASURES,
  raDomain,
} from '../core/domain/riskAppetiteRegistry.js';
import { centsToDisplay } from '../core/domain/riskAppetiteSchema.js';
import { RC_METHOD, RC_VIEW_KEY } from '../core/domain/riskConcentration.js';

const L = RA_LIMITS;
const DIAGRAM_URL = './app/assets/risk-appetite-tolerance.jpg';
const CONCENTRATION_DIAGRAM_URL = './app/assets/risk-concentration-method.jpg';
const VIEWS = [
  { key: 'statements', label: 'Statements' },
  { key: 'risks', label: 'Risks carried' },
  { key: 'lines', label: 'Lines' },
  { key: RC_VIEW_KEY, label: 'Shared dependencies' },
  { key: 'method', label: 'Method' },
];
const CONCENTRATION_TONE = { 'would-exceed': 'bad', 'within-ceiling': 'good', 'no-ceiling': 'caution' };
const CONCENTRATION_SHORT = { 'would-exceed': 'Would exceed', 'within-ceiling': 'Within ceiling', 'no-ceiling': 'Not compared' };
const pct = (bp) => `${(bp / 100).toFixed(2)}%`;
const VERDICT_TONE = { breached: 'bad', 'within-tolerance': 'good', unmeasurable: 'caution' };
const VERDICT_SHORT = { breached: 'Breached', 'within-tolerance': 'Within tolerance', unmeasurable: 'Unmeasurable' };

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

function displayFigure(row) {
  if (row.measurement.unit === 'money') {
    if (row.measurement.measured === null) return 'withheld';
    return `${row.currency} ${centsToDisplay(row.measurement.measured)}`;
  }
  return `${row.measurement.measured} risk(s)`;
}

function displayTolerance(row) {
  if (row.measure === 'retained-exposure') return `${row.currency} ${centsToDisplay(row.tolerance)}`;
  return `${row.tolerance} risk(s)`;
}

function verdictCell(row) {
  return h('span', { class: 'row gap-s' },
    badge(VERDICT_SHORT[row.verdict] || row.verdict, VERDICT_TONE[row.verdict] || 'neutral'),
    row.emptyDomain ? badge('nothing declared in this domain', 'neutral') : null);
}

/* ------------------------------------------------------------------ dialogs */

function declareStatementDialog(ctx, report, onDone) {
  const form = buildForm([
    {
      name: 'domain', label: 'Risk domain', type: 'select', required: true,
      options: options(RA_DOMAINS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a domain' }),
      help: 'Seven closed domains. A free-text domain makes every total a matter of spelling.',
    },
    {
      name: 'measure', label: 'What the ceiling counts', type: 'select', required: true,
      options: options(RA_MEASURES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a measure' }),
      help: 'A count of declared risks, or retained exposure in one currency. The two are never compared or added.',
    },
    {
      name: 'currency', label: 'Currency', type: 'text',
      help: 'Required for retained exposure: exactly three letters. Never assumed, never converted.',
    },
    {
      name: 'tolerance', label: 'Tolerance (the ceiling)', type: 'text', required: true,
      help: 'A whole count of risks, or major units with at most two decimals (for example 2500000.00). A third decimal place is refused, not rounded.',
    },
    {
      name: 'appetite', label: 'Appetite', type: 'select', required: true,
      options: options(RA_APPETITE_LEVELS.map((row) => ({ value: row.key, label: row.label })), { blank: 'State the stance' }),
      help: 'The stance is printed beside the number and is never converted into one.',
    },
    { name: 'declaredOn', label: 'Declared on', type: 'date', value: report.asOf, required: true, help: 'Cannot be after today.' },
    { name: 'reviewOn', label: 'Review on', type: 'date', required: true, help: `After the declaration and within ${L.reviewMaxDays} days. A ceiling nobody revisits is a memory, not an appetite.` },
    { name: 'basis', label: 'Why this ceiling?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The reasoning is the part a successor will need.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.riskAppetiteDeclareStatement(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The statement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Appetite declared. The register now tests the declared population against it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an appetite',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A stance and a ceiling are two declarations', body: 'The stance says how the enterprise feels about this risk. The tolerance says exactly how much it will carry. The register prints both and never turns the first into the second.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare', onClick: submit }],
  });
}

function retireDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'on', label: 'Retired on', type: 'date', value: row.retiredOn || '', required: true, help: 'Cannot be before the declaration, nor after today.' },
    { name: 'reason', label: 'Why is it being retired?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The key will carry NO ceiling until a new statement is declared.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.riskAppetiteRetireStatement({ statementId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The retirement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Statement retired. Its key carries no ceiling until a new one is declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Retire this statement',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'No older tolerance is revived', body: 'Retiring the live statement leaves its domain, measure and currency with no appetite at all. The register prints that gap rather than falling back to an earlier number nobody re-declared.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Retire', onClick: submit }],
  });
}

function declareRiskDialog(ctx, report, onDone) {
  const boot = ctx.api.riskAppetiteCandidates();
  if (!boot || boot.ok === false) {
    toast(boot?.error || 'The case list could not be read.', 'bad');
    return;
  }
  const candidates = boot.candidates || [];
  if (!candidates.length) {
    openModal({
      title: 'Declare retained exposure',
      body: banner({ tone: 'info', title: 'No open risk is reachable from this seat', body: boot.reason || 'A risk declaration names a live operational risk whose owner this seat holds.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  const form = buildForm([
    {
      name: 'caseId', label: 'Which live risk?', type: 'select', required: true,
      options: options(candidates.map((row) => ({ value: row.caseId, label: `${row.title} — ${row.ownerName || 'no owner'} (${row.kind}, ${row.status})` })), { blank: 'Choose an open risk or incident' }),
      help: 'Only open risks and incidents whose owner this seat holds. A settled loss is history, not a ceiling.',
    },
    {
      name: 'domain', label: 'Domain', type: 'select', required: true,
      options: options(RA_DOMAINS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the domain' }),
    },
    { name: 'currency', label: 'Currency', type: 'text', required: true, help: 'Exactly three letters. The amount is never converted or pooled.' },
    { name: 'retained', label: 'Deliberately retained', type: 'text', required: true, help: 'Major units, at most two decimals. Zero is a valid answer — fully avoided, transferred or mitigated. Nothing is inferred from the case’s FMEA or its most-likely loss.' },
    { name: 'declaredOn', label: 'Declared on', type: 'date', value: report.asOf, required: true, help: 'A later dated declaration supersedes this one.' },
    { name: 'basis', label: 'Why this amount?', type: 'textarea', required: true, help: `At least ${L.textMin} characters: why this much, and not less.` },
  ]);
  const select = form.field('caseId');
  select?.addEventListener('change', () => {
    const chosen = candidates.find((row) => row.caseId === select.value);
    if (chosen?.current) {
      const domainField = form.field('domain');
      const currencyField = form.field('currency');
      const retainedField = form.field('retained');
      if (domainField) domainField.value = chosen.current.domain;
      if (currencyField) currencyField.value = chosen.current.currency;
      if (retainedField) retainedField.value = (chosen.current.retainedCents / 100).toFixed(2);
    }
  });
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.riskAppetiteDeclareRisk(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The declaration was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Retention declared. The register counts this risk once, in this domain.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare what we retain',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A declaration, not an inference', body: 'The register never reads a retention off a case’s probability, its most-likely loss or its settled outcome. A named line declares the amount, with a written basis, and the line above the risk owner is the line that may declare it.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare', onClick: submit }],
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'on', label: 'Withdrawn on', type: 'date', value: '', required: true, help: 'Cannot be before the declaration, nor after today.' },
    { name: 'reason', label: 'Why is it withdrawn?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The risk becomes undeclared until a new declaration is recorded.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.riskAppetiteWithdrawRisk({ declarationId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The withdrawal was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Declaration withdrawn. The risk is undeclared until a new one is recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Withdraw this declaration',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A withdrawal is final and never resurrects an older row', body: 'After this, the risk carries no declared retention until somebody declares one again. The register prints it as undeclared, not as zero.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Withdraw', onClick: submit }],
  });
}

/* ------------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds',
    subtitle: 'Every figure is the reader’s own integer. A measured figure is always over the declared population, and its size is printed beside it.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Live statements', value: h('span', { 'data-testid': 'ra-count-statements' }, String(t.statementsLive)), hint: `${t.statementsDeclared} declared · ${t.statementsRetired} retired · ${t.statementsFuture} future-dated` }),
      stat({ label: 'Breached', value: h('span', { 'data-testid': 'ra-count-breached' }, String(t.breachedN)), hint: 'the declared population is over its ceiling' }),
      stat({ label: 'Review overdue', value: h('span', { 'data-testid': 'ra-count-review-overdue' }, String(t.reviewOverdueN)), hint: 'the declared review date has passed' }),
      stat({ label: 'Declared risks', value: h('span', { 'data-testid': 'ra-count-declared' }, String(t.declaredRisksN)), hint: `${t.openRiskCasesN} open risk case(s) on the record` }),
      stat({ label: 'Undeclared open risks', value: h('span', { 'data-testid': 'ra-count-undeclared' }, String(t.undeclaredN)), hint: 'no live declaration; their exposure is unknown, not zero' }),
      stat({ label: 'Domains without appetite', value: h('span', { 'data-testid': 'ra-count-uncovered' }, String(report.domainsWithoutAppetite.length)), hint: 'risk carried under no declared ceiling' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'ra-count-attention' }, String(report.attention)), hint: report.attentionReason || 'nothing owed by this seat' }),
    ),
  });
}

function claimsBanners(report) {
  const t = report.totals;
  return h('div', { class: 'stack' },
    banner({
      tone: t.countsReconcile ? 'info' : 'bad',
      title: t.countsReconcile
        ? 'The per-domain counts add up to the declared risks'
        : 'The per-domain counts do not add up to the declared risks',
      body: 'This is the first claim: the parts re-add. It says nothing about coverage or about whether the ceiling was met.',
    }),
    banner({
      tone: t.figuresComplete ? 'good' : 'caution',
      title: t.figuresComplete
        ? 'Coverage is complete: every open risk carries a declaration'
        : 'NOT CERTIFIED — the declared population is not the whole population',
      body: t.figuresComplete
        ? 'The second claim, separate from the first: every open risk-bearing case carries a live declaration, every declaration resolves to a live case, every declared domain has a live appetite, and every currency carrying money has an exposure statement in it.'
        : `${t.coverageReasons.join(' ')} A “within tolerance” verdict below is TRUE OF THE DECLARED RISKS ONLY. It is not a statement that the enterprise is inside its appetite.`,
    }),
  );
}

function statementsView(ctx, report, onDone) {
  const canDeclare = Boolean(ctx.api.riskAppetiteDeclareStatement) && (report.seat?.fullAccess || (report.seat?.rank ?? 99) >= 4);
  const rows = report.statements.map((row) => ({
    ...row,
    attrs: {
      'data-testid': `ra-statement-${row.id}`,
      'data-verdict': row.verdict,
      'data-tolerance': String(row.tolerance ?? ''),
      'data-measured': String(row.measurement.measured ?? ''),
      'data-currency': row.currency || '',
      'data-key': row.key,
    },
  }));
  const columns = [
    { label: 'Domain', render: (r) => h('strong', null, raDomain(r.domain)?.label || r.domain) },
    { label: 'Measure', render: (r) => (r.measure === 'retained-exposure' ? `Retained exposure · ${r.currency}` : 'Declared risks') },
    { label: 'Stance', render: (r) => h('span', { class: 'small' }, r.appetiteLabel) },
    { label: 'Tolerance', render: (r) => h('span', { 'data-testid': `ra-tolerance-${r.id}` }, displayTolerance(r)) },
    { label: 'Measured (population)', render: (r) => h('span', null, displayFigure(r), h('span', { class: 'small muted' }, ` · over ${r.measurement.populationN} declared`)) },
    { label: 'Verdict', render: verdictCell },
    { label: 'Headroom / over', render: (r) => {
      if (r.verdict === 'unmeasurable') return h('span', { class: 'small muted' }, r.measurement.reason);
      if (r.breached) {
        return h('span', { class: 'text-warn' }, r.measure === 'retained-exposure'
          ? `over by ${r.currency} ${centsToDisplay(r.measurement.overBy)}`
          : `over by ${r.measurement.overBy}`);
      }
      return h('span', { class: 'small muted' }, r.measure === 'retained-exposure'
        ? `${r.currency} ${centsToDisplay(r.measurement.headroom)} to the ceiling`
        : `${r.measurement.headroom} to the ceiling`);
    } },
    { label: 'Review', render: (r) => h('span', null, r.reviewOn, r.reviewOverdue ? h('span', { class: 'small' }, ' ', badge(`overdue ${r.reviewOverdueDays}d`, 'caution')) : null) },
    { label: 'Escalates to', render: (r) => {
      if (r.verdict !== 'breached' && !r.reviewOverdue) return h('span', { class: 'small muted' }, '—');
      const e = r.escalation;
      if (e.unique) return h('span', null, e.apexName);
      if (e.ambiguous) return h('span', { class: 'small' }, `joint apex tie: ${e.apexIds.length} seats, each asked`);
      if (e.disconnected) return h('span', { class: 'small text-warn' }, 'no joint seat above the carrying lines');
      return h('span', { class: 'small muted' }, 'no seat resolves');
    } },
    { label: '', render: (r) => (canDeclare && !r.retiredOn
      ? button('Retire', () => retireDialog(ctx, r, onDone), { testid: `ra-retire-${r.id}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'ra-statements' },
    canDeclare ? h('div', { class: 'row gap-s' },
      button('Declare an appetite', () => declareStatementDialog(ctx, report, onDone), { primary: true, testid: 'ra-declare-statement' }),
      button('Scan the register', () => {
        const result = ctx.api.riskAppetiteScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Owed decisions were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'ra-scan' })) : null,
    table({
      caption: 'Live appetite statements — stance, exact ceiling, measured figure over the declared population',
      columns,
      rows,
      emptyMessage: 'No appetite has been declared. Until one is, the enterprise carries risk against a ceiling nobody wrote down.',
    }),
  );
}

function risksView(ctx, report, onDone) {
  const canCarry = Boolean(ctx.api.riskAppetiteDeclareRisk);
  const rows = report.declarations.map((row) => ({
    ...row,
    attrs: { 'data-testid': `ra-risk-${row.id}`, 'data-cents': String(row.retainedCents), 'data-currency': row.currency },
  }));
  const columns = [
    { label: 'Risk', render: (r) => h('strong', null, r.caseTitle || r.caseId) },
    { label: 'Owner', render: (r) => h('span', null, r.ownerName || '—', r.ownerOnRoster ? null : h('span', { class: 'small' }, ' ', badge('off roster', 'caution'))) },
    { label: 'Lines held', render: (r) => (r.lineNames.length ? r.lineNames.join(' · ') : '—') },
    { label: 'Domain', render: (r) => raDomain(r.domain)?.label || r.domain },
    { label: 'Retained', render: (r) => h('span', { 'data-testid': `ra-risk-cents-${r.id}`, 'data-cents': String(r.retainedCents) }, `${r.currency} ${centsToDisplay(r.retainedCents)}`) },
    { label: 'Declared', render: (r) => `${r.declaredOn} · ${r.declarerName || 'unknown seat'}` },
    { label: 'Basis', render: (r) => h('span', { class: 'small muted' }, r.basis.length > 140 ? `${r.basis.slice(0, 140)}…` : r.basis) },
    { label: '', render: (r) => (canCarry
      ? button('Withdraw', () => withdrawDialog(ctx, r, onDone), { testid: `ra-withdraw-${r.id}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  const note = [];
  if (report.totals.hiddenDeclarationsN) note.push(banner({ tone: 'info', title: `${report.totals.hiddenDeclarationsN} declared risk(s) counted, not shown`, body: report.totals.hiddenDeclarationsReason }));
  if (report.declarationsCapped > 0) note.push(banner({ tone: 'info', title: `Showing ${report.declarationsShown} of ${report.declarationsShown + report.declarationsCapped} visible risks`, body: 'The cap is printed, not hidden: the remainder is counted and the register still measures every one of them.' }));
  if (report.totals.undeclaredN) note.push(banner({ tone: 'caution', title: `${report.totals.undeclaredN} open risk case(s) carry no declaration`, body: 'Their exposure is unknown. The register prints that as a coverage gap and refuses to certify any tolerance over it — it never treats the gap as zero.' }));
  return h('div', { class: 'stack', 'data-testid': 'ra-risks' },
    canCarry ? h('div', { class: 'row' }, button('Declare what we retain', () => declareRiskDialog(ctx, report, onDone), { primary: true, testid: 'ra-declare-risk' })) : null,
    ...note,
    table({
      caption: 'Live risk declarations — one amount per risk, in one currency, with a written basis',
      columns,
      rows,
      emptyMessage: 'No risk has a declared retention. A risk with no declaration is counted, not assumed safe.',
    }),
  );
}

function linesView(report) {
  return h('div', { class: 'stack', 'data-testid': 'ra-lines' },
    banner({
      tone: 'info',
      title: 'Counts by home line — the money is deliberately not attributed',
      body: 'A risk is counted once at the enterprise. Where its owner holds several lines it is counted once, at the home line, and flagged as cross-line. The retained exposure is NOT divided between managers, because no human declared that division; a per-line money column would invent one.',
    }),
    table({
      caption: 'Declared risks by the owner’s home line',
      columns: [
        { label: 'Home line', key: 'managerName' },
        { label: 'Declared risks', key: 'declaredN' },
        { label: 'Of which cross-line owners', key: 'crossLineN' },
        { label: 'Owner off roster', key: 'unownedN' },
        { label: 'Exposure', render: () => h('span', { class: 'small muted' }, 'not attributed') },
      ],
      rows: report.lines,
      emptyMessage: 'No declared risk reaches a line yet.',
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'ra-method' },
    card({
      title: 'The register in one picture',
      subtitle: 'A stance and an exact ceiling, a declared population and a measured figure, and the two claims printed apart: inside the ceiling, and the whole population measured.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Risk appetite register: declared stance and tolerance, declared retained exposure per live risk, exact comparison, then a separate coverage claim and an escalation to the joint seat above the carrying lines.', class: 'figure-img', 'data-testid': 'ra-diagram' }),
        h('figcaption', { class: 'small muted' }, 'Every measured figure is over the declared population. Coverage is a separate claim and is printed whether or not the ceiling was met.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...RA_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'What the page prints, and how', body: h('ul', { class: 'list' }, ...RA_METHOD.printed.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...RA_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

/* ----------------------------------------------- shared-dependency reading */

/**
 * ADR-0226. The reader does every sum, share and verdict; this function formats
 * what it returned. A seat that may not see every live declared risk gets the
 * reader's WITHHELD state and no figure at all.
 */
function concentrationView(ctx) {
  const report = ctx.api.riskAppetiteConcentration ? ctx.api.riskAppetiteConcentration() : null;
  const head = card({
    title: 'How a shared dependency is read',
    subtitle: 'Live risks that rely on one service, vendor or system realise together when it fails. Each retention was judged alone; this page adds the retentions that share a dependency, once per dependency, and compares the sum with the ceiling declared for that domain and currency.',
    body: h('figure', { class: 'figure' },
      h('img', { src: CONCENTRATION_DIAGRAM_URL, alt: 'Shared-dependency reading: several declared risks linked to one dependency, their retentions summed once per dependency and domain, the share of the declared domain total, and a comparison with the declared ceiling where one exists.', class: 'figure-img', loading: 'lazy' }),
      h('figcaption', { class: 'small muted' }, 'Overlap is by design: a risk on two dependencies is counted under each. Where no ceiling is declared the row says NOT COMPARED.')),
  });
  if (!report || report.ok === false || (!report.withheld && !report.totals)) {
    return h('div', { class: 'stack', 'data-testid': 'rc-view' }, head,
      banner({ tone: 'bad', title: 'The shared-dependency reading could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  if (report.withheld) {
    return h('div', { class: 'stack', 'data-testid': 'rc-view' }, head,
      banner({ tone: 'caution', title: 'Withheld from this seat — no figure is printed', body: report.withheldReason }));
  }
  const t = report.totals;
  const dependencyColumns = [
    { label: 'Dependency', render: (r) => h('span', null, h('strong', null, r.name), h('span', { class: 'small muted' }, ` · ${r.kind || 'dependency'}${r.criticality ? ` · ${r.criticality}` : ''}`)) },
    { label: 'Declared risks reaching it', render: (r) => h('span', { 'data-testid': `rc-dep-members-${r.id}` }, String(r.membersN)) },
    { label: 'Directly linked', render: (r) => String(r.directN) },
    { label: 'Through an upstream dependency', render: (r) => String(r.viaUpstreamN) },
    { label: 'Shared', render: (r) => (r.shared ? badge('shared by ≥2 risks', 'caution') : h('span', { class: 'small muted' }, 'single risk')) },
  ];
  const sharedColumns = [
    { label: 'Dependency', render: (r) => h('span', null, h('strong', null, r.dependencyName), r.criticality ? h('span', { class: 'small muted' }, ` · ${r.criticality}`) : null) },
    { label: 'Domain', render: (r) => raDomain(r.domain)?.label || r.domain },
    { label: 'Risks that rely on it', render: (r) => h('span', null,
      h('span', { 'data-testid': `rc-row-risks-${r.rowId}` }, `${r.riskN} of ${r.domainPopulationN} declared`),
      h('span', { class: 'small muted' }, ` · ${r.titles.slice(0, 3).join(' · ')}${r.titles.length > 3 ? ' · …' : ''}`)) },
    { label: 'Retained together', render: (r) => (r.retainedCents === null
      ? h('span', { class: 'small text-warn' }, 'withheld — above the representable range')
      : h('span', { 'data-testid': `rc-row-cents-${r.rowId}`, 'data-cents': String(r.retainedCents) }, `${r.currency} ${centsToDisplay(r.retainedCents)}`)) },
    { label: 'Share of the domain', render: (r) => (r.shareBp === null || r.domainTotalCents === null
      ? h('span', { class: 'small muted' }, '—')
      : h('span', { 'data-testid': `rc-row-share-${r.rowId}`, 'data-bp': String(r.shareBp) }, pct(r.shareBp), h('span', { class: 'small muted' }, ` of ${r.currency} ${centsToDisplay(r.domainTotalCents)}`))) },
    { label: 'Declared ceiling', render: (r) => (r.toleranceCents === null
      ? h('span', { class: 'small muted' }, 'none declared in this domain and currency')
      : `${r.currency} ${centsToDisplay(r.toleranceCents)}`) },
    { label: 'Verdict on its own', render: (r) => h('span', null,
      badge(CONCENTRATION_SHORT[r.verdict] || r.verdict, CONCENTRATION_TONE[r.verdict] || 'caution'),
      r.verdict === 'would-exceed' && r.overCeilingBy !== null
        ? h('span', { class: 'small' }, ` over by ${r.currency} ${centsToDisplay(r.overCeilingBy)}`)
        : null) },
  ];
  const sharedRows = report.sharedRows.map((row) => ({
    ...row,
    attrs: { 'data-testid': `rc-row-${row.rowId}`, 'data-verdict': row.verdict },
  }));
  return h('div', { class: 'stack', 'data-testid': 'rc-view' },
    head,
    card({
      title: 'What the reading holds',
      subtitle: 'Counts over the live declared population. A verdict is a fact about the declared risks that share a dependency, never a statement about the whole enterprise.',
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Shared rows', value: h('span', { 'data-testid': 'rc-count-shared' }, String(t.sharedRowsN)), hint: `${t.sharedDependenciesN} dependenc${t.sharedDependenciesN === 1 ? 'y' : 'ies'} with ≥2 declared risks` }),
        stat({ label: 'Would exceed the ceiling on their own', value: h('span', { 'data-testid': 'rc-count-exceed' }, String(t.wouldExceedN)), hint: 'one dependency realises more retention than the domain ceiling allows' }),
        stat({ label: 'Not compared', value: h('span', { 'data-testid': 'rc-count-no-ceiling' }, String(t.noCeilingN)), hint: 'no exposure ceiling is declared in that domain and currency' }),
        stat({ label: 'Declared risks read', value: h('span', { 'data-testid': 'rc-count-declared' }, String(t.declaredRisksN)), hint: `${t.linkedN} linked to an active dependency` }),
        stat({ label: 'Unlinked declared risks', value: h('span', { 'data-testid': 'rc-count-unlinked' }, String(t.unlinkedN + t.onlyRetiredN)), hint: 'their reliance is unknown, not independent' }),
        stat({ label: 'Undeclared open risks', value: h('span', { 'data-testid': 'rc-count-undeclared' }, String(t.undeclaredN)), hint: 'no live declaration; their dependency exposure is unseen' }),
      ),
    }),
    banner({
      tone: t.partitionReconciles ? 'info' : 'bad',
      title: t.partitionReconciles ? 'The reading accounts for every declared risk exactly once' : 'The reading does not account for every declared risk once',
      body: `Linked ${t.linkedN} + unlinked ${t.unlinkedN} + linked only to retired dependencies ${t.onlyRetiredN} = ${t.linkedN + t.unlinkedN + t.onlyRetiredN} of ${t.declaredRisksN} declared. This is the first claim: the arithmetic of the reading.`,
    }),
    banner({
      tone: t.wholePopulationMeasured ? 'good' : 'caution',
      title: t.wholePopulationMeasured ? 'The whole population is measured' : 'NOT CERTIFIED — the shared-dependency reading is incomplete',
      body: t.wholePopulationMeasured
        ? 'Every open risk is declared and every declared risk names its dependencies. This is the second claim, kept apart from the first.'
        : `${report.coverageReasons.join(' ')} The rows below are true of the risks that are declared AND linked only; they are not a statement about the whole enterprise.`,
    }),
    banner({ tone: 'info', title: 'Dependency rows overlap by design', body: t.overlapNote }),
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    table({
      caption: 'Shared rows — one dependency, one domain and currency, two or more live declared risks, summed once',
      columns: sharedColumns,
      rows: sharedRows,
      emptyMessage: t.declaredRisksN
        ? 'No dependency is shared by two or more live declared risks in the same domain and currency. That is not the same as no concentration: read the coverage claims above first.'
        : 'No risk is declared yet, so there is no dependency to read.',
    }),
    report.sharedRowsCapped > 0 ? banner({ tone: 'info', title: `Showing ${report.sharedRowsShown} of ${report.sharedRowsShown + report.sharedRowsCapped} shared rows`, body: 'The cap is printed, not hidden: the remainder is counted, and the verdicts are in the reader.' }) : null,
    table({
      caption: 'Dependencies that carry declared risk — how many risks reach each, and how',
      columns: dependencyColumns,
      rows: report.dependencies,
      emptyMessage: 'No declared risk names an active dependency. Declare the dependency a risk relies on with a depends-on link before reading concentration.',
    }),
    report.dependenciesCapped > 0 ? banner({ tone: 'info', title: `Showing ${report.dependenciesShown} of ${report.dependenciesShown + report.dependenciesCapped} dependencies`, body: 'The cap is printed, not hidden.' }) : null,
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...RC_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'What the reading prints', body: h('ul', { class: 'list' }, ...RC_METHOD.printed.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...RC_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderRiskAppetite(ctx) {
  const report = ctx.api.riskAppetiteReport ? ctx.api.riskAppetiteReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'CEO & C-suite · matrix', title: 'Enterprise risk appetite', subtitle: 'How much risk did we decide to carry — and are we inside it?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'statements';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'risk-appetite-panel' },
    pageHeader({
      eyebrow: 'CEO & C-suite · single-chain and matrix',
      title: 'How much risk are we carrying on purpose — and is it inside what we said?',
      subtitle: 'The board declares a stance and an exact ceiling per risk domain. Named lines declare what the enterprise deliberately retains for each live risk. The register compares the two exactly, and prints whether it measured the whole population.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Ownership cannot be proved right now', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'statements' ? report.statements.length : row.key === 'risks' ? report.declarationsShown : row.key === 'lines' ? report.lines.length : undefined,
      })),
      active: view,
      ariaLabel: 'Risk appetite views',
      onSelect: (key) => ctx.navigate(`${RA_HREF}?view=${key}`),
    }),
    view === 'statements' ? statementsView(ctx, report, onDone) : null,
    view === 'risks' ? risksView(ctx, report, onDone) : null,
    view === 'lines' ? linesView(report) : null,
    view === RC_VIEW_KEY ? concentrationView(ctx) : null,
    view === 'method' ? methodView() : null,
    view === 'statements' && !report.totals.statementsDeclared
      ? emptyState({ title: 'No appetite has been declared', body: 'Declaring one fixes an exact ceiling and a review date for one domain. Nothing is inferred from the cases, the FMEA ratings or the culture signals.' })
      : null,
  );
}

export default renderRiskAppetite;
