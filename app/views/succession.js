/**
 * app/views/succession.js — the Succession Terminal (`#/succession`, ADR-0077).
 *
 * ONE surface, five genuinely different questions. §0.3 requires that a frontline
 * lead is not buried in CEO-level bench analytics and a CEO is not scrolling
 * through individual readiness notes, so the panel content, the disclosure ladder
 * and the duties are all derived from the seat's rank through `successionView`.
 * There is no second org model and no per-altitude dashboard: altitude is a
 * parameter of the same engine.
 *
 * Five panels:
 *   Bench       every span with its verdict, its blanket and its effective number
 *               of holders. A certified gap prints the min-cut certificate: the
 *               exact obligations no survivor can take.
 *   Reabsorb    the per-holder flow test, with the eligibility that admitted each
 *               survivor and the blind spot (pairs with no record at all) printed.
 *   Blanket     what the span has promised and until when — with the thread count,
 *               because a long blanket carried by one thread is the dangerous shape.
 *   Chain       the per-altitude roll-up and the enterprise certification with its
 *               lower bound, its refusals, and the diffusion index.
 *   Readings    frozen claims, their Brier grades, and the exposure priced per
 *               declared currency.
 *   Method      the named frameworks, the conventions and the refusals, once.
 *
 * Pure rendering from `ctx.api.successionRead()`; every write goes through actions.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { dayKey, formatDate } from '../core/time.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { GAP_VERDICTS, SUCCESSION_PREMISE, altitudeByRank } from '../core/domain/successionRegistry.js';

/**
 * `ui/components.table` requires an explicit `render` per column, which is the
 * right contract: a column that does not say how to draw a value cannot silently
 * print `[object Object]`. This helper keeps the declaration honest while making
 * the ordinary "print the cell" case one line.
 */
function cols(rows) {
  return rows.map((row) => ({ ...row, render: row.render || ((record) => {
    const value = record[row.key];
    if (value === null || value === undefined) return '—';
    return String(value);
  }) }));
}

const PANELS = [
  { key: 'bench', label: 'The bench' },
  { key: 'reabsorb', label: 'Reabsorption test' },
  { key: 'blanket', label: 'Blanket & concentration' },
  { key: 'chain', label: 'Chain & certification' },
  { key: 'readings', label: 'Frozen readings & exposure' },
  { key: 'method', label: 'Method' },
];
const PANEL_ALIAS = {
  home: 'bench', spans: 'bench', succession: 'bench', gaps: 'bench',
  flow: 'reabsorb', mincut: 'reabsorb', certificate: 'reabsorb', eligibility: 'reabsorb',
  blanket: 'blanket', concentration: 'blanket', hhi: 'blanket', understudy: 'blanket',
  chain: 'chain', rollup: 'chain', 'roll-up': 'chain', altitudes: 'chain', diffusion: 'chain',
  readings: 'readings', exposure: 'readings', money: 'readings', money2: 'readings',
  method: 'method', frameworks: 'method', refusals: 'method',
};
const VERDICT_TONE = { 'certified-gap': 'bad', concentrated: 'warn', covered: 'good', unmeasured: 'neutral' };

function resolvePanel(query) {
  const requested = query?.get?.('panel');
  if (!requested) return 'bench';
  const key = PANEL_ALIAS[requested] || requested;
  return PANELS.some((p) => p.key === key) ? key : 'bench';
}
function navigate(ctx, panel) {
  ctx.navigate(`#/succession?panel=${encodeURIComponent(panel)}`);
}
const fmt = (value, suffix = '') => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${value}${suffix}`);
const pct = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)}%`);

function verdictBadge(verdict) {
  const row = GAP_VERDICTS.find((v) => v.key === verdict);
  return badge(row ? row.label : 'Unmeasured', VERDICT_TONE[verdict] || 'neutral', row ? row.detail : '');
}

/* ------------------------------------------------------------ the header */

function header(ctx, r) {
  const c = r.counts;
  const seatLine = r.view.seat
    ? `${r.view.seat.name} · ${r.view.stance.question}`
    : 'Undeclared operator view — the whole chain, no altitude filter';
  return pageHeader({
    eyebrow: 'Leadership bench · certified, not nominated',
    title: 'Succession',
    subtitle: seatLine,
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        onClick: () => {
          const text = ctx.api.successionBriefText();
          downloadText(`leados-succession-brief-${dayKey(new Date())}.txt`, text);
          toast('Brief generated — identity-free, every unverified figure marked.', 'good');
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-primary',
        onClick: () => freezeDialog(ctx, r),
      }, 'Freeze a bench claim'),
    ],
    meta: [
      badge(`${c.spansN} span(s)`, 'neutral'),
      badge(`${c.measuredN} measurable`, c.measuredN ? 'neutral' : 'warn'),
      c.certifiedN ? badge(`${c.certifiedN} certified gap(s)`, 'bad') : null,
      c.concentratedN ? badge(`${c.concentratedN} concentrated`, 'warn') : null,
      c.unmeasuredN ? badge(`${c.unmeasuredN} unmeasured`, 'neutral') : null,
    ].filter(Boolean),
  });
}

/* ------------------------------------------------------------- panel one */

function benchPanel(ctx, r) {
  const rows = r.view.rows.length ? r.view.rows : r.spans.map((s) => ({
    nodeId: s.nodeId, label: s.name, where: 'own', altitude: s.altitude, rank: s.rank,
    membersN: s.membersN, itemsN: s.itemsN, blockedN: s.blockedN, verdict: s.verdict,
    blanketDays: s.blanket?.blanketDays ?? null, threadCount: s.blanket?.threadCount ?? 0,
    topHolderShare: s.concentration?.topHolderShare ?? null,
    effectiveHolders: s.concentration?.effectiveHolders ?? null,
    refused: s.refused || s.blanket?.refused || s.concentration?.refused || null,
  }));
  const focused = r.focus || (r.spans.length ? r.spans[0] : null);

  const spanCards = rows.slice(0, 24).map((row) => {
    const span = r.spans.find((s) => s.nodeId === row.nodeId);
    if (!span) return null;
    const certificate = span.blockingSet.length
      ? h('div', { class: 'stack-tight' },
          h('p', { class: 'muted small' },
            'Certificate — the minimum set of obligations no survivor can hold. The flow test is infeasible, so this is a proof about the record, not a prediction about a departure.'),
          table({
            caption: `Minimum cut for ${span.name}’s span`,
            columns: cols([
              { key: 'type', label: 'Source', render: (row2) => badge(row2.type, 'neutral') },
              { key: 'title', label: 'Obligation', render: (row2) => String(row2.title || '—').slice(0, 90) },
              { key: 'due', label: 'Due', render: (row2) => (row2.dueOn ? formatDate(row2.dueOn) : 'undated') },
              { key: 'eligible', label: 'Eligible survivors', align: 'right', render: (row2) => (row2.eligibleN ? String(row2.eligibleN) : badge('none', 'bad')) },
            ]),
            rows: span.blockingSet.map((item) => ({ ...item })),
            emptyMessage: 'No blocked obligation.',
          }),
        )
      : null;
    const holderRows = (span.concentration?.shares || []).filter((s) => s.weight > 0).slice(0, 8).map((s) => {
      const member = span.members.find((m) => m.id === s.id);
      return {
        holder: r.view.disclosure.personNames ? (member?.name || s.id) : `rank ${member?.rank || 0} holder`,
        items: member?.itemN ?? 0,
        share: s.share,
        headroom: member?.headroom ?? 0,
        handovers: member?.handovers ? `${member.handovers.tested - member.handovers.failed}/${member.handovers.tested}` : 'none recorded',
      };
    });
    return card({
      id: `span-${span.nodeId}`,
      title: span.name,
      subtitle: `${altitudeByRank(span.rank).label} · ${span.membersN} direct report(s) · ${span.itemsN} dated obligation(s) · blanket ${fmt(span.blanket?.blanketDays, 'd')} across ${span.blanket?.threadCount ?? 0} thread(s)`,
      actions: [verdictBadge(span.verdict)],
      body: h('div', { class: 'stack-tight' },
        span.refused ? banner({ tone: 'info', title: 'Refused — reported as unmeasured, not as covered', body: span.refused }) : null,
        !span.refused && span.blanket?.refused ? h('p', { class: 'muted small' }, span.blanket.refused) : null,
        h('div', { class: 'stat-grid' },
          stat({ label: 'Effective holders', value: fmt(span.concentration?.effectiveHolders), hint: `inverse-HHI over ${span.membersN} member(s)` }),
          stat({ label: 'Top holder share', value: pct(span.concentration?.topHolderShare), tone: (span.concentration?.topHolderShare || 0) > r.conventions.successionConcentrationCapPct ? 'warn' : '', hint: `cap ${r.conventions.successionConcentrationCapPct}%` }),
          stat({ label: 'Blocked obligations', value: String(span.blockedN), tone: span.blockedN ? 'bad' : '', hint: 'min-cut size' }),
          stat({ label: 'Blanket', value: fmt(span.blanket?.blanketDays, 'd'), hint: span.blanket?.blanketOn ? `to ${formatDate(span.blanket.blanketOn)}` : 'no dated promise' }),
        ),
        holderRows.length ? table({
          caption: `Work holding inside ${span.name}’s span`,
          columns: cols([
            { key: 'holder', label: 'Holder' },
            { key: 'items', label: 'Items', align: 'right' },
            { key: 'share', label: 'Share of work', align: 'right', render: (row2) => pct(row2.share) },
            { key: 'headroom', label: 'Headroom', align: 'right', render: (row2) => String(row2.headroom) },
            { key: 'handovers', label: 'Handovers settled', align: 'right' },
          ]),
          rows: holderRows,
        }) : h('p', { class: 'muted small' }, 'Nobody in this span holds a dated obligation, so concentration cannot be measured. That is empty, not diversified.'),
        certificate,
        h('div', { class: 'row-gap wrap' },
          h('button', {
            class: 'btn btn-tiny btn-ghost',
            onClick: () => freezeDialog(ctx, r, span.nodeId),
          }, 'Freeze a claim for this span'),
          h('a', { class: 'btn btn-tiny btn-ghost', href: `#/succession?panel=reabsorb&span=${encodeURIComponent(span.nodeId)}` }, 'Run the reabsorption test'),
        ),
      ),
    });
  }).filter(Boolean);

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: SUCCESSION_PREMISE.claim,
      body: `${SUCCESSION_PREMISE.wouldRefute}`,
    }),
    focused && focused.verdict === 'certified-gap'
      ? banner({
          tone: 'bad',
          title: `${focused.name}’s span cannot reabsorb ${focused.blockedN} obligation(s)`,
          body: 'A maximum-flow test over every recorded working relationship found no assignment of these items to the people who remain. The certificate below names them, which is what makes it actionable rather than alarming. Nothing here is a prediction about a person; it is a statement about the span.',
        })
      : null,
    spanCards.length ? h('div', { class: 'stack' }, ...spanCards)
      : emptyState({
          title: 'No leadership span exists yet',
          body: 'The bench is a property of the reporting tree: add people and set who reports to whom, and every span appears here with its blanket, its concentration and its flow test. Nothing is inferred from titles alone.',
          icon: '◇',
        }),
  );
}

/* ------------------------------------------------------------- panel two */

function reabsorbPanel(ctx, r) {
  const query = ctx.query;
  const nodeId = query?.get?.('span');
  const spans = nodeId ? r.spans.filter((s) => s.nodeId === nodeId) : r.spans.filter((s) => s.holders?.length);
  if (!spans.length) {
    return emptyState({
      title: 'No span carries a dated obligation',
      body: 'The flow test needs promises with dates on them. Record delegations, goals or cases with due dates and the test can say whether the work survives a holder leaving.',
      icon: '◇',
    });
  }
  const cards = spans.slice(0, 12).map((span) => card({
    title: `${span.name} — ${span.verdict === 'certified-gap' ? 'infeasible' : span.queried ? '' : 'tested'}`,
    subtitle: `${span.holders.length} holder(s) tested · ${span.blockedN} blocked · ${span.unlinkedPairs} survivor pair(s) with no recorded relationship`,
    actions: [verdictBadge(span.verdict)],
    body: h('div', { class: 'stack-tight' },
      table({
        caption: `Per-holder reabsorption for ${span.name}’s span`,
        columns: cols([
          { key: 'holder', label: 'If this holder left', render: (row) => (r.view.disclosure.personNames ? row.holderName : `rank ${span.rank} holder`) },
          { key: 'items', label: 'Items', align: 'right' },
          { key: 'eligible', label: 'Eligible survivors', align: 'right', render: (row) => (row.eligibleSurvivorN ? String(row.eligibleSurvivorN) : badge('none', 'bad')) },
          { key: 'result', label: 'Reabsorption', render: (row) => (row.feasible ? badge('feasible', 'good') : badge(`${(row.blocked || []).length} blocked`, 'bad')) },
          { key: 'why', label: 'Why', render: (row) => (row.refused ? String(row.refused).slice(0, 120) : `capacity ${row.capacityTotal ?? 0} item(s) across survivors`) },
        ]),
        rows: span.holders,
      }),
      h('p', { class: 'muted small' },
        'Eligibility is evidence, never a name someone imagined: a survivor must have a recorded working relationship with the holder — a delegation in the same team, a shared goal, a co-run review loop, or a recorded handover. `same-team` is the weakest source and is counted, not hidden. The blind spot is printed above: pairs with no record at all are exactly where this terminal may over-report a gap.'),
    ),
  }));
  return h('div', { class: 'stack' }, ...cards);
}

/* ----------------------------------------------------------- panel three */

function blanketPanel(ctx, r) {
  const rows = r.spans.map((span) => ({
    span: r.view.disclosure.personNames ? span.name : `${altitudeByRank(span.rank).label} · rank ${span.rank}`,
    altitude: altitudeByRank(span.rank).label,
    blanket: span.blanket?.blanketDays,
    on: span.blanket?.blanketOn,
    threads: span.blanket?.threadCount ?? 0,
    expiring: span.blanket?.expiringIn30N ?? 0,
    hhi: span.concentration?.hhi,
    effective: span.concentration?.effectiveHolders,
    top: span.concentration?.topHolderShare,
    verdict: span.verdict,
  }));
  const understudyRows = r.spans.filter((s) => s.quotable).map((span) => {
    const tested = span.handovers?.tested || 0;
    const failed = span.handovers?.failed || 0;
    const floor = r.conventions.successionTestedFloor;
    const measured = tested >= floor;
    const probability = measured
      ? ((failed + 0.5) / (tested + 1)) * 100
      : ((tested + 1) / (tested + 2)) * 100;
    return {
      span: r.view.disclosure.personNames ? span.name : `rank ${span.rank} span`,
      mode: measured ? badge('measured', 'good') : badge('untested', 'warn'),
      tested: `${tested - failed}/${tested}`,
      probability: `${probability.toFixed(1)}%`,
      method: measured ? 'Jeffreys on the measured record' : 'Lindley–Smith, untested instrument',
    };
  });
  return h('div', { class: 'stack' },
    card({
      title: 'The blanket — what each span has promised, and until when',
      subtitle: 'Haehling von Lanzenauer & Wright (1991): coverage is the collective promise, not the best individual. Thread count is printed because a long blanket carried by one thread is the dangerous shape.',
      body: table({
        caption: 'Collective blanket per span',
        columns: cols([
          { key: 'span', label: 'Span' },
          { key: 'altitude', label: 'Altitude' },
          { key: 'blanket', label: 'Blanket', align: 'right', render: (row) => (row.blanket === null ? badge('none', 'bad') : `${row.blanket}d`) },
          { key: 'threads', label: 'Threads', align: 'right' },
          { key: 'expiring', label: 'Expiring ≤30d', align: 'right' },
          { key: 'hhi', label: 'HHI', align: 'right' },
          { key: 'effective', label: 'Effective holders', align: 'right' },
          { key: 'top', label: 'Top share', align: 'right', render: (row) => pct(row.top) },
          { key: 'verdict', label: 'Verdict', render: (row) => verdictBadge(row.verdict) },
        ]),
        rows,
        emptyMessage: 'No spans in the chain.',
      }),
    }),
    card({
      title: 'Understudy risk — what an untested bench is worth',
      subtitle: 'Lindley–Smith single-sample acceptance (Lindley 1965; Smith 1961): the probability that the NEXT critical event is the first one this span cannot cover. It reads high for a never-tested bench because that is what a never-tested bench is worth.',
      body: understudyRows.length ? table({
        caption: 'Understudy risk per span',
        columns: cols([
          { key: 'span', label: 'Span' },
          { key: 'mode', label: 'Basis' },
          { key: 'tested', label: 'Handovers settled', align: 'right' },
          { key: 'probability', label: 'P(next uncovered)', align: 'right' },
          { key: 'method', label: 'Method' },
        ]),
        rows: understudyRows,
      }) : h('p', { class: 'muted small' }, 'No span is measurable yet, so no understudy probability is quoted. A number here without a span behind it would be decoration.'),
    }),
    card({
      title: 'Declare what the record cannot answer',
      subtitle: 'A daily cost of vacancy, and how many handovers each person has actually run. Both are declarations; both are printed beside every figure that uses them.',
      body: conventionsForm(ctx, r),
    }),
  );
}

function conventionsForm(ctx, r) {
  const people = (r.chain?.nodes ? [...r.chain.nodes.values()] : []).filter((n) => n && !n.isLeader);
  const costs = r.conventions.successionDailyCosts || {};
  const handovers = r.conventions.successionTestedHandovers || {};
  const holder = h('div', { class: 'stack-tight' });
  const rowFor = (person) => h('div', { class: 'row-gap' },
    h('span', { class: 'muted small', style: 'min-width:140px' }, person.name),
    h('input', {
      class: 'input', type: 'number', min: '0', step: '1', placeholder: 'daily cost',
      value: costs[person.id]?.amount ?? '', 'aria-label': `Daily cost of vacancy for ${person.name}`, id: `cost-${person.id}`,
    }),
    h('input', {
      class: 'input', type: 'text', maxlength: '3', placeholder: 'CCY',
      value: costs[person.id]?.currency ?? '', 'aria-label': `Currency for ${person.name}`, id: `ccy-${person.id}`,
    }),
    h('input', {
      class: 'input', type: 'number', min: '0', step: '1', placeholder: 'tested',
      value: handovers[person.id]?.tested ?? '', 'aria-label': `Handovers run for ${person.name}`, id: `ht-${person.id}`,
    }),
    h('input', {
      class: 'input', type: 'number', min: '0', step: '1', placeholder: 'failed',
      value: handovers[person.id]?.failed ?? '', 'aria-label': `Handovers failed for ${person.name}`, id: `hf-${person.id}`,
    }),
  );
  holder.append(...people.slice(0, 30).map(rowFor));
  return h('div', { class: 'stack-tight' },
    h('p', { class: 'muted small' }, 'Columns: daily cost · currency · handovers run · handovers failed. An amount with no currency is refused, because an amount in no currency cannot be summed with anything.'),
    holder,
    h('button', {
      class: 'btn btn-ghost',
      onClick: () => {
        const costsPatch = {};
        const testedPatch = {};
        for (const person of people.slice(0, 30)) {
          const amount = document.getElementById(`cost-${person.id}`)?.value;
          const currency = document.getElementById(`ccy-${person.id}`)?.value;
          if (amount !== '' && amount !== undefined && Number(amount) >= 0) {
            costsPatch[person.id] = { amount: Number(amount), currency };
          }
          const tested = document.getElementById(`ht-${person.id}`)?.value;
          const failed = document.getElementById(`hf-${person.id}`)?.value;
          if ((tested !== '' && tested !== undefined) || (failed !== '' && failed !== undefined)) {
            testedPatch[person.id] = { tested: Number(tested || 0), failed: Number(failed || 0) };
          }
        }
        const result = ctx.api.setSuccessionConventions({
          ...(Object.keys(costsPatch).length ? { dailyCosts: costsPatch } : {}),
          ...(Object.keys(testedPatch).length ? { testedHandovers: testedPatch } : {}),
        });
        if (result && result.ok) {
          toast('Conventions recorded. Every figure that uses them says so on its own line.', 'good');
          ctx.refresh();
        } else {
          toast((result && result.error) || 'Could not record those conventions.', 'bad');
        }
      },
    }, 'Record declarations'),
  );
}

/* ------------------------------------------------------------ panel four */

function chainPanel(ctx, r) {
  const cert = r.certification;
  const altitudeRows = r.altitudes.map((row) => ({
    altitude: altitudeByRank(row.rank).label,
    rank: row.rank,
    spans: row.spansN,
    people: row.membersN,
    items: row.itemsN,
    certified: row.certifiedN,
    concentrated: row.concentratedN,
    covered: row.coveredN,
    unmeasured: row.unmeasuredN,
    blocked: row.blockedItemsN,
  }));
  const spanRows = cert.perSpan.map((row) => ({
    span: r.view.disclosure.personNames ? row.name : `${altitudeByRank(row.rank).label} · rank ${row.rank}`,
    verdict: row.verdict,
    top: row.topHolderShare,
    excess: row.excessPp,
    tested: row.testedN,
    p: row.pGapPct,
  }));
  return h('div', { class: 'stack' },
    banner({
      tone: cert.pIndependence === null ? 'warn' : (r.counts.certifiedN ? 'bad' : 'info'),
      title: cert.pIndependence === null
        ? 'No bench claim can be quoted'
        : `${cert.pIndependence}% chance of at least one certified gap before review — lower bound ${cert.pLower}%`,
      body: cert.pIndependence === null
        ? cert.refused
        : `${cert.method} ${cert.measuredN} of ${r.counts.spansN} span(s) could be measured at all (${pct(cert.testedShare)}).${r.diffusion.refused ? ` Diffusion: ${r.diffusion.refused}` : ` Diffusion index: ${r.diffusion.share}% of ${r.diffusion.measuredN} measured spans are not covered.`}`,
    }),
    card({
      title: 'Vertical roll-up — the same spans, read at each altitude',
      subtitle: 'Exact sums only. Each person is on exactly one bench, so nothing is counted twice and nothing is lost on the way up.',
      body: table({
        caption: 'Bench coverage by altitude',
        columns: cols([
          { key: 'altitude', label: 'Altitude' },
          { key: 'rank', label: 'Rank', align: 'right' },
          { key: 'spans', label: 'Spans', align: 'right' },
          { key: 'people', label: 'Direct reports', align: 'right' },
          { key: 'items', label: 'Obligations', align: 'right' },
          { key: 'certified', label: 'Certified gaps', align: 'right' },
          { key: 'concentrated', label: 'Concentrated', align: 'right' },
          { key: 'covered', label: 'Covered', align: 'right' },
          { key: 'unmeasured', label: 'Unmeasured', align: 'right' },
          { key: 'blocked', label: 'Blocked items', align: 'right' },
        ]),
        rows: altitudeRows,
        emptyMessage: 'No leadership spans exist, so there is no altitude to roll up.',
      }),
    }),
    card({
      title: 'Per-span gap probability',
      subtitle: 'A span that is already infeasible has a gap now, so its probability is 1. A span inside the cap contributes a floor, because “we have not measured a problem here” is not “there is no problem here”.',
      body: spanRows.length ? table({
        caption: 'Gap probability per measured span',
        columns: cols([
          { key: 'span', label: 'Span' },
          { key: 'verdict', label: 'Verdict', render: (row) => verdictBadge(row.verdict) },
          { key: 'top', label: 'Top holder share', align: 'right', render: (row) => pct(row.top) },
          { key: 'excess', label: 'Over cap', align: 'right', render: (row) => `${row.excess}pp` },
          { key: 'tested', label: 'Handovers tested', align: 'right' },
          { key: 'p', label: 'P(gap)', align: 'right', render: (row) => `${row.p}%` },
        ]),
        rows: spanRows,
      }) : h('p', { class: 'muted small' }, 'No span could be measured. That is the finding, not an absence of one.'),
    }),
  );
}

/* ------------------------------------------------------------ panel five */

function readingsPanel(ctx, r) {
  const readings = (r.readings || []).slice().sort((a, b) => (a.frozenAt < b.frozenAt ? 1 : -1));
  const exposure = ctx.api.successionExposure ? ctx.api.successionExposure({}) : null;
  const exposureSafe = exposure && exposure.ok !== false ? exposure : null;
  const readingRows = readings.map((row) => ({
    id: row.id,
    frozen: formatDate(row.frozenAt.slice(0, 10)),
    review: formatDate(row.reviewOn),
    scope: row.scope === 'span' ? 'span' : 'whole chain',
    p: `${row.pGapPct}%`,
    lower: row.pGapLowerPct === undefined ? '—' : `${row.pGapLowerPct}%`,
    certified: row.counts?.certifiedN ?? 0,
    blocked: row.counts?.blockedItemsN ?? 0,
    graded: row.graded
      ? (row.graded.lapsed ? badge('lapsed', 'neutral') : `${row.graded.observedGap ? 'gap opened' : 'no gap'} · Brier ${row.graded.brier}`)
      : (row.reviewOn <= dayKey(new Date()) ? badge('due', 'warn') : badge('open', 'neutral')),
  }));
  const currencyCards = (exposureSafe?.currencies || []).map((row) => card({
    title: `${row.currency} exposure`,
    subtitle: `${row.holdersN} holder(s) · ${row.itemsN} blocked obligation(s) · ${exposureSafe.reviewDays}-day review window`,
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Daily deprivation', value: row.daily.toLocaleString(undefined, { style: 'currency', currency: row.currency, maximumFractionDigits: 0 }) }),
      stat({ label: 'Expected loss', value: row.expected.toLocaleString(undefined, { style: 'currency', currency: row.currency, maximumFractionDigits: 0 }), hint: 'probability-weighted' }),
      stat({ label: '90% shortfall', value: row.es90.toLocaleString(undefined, { style: 'currency', currency: row.currency, maximumFractionDigits: 0 }), tone: 'warn', hint: 'coherent expected shortfall (upper bound)' }),
    ),
  }));
  return h('div', { class: 'stack' },
    card({
      title: 'Frozen bench claims',
      subtitle: 'A frozen claim is a quote. Grading is once, later, against the exact members it named — including a bad Brier score.',
      actions: [h('button', { class: 'btn btn-ghost btn-tiny', onClick: () => freezeDialog(ctx, r) }, 'Freeze a claim')],
      body: readingRows.length ? table({
        caption: 'Bench reading ledger',
        columns: cols([
          { key: 'frozen', label: 'Frozen' },
          { key: 'review', label: 'Review on' },
          { key: 'scope', label: 'Scope' },
          { key: 'p', label: 'P(gap)', align: 'right' },
          { key: 'lower', label: 'Lower bound', align: 'right' },
          { key: 'certified', label: 'Certified', align: 'right' },
          { key: 'blocked', label: 'Blocked', align: 'right' },
          { key: 'graded', label: 'Outcome' },
        ]),
        rows: readingRows,
        emptyMessage: 'No bench claim has been frozen. The terminal has never been graded, so it has no measured skill — and it says so rather than implying one.',
      }) : h('p', { class: 'muted small' }, 'No bench claim has been frozen. The terminal has never been graded, so it has no measured skill — and it says so rather than implying one.'),
    }),
    exposureSafe && currencyCards.length ? h('div', { class: 'grid-2' }, ...currencyCards) : null,
    exposureSafe && !currencyCards.length ? banner({ tone: 'info', title: 'No money figure is reported', body: exposureSafe.refused }) : null,
    exposureSafe ? card({
      title: 'Unpriced exposure',
      subtitle: exposureSafe.note,
      body: exposureSafe.holders.length ? table({
        caption: 'Deprivation exposure per holder',
        columns: cols([
          { key: 'holder', label: 'Holder', render: (row) => (r.view.disclosure.personNames ? row.holderId : 'a holder in scope') },
          { key: 'blocked', label: 'Blocked', align: 'right' },
          { key: 'share', label: 'Blocked share', align: 'right', render: (row) => `${row.sharePct}%` },
          { key: 'priced', label: 'Priced', render: (row) => (row.priced ? badge(row.currency, 'neutral') : badge('unpriced', 'warn')) },
          { key: 'daily', label: 'Daily', align: 'right', render: (row) => (row.priced ? String(row.daily) : '—') },
          { key: 'expected', label: 'Expected over window', align: 'right', render: (row) => (row.priced ? String(row.expectedLoss) : '—') },
        ]),
        rows: exposureSafe.holders,
      }) : h('p', { class: 'muted small' }, 'No holder with a blocked obligation exists, so there is nothing to price.'),
    }) : null,
  );
}

function freezeDialog(ctx, r, nodeId = null) {
  const cert = r.certification;
  const body = h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      cert.pIndependence === null
        ? 'No bench claim can be frozen: no span in this chain could be measured. A reading that prices nothing would be decoration.'
        : `This will freeze the current bench position: ${cert.pIndependence}% chance of at least one certified gap before the review date (assumption-free lower bound ${cert.pLower}%). The reading stores the exact obligations the min-cut named, so grading measures whether those items actually lost their holder — not whether the organisation feels worse.`),
    h('label', { class: 'field-label', for: 'suc-review-days' }, 'Review in (days)'),
    h('input', { class: 'input', id: 'suc-review-days', type: 'number', min: '14', max: '365', value: String(r.conventions.successionReviewHorizonDays) }),
    nodeId ? h('p', { class: 'muted small' }, 'Scope: this span only.') : h('p', { class: 'muted small' }, 'Scope: the whole chain.'),
  );
  openModal({
    title: 'Freeze a bench claim',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        disabled: cert.pIndependence === null ? true : null,
        onClick: () => {
          const days = Number(document.getElementById('suc-review-days')?.value || r.conventions.successionReviewHorizonDays);
          const result = ctx.api.freezeSuccessionReading({ reviewDays: days, nodeId });
          if (result && result.ok) {
            closeAllModals();
            toast(`Frozen: ${result.record.pGapPct}% bench-gap probability, review ${result.reviewOn}.`, 'good');
            ctx.refresh();
          } else {
            toast((result && result.error) || 'Could not freeze that claim.', 'bad');
          }
        },
      }, 'Freeze'),
    ],
  });
}

/* ------------------------------------------------------------ panel six */

function methodPanel(ctx, r) {
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'The premise, stated so it can be argued with', body: `${SUCCESSION_PREMISE.claim} — What would refute it: ${SUCCESSION_PREMISE.wouldRefute}` }),
    card({
      title: 'The seven readings, their named methods and their refusals',
      subtitle: 'A metric whose refusal is not written down is a metric that will eventually be shown with no basis. Each row here is implemented exactly as described.',
      body: table({
        caption: 'Metrics, methods and refusals',
        columns: cols([
          { key: 'label', label: 'Reading' },
          { key: 'method', label: 'Named method' },
          { key: 'question', label: 'The question it answers' },
          { key: 'refusal', label: 'When it refuses' },
        ]),
        rows: r.metrics,
      }),
    }),
    card({
      title: 'Where eligibility comes from',
      subtitle: 'Every edge in the flow test is a record. Nothing here is a list of names someone imagined.',
      body: table({
        caption: 'Eligibility sources',
        columns: cols([
          { key: 'label', label: 'Source' },
          { key: 'detail', label: 'The record that earns the edge' },
          { key: 'strength', label: 'Strength', align: 'right' },
        ]),
        rows: r.eligibilitySources,
      }),
    }),
    card({
      title: 'What this surface will never do',
      body: h('ul', { class: 'list' },
        h('li', null, 'Rate, rank, score or name a person as the subject of a judgement. The subject is a span, an obligation or a frozen reading.'),
        h('li', null, 'Infer a departure from behaviour, tenure or sentiment. The flow test assumes one holder is absent; it does not predict who or when.'),
        h('li', null, 'Read confidential conflicts, anonymous pulse responses or message text. Those are forbidden endpoints and never become a bench input.'),
        h('li', null, 'Move a reporting line, re-title anyone, or reassign work on the leader’s behalf. Structural decisions belong to the Command Chain, and this module defers to it.'),
        h('li', null, 'Report a rate, probability or money figure below its floor. A refusal is printed; it is never rendered as zero.'),
        h('li', null, 'Sum across currencies, infer a salary or apply a pay band. Every money figure is what the leader declared, in the currency they declared.'),
        h('li', null, 'Count a deleted record as evidence that a claim was right or wrong. Deletion is unmeasurable, and it is reported as such.'),
      ),
    }),
    card({
      title: 'Conventions currently in force',
      body: h('div', { class: 'stack-tight' },
        kv('Horizon read forward', `${r.conventions.successionHorizonDays} days`),
        kv('Concentration cap', `${r.conventions.successionConcentrationCapPct}% of dated work behind one holder`),
        kv('Member floor', `${r.conventions.successionMemberFloor} direct reports`),
        kv('Item floor', `${r.conventions.successionItemFloor} dated obligations`),
        kv('Overload rule', `a survivor may carry up to ${r.conventions.successionHeadroomFactor}× the span median`),
        kv('Handover floor', `${r.conventions.successionTestedFloor} recorded handovers before the measured rate replaces the assumption-free one`),
        kv('Review horizon', `${r.conventions.successionReviewHorizonDays} days from freeze`),
        kv('Automatic propagation', r.conventions.successionAutoPropagate ? 'on — an explicit scan always runs regardless' : 'paused — an explicit scan still runs'),
      ),
    }),
  );
}

/* ------------------------------------------------------------- the view */

export function renderSuccession(ctx) {
  const query = ctx.query;
  const panel = resolvePanel(query);
  let r;
  try {
    r = ctx.api.successionRead({ nodeId: query?.get?.('span') || null });
  } catch (error) {
    return h('div', { class: 'stack' }, banner({
      tone: 'bad',
      title: 'The bench could not be read',
      body: `The engine raised: ${error && error.message ? error.message : 'unknown error'}. No figure is shown rather than a partial one that would look like a reading.`,
    }));
  }
  const panelViews = {
    bench: () => benchPanel(ctx, r),
    reabsorb: () => reabsorbPanel(ctx, r),
    blanket: () => blanketPanel(ctx, r),
    chain: () => chainPanel(ctx, r),
    readings: () => readingsPanel(ctx, r),
    method: () => methodPanel(ctx, r),
  };
  return h('div', { class: 'view view-succession' },
    header(ctx, r),
    tabs({
      items: PANELS,
      active: panel,
      ariaLabel: 'Succession sections',
      onSelect: (key) => navigate(ctx, key),
    }),
    panelViews[panel](),
  );
}
