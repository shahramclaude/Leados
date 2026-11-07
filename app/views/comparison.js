/**
 * app/views/comparison.js — `#/compare`, the Portfolio Rehearsal Comparison.
 *
 * A VP or chief picks two reviewed responses, both are replayed from the SAME
 * frozen revision in the worker, and the screen prints what each one commits and
 * where they collide. Then — and only then — the seat records the arbitration
 * with a written rationale. Nothing is adopted here: the chosen response still
 * goes through its own reviewed `commitActionBundle` path.
 */
import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, badge, banner, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { COMPARISON_CHOICE_LABELS } from '../core/domain/portfolioComparison.js';
import { runPortfolioComparison } from '../ui/response-worker.js';

const work = { a: '', b: '', result: null, busy: false, error: '', choice: 'a', rationale: '', confirmed: false };
const clone = (v) => JSON.parse(JSON.stringify(v));
const money = (row) => `${row.currency} ${Number(row.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const shortlist = (list, empty) => (list.length ? list.join(' · ') : empty);

function hero(ctx, report) {
  return pageHeader({
    eyebrow: 'LEADOS · PORTFOLIO REHEARSAL COMPARISON',
    title: 'Two reviewed responses. One arbitration.',
    subtitle: 'Both responses are replayed through the real production commands from the same frozen revision. You see what each commits, where they collide, and which one dominates on declared resources — never which one will work. You decide, in writing.',
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/bundles' }, 'Action bundles'),
      h('a', { class: 'btn btn-ghost', href: '#/responses' }, 'Response studio'),
    ],
    meta: h('div', { class: 'comparison-stats' },
      h('span', null, `${report.records.length} recorded arbitration(s)`),
      h('span', null, `${report.decided.length} taken · ${report.held.length} held`),
      report.stale ? h('span', { class: 'badge badge-warn' }, `${report.stale} stale receipt(s)`) : h('span', { class: 'badge badge-good' }, 'Every receipt matches the workspace')),
  });
}

/**
 * Candidates come from the module's own seat-scoped adapter, never from the
 * generic projection: above the director rung the projection withholds unit
 * records entirely, and an executive arbitration screen that read it would be
 * empty at exactly the altitude it serves.
 */
function candidates(ctx) {
  const result = ctx.api.comparisonCandidates();
  return result?.ok ? result.bundles : [];
}

function picker(ctx, list) {
  if (list.length < 2) {
    return emptyState({
      title: 'Two reviewed responses are needed',
      body: 'This screen compares two OPEN action bundles. Build and rehearse one from an operational case (Action bundles), or rehearse a coordinated response in the Response studio — a comparison never invents a plan.',
      action: h('div', { class: 'page-actions' },
        h('a', { class: 'btn btn-primary', href: '#/bundles' }, 'Build an action bundle'),
        h('a', { class: 'btn', href: '#/responses' }, 'Open the Response studio')),
    });
  }
  const option = (b) => h('option', { value: b.id, selected: b.id === work.a || b.id === work.b },
    `${b.name} · ${b.status}${b.reviewOn ? ` · review ${b.reviewOn}` : ''}${b.titleWithheld ? ' · unit case title withheld above director' : ''}`);
  const select = (key, label) => {
    const id = `compare-${key}`;
    const control = h('select', { id, name: key, 'aria-label': `Response ${key.toUpperCase()}` },
      h('option', { value: '' }, 'Choose a reviewed response'), ...list.map(option));
    control.value = work[key];
    control.addEventListener('change', () => { work[key] = control.value; work.result = null; work.error = ''; });
    return h('div', { class: 'field' }, h('label', { for: id }, label), control);
  };
  const run = h('button', {
    class: 'btn btn-primary', type: 'button', disabled: work.busy,
    onClick: async () => {
      if (!work.a || !work.b) { toast('Choose two different reviewed responses.', 'bad'); return; }
      if (work.a === work.b) { toast('A response cannot be compared with itself.', 'bad'); return; }
      if (work.busy) return;
      work.busy = true; work.error = ''; ctx.refresh();
      const revision = ctx.store.state.meta.revision;
      const seat = ctx.seatContext?.seat || null;
      const result = await runPortfolioComparison(clone(ctx.store.state), work.a, work.b, ctx.now,
        { seatId: seat?.id || null, rank: seat?.rank ?? null });
      work.busy = false;
      if (ctx.store.state.meta.revision !== revision) {
        work.result = null; work.error = 'The workspace changed during the rehearsal. Run it again — a comparison is only valid for the revision it was rehearsed on.';
      } else if (!result.ok) {
        work.result = null; work.error = result.error;
      } else {
        work.result = result; work.choice = 'a'; work.rationale = ''; work.confirmed = false;
      }
      ctx.refresh();
    },
  }, work.busy ? 'Rehearsing both responses…' : 'Rehearse both from this revision');
  return card({
    title: '1 · Choose the two reviewed responses',
    subtitle: 'Both are replayed through production commands in disposable stores, from one snapshot, at one clock. Nothing is written by the rehearsal.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'comparison-picker' }, select('a', 'Response A'), select('b', 'Response B')),
      h('div', { class: 'page-actions' }, run),
      h('p', { class: 'muted tiny' }, 'A bundle that was adopted, withdrawn or archived is not a candidate: a comparison is between open responses.'),
      work.error ? banner({ tone: 'bad', title: 'Nothing was compared', body: work.error }) : null),
  });
}

function sideCard(side, label) {
  const changes = side.footprint.changes;
  return card({
    title: `${label} — ${side.name}`,
    subtitle: side.caseTitle ? `Source case: ${side.caseTitle}` : 'No source case recorded',
    actions: [badge(`${side.commands.length} command kind(s)`, 'neutral')],
    body: h('div', { class: 'stack-sm' },
      h('ul', { class: 'comparison-commitments' },
        h('li', null, h('strong', null, 'Declared spend'), h('span', null, side.spend.length ? side.spend.map(money).join(' + ') : 'none declared')),
        h('li', null, h('strong', null, 'Owned work'), h('span', null, String(side.declared.ownedWork))),
        h('li', null, h('strong', null, 'Stakeholder briefs'), h('span', null, String(side.declared.briefs))),
        h('li', null, h('strong', null, 'Coaching prompts'), h('span', null, String(side.declared.coaching))),
        h('li', null, h('strong', null, 'Tested assumptions'), h('span', null, String(side.declared.assumptions))),
        h('li', null, h('strong', null, 'Review date'), h('span', null, side.reviewOn || 'not set'))),
      table({
        caption: `${label} operational footprint`,
        rows: changes,
        columns: [
          { label: 'Module ledger', render: (r) => r.collection },
          { label: 'Created', render: (r) => r.created },
          { label: 'Updated', render: (r) => r.updated },
          { label: 'Removed', render: (r) => r.removed },
        ],
      }),
      h('p', { class: 'muted tiny' }, `Totals +${side.footprint.totals.created} / ~${side.footprint.totals.updated} / -${side.footprint.totals.removed} · ${side.footprint.ruleIds.length} rule effect(s) · ${side.footprint.relationships.length} typed-relationship group(s) · ${side.footprint.failureCount} failure(s)`),
      side.footprint.relationships.length
        ? h('div', { class: 'bundle-relations' }, ...side.footprint.relationships.slice(0, 12).map((r) => h('span', { class: 'case-link-pill' }, `${r.sourceType} → ${r.relation} → ${r.targetType} · ${r.added}`)))
        : h('p', { class: 'muted tiny' }, 'No typed relationships were created or removed by this response.')),
  });
}

function overlapCard(overlap, sides) {
  const rows = [
    overlap.sameSourceCase ? `Both responses address the same source case (${sides[0].caseTitle || 'untitled'}).` : null,
    overlap.sameReviewDate ? `Both propose the same review date (${sides[0].reviewOn}).` : null,
    overlap.sharedOwnerIds.length ? `${overlap.sharedOwnerIds.length} owner(s) would receive work from BOTH responses.` : null,
    overlap.sharedBudgetIds.length ? `${overlap.sharedBudgetIds.length} budget envelope(s) would be charged by BOTH responses.` : null,
    overlap.sharedCollections.length ? `Both write to the same ledger(s): ${overlap.sharedCollections.join(', ')}.` : null,
    overlap.sharedRelations.length ? `Both create the same typed relationship(s): ${overlap.sharedRelations.slice(0, 6).join(', ')}.` : null,
  ].filter(Boolean);
  return card({
    title: 'Where the two responses collide',
    subtitle: 'Committing both at once means paying these twice or coordinating them. This is a list of facts, not a penalty score.',
    body: rows.length
      ? h('ul', { class: 'comparison-overlap' }, ...rows.map((line) => h('li', null, line)))
      : h('p', null, 'No declared overlap: the two responses touch different cases, owners, envelopes and ledgers on this revision.'),
  });
}

function dominanceCard(dominance) {
  const tone = dominance.verdict === 'neither' || dominance.verdict === 'incomparable' ? 'caution' : 'info';
  const headline = {
    a: 'Response A dominates on declared resources',
    b: 'Response B dominates on declared resources',
    identical: 'The two declared vectors are identical',
    neither: 'Neither response dominates',
    incomparable: 'The two responses cannot be compared on spend',
  }[dominance.verdict] || dominance.verdict;
  return card({
    title: '2 · The undominated set, not a winner',
    subtitle: 'Pareto dominance over declared criteria only. The lighter response is not the better one, and this screen never claims it is.',
    body: h('div', { class: 'stack-sm' },
      banner({ tone, title: headline, body: dominance.note }),
      dominance.dimensions.length
        ? table({
          caption: 'Declared criteria, side by side',
          rows: dominance.dimensions.map((row) => ({ ...row, label: row.key === 'spend' ? 'Declared spend (same currency set)' : row.key })),
          columns: [
            { label: 'Criterion', render: (r) => r.label },
            { label: 'Response A', render: (r) => String(r.a) },
            { label: 'Response B', render: (r) => String(r.b) },
          ],
        })
        : null),
  });
}

function assumptionsCard(lines) {
  return card({
    title: 'Declared assumptions and limits',
    subtitle: 'Printed before you decide, and stored with the receipt.',
    body: h('ul', { class: 'comparison-assumptions' }, ...lines.map((line) => h('li', null, line))),
  });
}

function arbitrationForm(ctx, result) {
  const [a, b] = result.sides;
  const radio = (value, label) => {
    const id = `compare-choice-${value}`;
    const input = h('input', { type: 'radio', name: 'compare-choice', id, value, checked: work.choice === value });
    input.addEventListener('change', () => { work.choice = value; });
    return h('label', { class: 'check', for: id }, input, h('span', null, label));
  };
  const rationale = h('textarea', { id: 'compare-rationale', rows: 4, maxlength: 1200, placeholder: 'Why this response, on this evidence, now — and what would change your mind.' });
  rationale.addEventListener('input', () => { work.rationale = rationale.value; });
  const confirmed = h('input', { id: 'compare-confirm', type: 'checkbox', checked: work.confirmed });
  confirmed.addEventListener('change', () => { work.confirmed = confirmed.checked; });
  const record = h('button', {
    class: 'btn btn-primary', type: 'button',
    onClick: () => {
      const response = ctx.api.recordPortfolioComparison({
        receipt: result.receipt, choice: work.choice, rationale: work.rationale, assumptionsConfirmed: work.confirmed,
      });
      if (!response.ok) { toast(response.error, 'bad'); return; }
      work.result = null; work.a = ''; work.b = ''; work.rationale = ''; work.confirmed = false;
      toast('Arbitration recorded with its comparison. The chosen response is still adopted through its own review.', 'good');
      ctx.refresh();
    },
  }, 'Record this arbitration');
  return card({
    title: '3 · Record the arbitration',
    subtitle: 'One atomic transaction: the receipt, the governed decision and the vertical roll-up. No response is adopted by this act.',
    body: h('div', { class: 'stack-sm' },
      h('fieldset', { class: 'comparison-choices' }, h('legend', null, 'What are you taking?'),
        radio('a', `Take A — ${a.name}`),
        radio('b', `Take B — ${b.name}`),
        radio('neither', COMPARISON_CHOICE_LABELS.neither)),
      h('div', { class: 'field' }, h('label', { for: 'compare-rationale' }, 'Reasoning (required)'), rationale),
      h('label', { class: 'check', for: 'compare-confirm' }, confirmed,
        h('span', null, 'I read the declared assumptions and the dominance refusal. This choice is mine, not the software’s.')),
      h('div', { class: 'page-actions' }, record),
      h('p', { class: 'muted tiny' }, 'The receipt is refused if the workspace revision, the day or either reviewed response changed since the rehearsal.')),
  });
}

function ledger(ctx, report) {
  if (!report.records.length) return null;
  return card({
    title: 'Arbitration ledger',
    subtitle: 'Every recorded comparison, with its receipt and the decision it opened. A stale receipt is printed as stale, never silently trusted.',
    body: table({
      caption: 'Recorded portfolio comparisons',
      rows: report.records,
      columns: [
        { label: 'Recorded', render: (r) => r.recordedOn },
        { label: 'Responses', render: (r) => `${r.receipt.sides[0].name} vs ${r.receipt.sides[1].name}` },
        { label: 'Arbitration', render: (r) => r.chosenLabel },
        { label: 'Dominance', render: (r) => badge(r.receipt.dominance.verdict, r.receipt.dominance.verdict === 'neither' ? 'warn' : 'neutral') },
        { label: 'State', render: (r) => (r.stale ? badge('stale rehearsal', 'warn', 'The workspace changed after this receipt') : badge('current', 'good')) },
        {
          label: 'Record',
          render: (r) => h('div', { class: 'page-actions' },
            h('button', {
              class: 'btn btn-small btn-ghost', type: 'button',
              onClick: () => openModal({
                title: 'Comparison receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Comparison receipt' }, ctx.api.comparisonBrief(r.id)),
              }),
            }, 'Read receipt'),
            h('button', {
              class: 'btn btn-small btn-ghost', type: 'button',
              onClick: () => {
                const text = ctx.api.comparisonBrief(r.id);
                if (!downloadText({ filename: `leados-comparison-${r.id}.txt`, text, mime: 'text/plain' })) {
                  openModal({ title: 'Copy comparison receipt', body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Comparison receipt' }, text) });
                }
              },
            }, 'Export')),
        },
      ],
    }),
  });
}

export function renderComparison(ctx) {
  const root = h('div', { class: 'view-stack comparison-view' });
  const report = ctx.api.comparisonRead();
  const seat = ctx.seatContext?.seat || null;
  root.appendChild(hero(ctx, report));
  if (seat && !seat.fullAccess && seat.rank < 4) {
    root.appendChild(banner({
      tone: 'caution', title: 'This screen opens at the VP altitude',
      body: 'Comparing two reviewed responses and arbitrating between them commits capital, work and messaging across spans. Below VP the same facts are read through the disclosure ledger, not as an executive decision.',
    }));
    const saved = ledger(ctx, report);
    if (saved) root.appendChild(saved);
    return root;
  }
  const list = candidates(ctx);
  root.appendChild(picker(ctx, list));
  const result = work.result;
  if (result) {
    root.appendChild(banner({
      tone: 'good', title: `Both responses replayed from revision ${result.baseRevision}`,
      body: `Evaluated ${result.evaluatedOn}. These are actual command effects and declared commitments, not predicted outcomes. Nothing is live.`,
    }));
    root.appendChild(h('div', { class: 'comparison-grid' }, sideCard(result.sides[0], 'A'), sideCard(result.sides[1], 'B')));
    root.appendChild(overlapCard(result.overlap, result.sides));
    root.appendChild(dominanceCard(result.dominance));
    root.appendChild(assumptionsCard(result.assumptions));
    root.appendChild(arbitrationForm(ctx, result));
  } else {
    root.appendChild(card({
      title: 'What this screen will and will not tell you',
      subtitle: 'The distinction is the feature.',
      body: h('div', { class: 'stack-sm' },
        h('p', null, 'It WILL tell you, from one frozen revision: every declared spend line, owned work item, brief, precondition and review date in each response; the record and typed-relationship deltas production rules actually produced; where the two responses would charge the same envelope, land on the same owner or write the same ledger; and whether one response is lighter than the other on every comparable criterion.'),
        h('p', null, 'It will NOT estimate a probability of success, an expected value, a benefit, a morale effect or a ranking. No recorded fact here could support those claims, so the software refuses to print them.'),
        h('p', { class: 'muted small' }, 'Frameworks applied: Pareto (1906) dominance over the declared criteria set; Keeney & Raiffa (1976) multi-criteria analysis, in which the weights are the decision-maker’s judgement and not the tool’s; Arrow (1951) as the standing warning against collapsing incommensurable criteria into one number.')) }));
  }
  const saved = ledger(ctx, report);
  if (saved) root.appendChild(saved);
  return root;
}
