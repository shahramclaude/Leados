/** Consequence Lab — zero-write two-hop adjacency and empirically-priced wait. */

import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { consequenceReport, consequenceBrief } from '../core/domain/consequence.js';

const PANELS = [
  { key: 'overview', label: 'Executive read' },
  { key: 'map', label: 'Ripple map' },
  { key: 'delay', label: 'Delay futures' },
  { key: 'readings', label: 'Frozen & graded' },
  { key: 'method', label: 'Method & refusals' },
];
const money = (value, currency) => value === null || value === undefined || !Number.isFinite(value)
  ? 'unpriced' : `${currency} ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pct = (value) => value === null || value === undefined ? 'withheld' : `${Number(value).toFixed(1)}%`;

function route(ctx, panel, decisionId = null, readingId = null) {
  const query = new URLSearchParams({ panel });
  const decision = decisionId || ctx.query.get('decision');
  if (decision) query.set('decision', decision);
  if (readingId) query.set('reading', readingId);
  return `#/consequences?${query.toString()}`;
}
function linkTo(node) {
  return node?.route
    ? h('a', { href: node.route }, node.title || node.type || 'Open source')
    : (node?.title || node?.type || 'Missing source');
}
function issueText(focused) {
  const { fragile, shortfalls, coupled } = focused.footprint;
  if (fragile.length || shortfalls.length || coupled.length) {
    return `${fragile.length} watch/breached premise(s) · ${shortfalls.length} continuity shortfall(s) · ${coupled.length} other open decision(s) within two recorded hops. These are things to inspect, not effects predicted to occur.`;
  }
  return 'No watch/breached premises, continuity shortfalls or other open decisions are visible within two recorded hops. An empty graph is not evidence that no effects exist.';
}

function freezeDialog(ctx, focused, weeks) {
  const scenario = focused.horizons.find((s) => s.weeks === weeks);
  if (!scenario?.area.available) {
    toast(scenario?.reason || 'This horizon has no supportable forecast.', 'bad');
    return;
  }
  const modal = openModal({
    title: `Freeze the +${weeks}-week future?`,
    description: `This locks the ${pct(scenario.area.probabilityPct)} still-open probability today. The ${scenario.area.atRisk} comparable open item(s) at risk and ${scenario.area.exits} recorded exits support the curve. After ${weeks} week(s) the recorded decision date will grade this once.`,
    body: h('div', { class: 'stack' },
      h('p', null, 'The typed ripple map will link to the original call and its first-order context. A fragile premise opens owned verification; a materially priced cluster may open one coordination decision. The rule never chooses an option, rates a person or sends a message.'),
      h('p', { class: 'muted small' }, `Root carrying cost: ${money(scenario.expectedCost, scenario.price?.currency)} expected under the class curve, ${money(scenario.fullWaitCeiling, scenario.price?.currency)} if it remains open throughout. Neither is a promise about what deciding will save.`)),
    footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const result = ctx.api.freezeConsequenceReading(focused.decision.id, weeks);
      if (!result?.ok) { toast(result?.error || 'Could not freeze the reading.', 'bad'); return; }
      modal.close();
      toast(result.warning
        ? `Frozen in this tab but NOT SAVED: ${result.warning} Export a backup before leaving.`
        : 'Frozen prospectively. Context links and owned work have been written in the same transaction.',
      result.warning ? 'bad' : 'good');
      ctx.navigate(route(ctx, 'readings', focused.decision.id, result.id));
    } }, 'Freeze and propagate')],
  });
}
function gradeDialog(ctx, reading) {
  const modal = openModal({
    title: 'Grade the frozen forecast?',
    description: `Frozen ${reading.frozenAt?.slice(0, 10)} for ${reading.reviewOn}: predicted ${pct(reading.predictedStillOpenPct)} still open. This cannot be undone.`,
    body: h('p', { class: 'muted small' }, 'The score is Brier (p − observed)². The observed outcome is read from the original decision’s dated decidedOn field; a missing date on an already-chosen option is a refusal, not a guess.'),
    footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const result = ctx.api.gradeConsequenceReading(reading.id);
      if (!result?.ok) { toast(result?.error || 'Could not grade the forecast.', 'bad'); return; }
      modal.close();
      toast(result.warning
        ? `Graded in this tab but NOT SAVED: ${result.warning} Export a backup before leaving.`
        : `Graded once: ${result.grade.stillOpen ? 'still open' : 'decided'} · Brier ${result.grade.brier}.`,
      result.warning ? 'bad' : 'good');
      ctx.navigate(route(ctx, 'readings', reading.decisionId, reading.id));
    } }, 'Record the grade')],
  });
}

function executivePanel(ctx, report) {
  const focused = report.focused;
  if (!focused) return h('div', { class: 'stack' },
    emptyState({ title: 'No open decision has a dated record',
      body: 'Log a decision in the Decisions module. Its typed connections, price and class survival curve will appear here automatically — no second form to fill.',
      action: h('a', { class: 'btn btn-primary', href: '#/decisions' }, 'Open decisions') }),
    report.readings.length ? h('a', { href: route(ctx, 'readings') }, `Review ${report.readings.length} past reading(s) →`) : null);
  const { row, graph, footprint, selected, decision } = focused;
  const c = selected;
  return h('div', { class: 'stack' },
    h('section', { class: 'csq-hero', 'aria-label': 'Selected decision' },
      h('p', { class: 'csq-overline' }, 'SELECTED DECISION · NO OPTION CHOSEN'),
      h('h2', null, decision.title || 'Open decision'),
      h('p', null, 'Before choosing a date, see the documented neighbours, the price of the wait, and what this model refuses to predict.'),
      h('div', { class: 'csq-hero-grid' },
        h('div', null, h('span', null, 'Root delay price'), h('strong', null, row?.price?.priced ? `${money(row.price.weeklyAmount, row.price.currency)}/week` : 'unpriced'),
          h('small', null, row?.price?.sourceLabel || 'Declare a price or link recorded value')),
        h('div', null, h('span', null, '+2-week future'), h('strong', null, c.area.available ? `${pct(c.area.probabilityPct)} still open` : 'withheld'),
          h('small', null, c.area.available ? `${c.area.atRisk} at risk · ${c.area.exits} dated exits` : c.reason)),
        h('div', null, h('span', null, 'Expected priced wait'), h('strong', null, money(c.expectedCost, c.price?.currency)),
          h('small', null, c.area.available ? 'Area under observed conditional KM curve' : 'Not a zero or a forecast'))),
      h('div', { class: 'csq-hero-actions' },
        h('a', { class: 'btn btn-primary', href: route(ctx, 'delay') }, 'Compare timing futures →'),
        h('a', { class: 'btn btn-ghost', href: route(ctx, 'map') }, 'Trace the ripple map'))),
    h('div', { class: 'stat-row' },
      stat({ label: 'Direct neighbours', value: String(graph.direct.length), hint: 'Recorded first-order links' }),
      stat({ label: 'Second order', value: String(graph.secondOrder.length), hint: 'Two hops, not causality' }),
      stat({ label: 'Fragile premises', value: String(footprint.fragile.length), hint: 'Watch/breach in the assumption ledger', tone: footprint.fragile.length ? 'warn' : '' }),
      stat({ label: 'Coupled calls', value: String(footprint.coupled.length), hint: 'Other open decisions, not necessarily blocked', tone: footprint.coupled.length ? 'warn' : '' })),
    banner({ tone: footprint.fragile.length || footprint.shortfalls.length ? 'caution' : 'info',
      title: 'The uncomfortable second-order question', body: issueText(focused),
      actions: [h('a', { class: 'btn btn-small', href: route(ctx, 'map') }, 'Inspect exact paths')] }),
    card({ title: 'The unmade-decision queue',
      subtitle: 'Ranked by the Cost of Waiting terminal: priced overdue first, then priced open, then unpriced. Select one to explore its exact existing data.',
      body: table({ caption: 'Open decisions to trace in the Consequence Lab',
        columns: [
          { label: 'Decision', render: (r) => h('a', { href: route(ctx, 'overview', r.id) }, r.title || 'Untitled decision') },
          { label: 'Age', render: (r) => `${r.elapsedDays} days${r.overdue ? ' · past class median' : ''}` },
          { label: 'Weekly price', render: (r) => r.price.priced ? money(r.price.weeklyAmount, r.price.currency) : 'unpriced, not zero' },
          { label: 'Source', render: (r) => r.price.sourceLabel },
        ], rows: report.candidates }),
    }));
}

function ripplePanel(ctx, report) {
  const f = report.focused;
  if (!f) return emptyState({ title: 'Select an open decision first', action: h('a', { href: route(ctx, 'overview') }, 'Open the queue') });
  const { graph, footprint } = f;
  const pathText = (n) => n.path.map((p) => `${p.direction === 'outgoing' ? '→' : '←'} ${p.relation} → ${p.type}`).join(' · ');
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'A graph path is a recorded association, not a causal pathway',
      body: 'Two hops show what is connected to this call in the shared operational model. The path does not prove any neighbour waits for, benefits from, or is harmed by the decision. People, confidential conflicts and anonymous pulses are never graph relays.' }),
    graph.truncated ? banner({ tone: 'warn', title: 'Map capped for safety',
      body: `Showing the first 64 reachable operational nodes across at most 2,000 inspected edges. A truncated map cannot claim completeness.` }) : null,
    card({ title: 'First-order · records attached to this decision',
      subtitle: `${graph.direct.length} valid operational neighbours · ${graph.invalidEdges} broken operational edge(s) excluded`,
      body: table({ caption: 'First-order typed operational relationships',
        columns: [
          { label: 'Module', render: (n) => badge(n.type) },
          { label: 'Actual record', render: (n) => linkTo(n) },
          { label: 'Recorded relation', render: (n) => h('span', { class: 'csq-path' }, pathText(n)) },
        ], rows: graph.direct, emptyMessage: 'No typed operational neighbours were recorded for this decision. That does not mean no consequences.' }),
    }),
    card({ title: 'Second-order · one more link away',
      subtitle: 'This layer surfaces shared premises, obligations and dependencies; it does not add their cost to the decision.',
      body: table({ caption: 'Second-order typed operational relationships',
        columns: [
          { label: 'Module', render: (n) => badge(n.type) },
          { label: 'Actual record', render: (n) => linkTo(n) },
          { label: 'Shortest recorded path', render: (n) => h('span', { class: 'csq-path' }, pathText(n)) },
        ], rows: graph.secondOrder, emptyMessage: 'No second-order operational links were recorded.' }),
    }),
    graph.bridges.length ? card({ title: 'Bridge records · where two-hop routes converge',
      subtitle: 'A bridge count is graph topology (how many second-hop nodes this record connects), not leverage or influence over a person.',
      body: table({ caption: 'First-hop operational bridge records and second-hop reach',
        columns: [
          { label: 'Bridge', render: (n) => linkTo(n) },
          { label: 'Type', render: (n) => n.type },
          { label: 'Other records reached', render: (n) => String(n.secondOrder) },
        ], rows: graph.bridges }),
    }) : null,
    card({ title: 'Questions the topology exposes', body: h('div', { class: 'grid grid-2' },
      h('div', { class: 'stack-sm' }, h('h3', null, 'Assumptions'),
        footprint.fragile.length
          ? h('ul', { class: 'csq-list' }, ...footprint.fragile.map((p) => h('li', null,
            h('span', null, linkTo(p)), h('span', { class: 'muted small' }, `${p.reading.status} · ${pct(p.reading.posteriorPct)} · ${p.reading.evidenceCount} observations`))))
          : h('p', { class: 'muted small' }, footprint.premises.length ? 'No linked premise is currently at watch/breach.' : 'No premise is linked; unknown is not safe.')),
      h('div', { class: 'stack-sm' }, h('h3', null, 'Continuity & coupled calls'),
        footprint.shortfalls.length ? h('ul', { class: 'csq-list' }, ...footprint.shortfalls.map((d) => h('li', null,
          linkTo(d), h('span', { class: 'muted small' }, ` · TTR ${d.ttr}d > TTS ${d.tts}d`))))
          : h('p', { class: 'muted small' }, 'No measured TTR > TTS among linked dependencies.'),
        h('p', { class: 'muted small' }, `${footprint.coupled.length} other open decision(s) and ${footprint.stakeholderCount} stakeholder record(s) within the map. No person is scored.`))),
    }));
}

function delayPanel(ctx, report) {
  const f = report.focused;
  if (!f) return emptyState({ title: 'Select an open decision to compare timing futures' });
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'The clock is a decision variable, not a recommendation',
      body: 'If this call is settled today, future waiting on this call is zero by definition — not a promise it can be settled today. +1, +2 and +4 weeks price the expected time still open, using an exact area under the class survival curve. Currencies never mix.' }),
    f.transport?.timing.status === 'undermined' ? banner({ tone: 'caution', title: 'This curve failed its transport check',
      body: `The decision class’s timing axis is undermined: ${f.transport.timing.basis}. The integrated costs below are descriptive arithmetic off a curve whose recent cohort behaves differently — they are not silently adjusted. Freezing is still allowed and stamps this verdict onto the reading, so the grade later knows the curve was already in question.` }) : null,
    f.transport && f.transport.timing.status !== 'undermined' && f.transport.completion.status === 'undermined' ? banner({ tone: 'info', title: 'Completion framing moved; these timing futures did not',
      body: `The decision class’s exit mix shifted (${f.transport.decompVerdict}) while time to any exit held, so these any-exit futures still describe recent work. What no longer transports for this class is the completion side — completion medians and overdue framing on the Delivery survival and Cost of waiting pages.` }) : null,
    card({ title: 'Three futures for one open call', subtitle: 'Area under S(age + t) / S(age), not just the probability it is open on the last day. The endpoint-only calculation is shown as a lower bound.',
      body: table({ caption: 'Timing alternatives, KM probability, integrated carrying cost and full-wait ceiling',
        columns: [
          { label: 'Wait', render: (s) => h('strong', null, `+${s.weeks} week${s.weeks === 1 ? '' : 's'}`) },
          { label: 'Still open at horizon', render: (s) => s.area.available ? `${pct(s.area.probabilityPct)} · n=${s.area.atRisk} at risk` : h('span', { class: 'muted' }, `withheld — ${s.reason}`) },
          { label: 'Expected outstanding time', render: (s) => s.area.available ? `${s.area.expectedWeeks} / ${s.weeks} week(s)` : 'withheld' },
          { label: 'Endpoint lower bound', render: (s) => s.endpointLowerCost === null ? '—' : money(s.endpointLowerCost, s.price.currency) },
          { label: 'Expected root cost', render: (s) => s.expectedCost === null ? 'withheld / unpriced' : h('strong', null, money(s.expectedCost, s.price.currency)) },
          { label: 'Full-wait ceiling', render: (s) => s.fullWaitCeiling === null ? 'unpriced' : money(s.fullWaitCeiling, s.price.currency) },
          { label: 'Prospective record', render: (s) => h('button', {
            type: 'button', class: 'btn btn-small btn-primary', disabled: !s.area.available,
            onClick: () => freezeDialog(ctx, f, s.weeks),
            'aria-label': `Freeze ${s.weeks}-week forecast for selected decision`,
          }, 'Freeze') },
        ], rows: f.horizons }),
    }),
    card({ title: 'Conditional exposure · only IF every related item also waits',
      subtitle: 'This is a structural sensitivity, not an expected consequence. A shared link is not a dependency; prices can overlap, so this must NEVER be added to the root cost.',
      body: table({ caption: 'Full-block conditional ceilings for related priced items by horizon and currency',
        columns: [
          { label: 'Horizon', render: (row) => `+${row.weeks} week(s)` },
          { label: 'Full-block ceilings, per currency', render: (row) => row.related.buckets.length
            ? row.related.buckets.map((b) => `${b.currency} ${money(b.fullWaitCeiling, b.currency)} (${b.items} item(s))`).join(' · ')
            : 'none priced' },
          { label: 'Other unpriced work', render: (row) => `${row.related.unpriced} item(s) — not zero` },
        ], rows: f.horizons }),
    }),
    !f.horizons.some((s) => s.area.available) ? banner({ tone: 'caution', title: 'No freezeable probability yet',
      body: 'These horizons lack enough at-risk decisions, dated exits, or observed tail. The upper-bound price is still a declared/derived cost, but the forecast and grade are withheld. This is an evidence gap, not a zero.' }) : null);
}

function readingsPanel(ctx, report) {
  const focus = ctx.query.get('reading');
  return h('div', { class: 'stack' },
    card({ title: 'Calibration · has the class curve earned your trust?',
      subtitle: 'Brier (1950) on one prospective binary forecast per frozen decision/horizon. Skill compares to this workspace’s realised open-at-horizon base rate; it is withheld below five grades.',
      body: report.calibration.available
        ? h('div', { class: 'stat-row' },
          stat({ label: 'Scored readings', value: String(report.calibration.n), hint: 'Nested horizons on the same decision are not independent' }),
          stat({ label: 'Brier', value: String(report.calibration.brier), hint: 'Lower is better' }),
          stat({ label: 'Base-rate Brier', value: String(report.calibration.baselineBrier), hint: `Observed open rate ${pct(report.calibration.baseRatePct)}` }),
          stat({ label: 'Skill vs base rate', value: report.calibration.skill === null ? 'undefined' : `${Math.round(report.calibration.skill * 100)}%`,
            hint: report.calibration.reason || 'Positive means the frozen predictions beat the local reference rate',
            tone: report.calibration.skill < 0 ? 'bad' : '' }))
        : h('p', { class: 'muted small' }, report.calibration.reason),
    }),
    card({ title: 'Frozen decision futures', subtitle: 'A record freezes one probability and an aggregate graph footprint before the review date; the source decision date grades it once.',
      actions: [h('button', { class: 'btn', type: 'button', onClick: () => {
        const result = ctx.api.scanConsequences();
        toast(result?.warning ? `Scan ran in memory but was NOT SAVED: ${result.warning}`
          : result?.changed ? 'Scan reconciled edges or opened grading work.' : 'Scan complete: no new work.',
        result?.warning ? 'bad' : result?.changed ? 'good' : 'neutral');
        ctx.navigate(route(ctx, 'readings'));
      } }, 'Scan due work')],
      body: report.readings.length
        ? h('div', { class: 'stack' }, ...report.readings.map((r) => card({
          title: `Decision future · +${r.horizonWeeks} week(s) · frozen ${r.frozenAt.slice(0, 10)}`,
          subtitle: `Review ${r.reviewOn} · prediction ${pct(r.predictedStillOpenPct)} still open · ${r.graphSnapshot.direct} direct / ${r.graphSnapshot.secondOrder} second-order records${r.graphSnapshot.transportTiming ? ` · curve transport at freeze: timing ${r.graphSnapshot.transportTiming}, completion ${r.graphSnapshot.transportCompletion || 'not stamped'}` : ''}`,
          className: r.id === focus ? 'csq-focused' : '',
          actions: [badge(r.graded ? 'graded once' : r.reviewOn <= report.today ? 'due now' : 'frozen', r.graded ? 'good' : r.reviewOn <= report.today ? 'warn' : 'neutral'),
            !r.graded ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => gradeDialog(ctx, r) }, 'Grade') : null,
            !r.graded ? h('button', { type: 'button', class: 'btn btn-small btn-quiet', onClick: () => {
              const result = ctx.api.deleteConsequenceReading(r.id);
              toast(result?.warning ? `Removed in memory but NOT SAVED: ${result.warning}`
                : result?.ok ? 'Ungraded reading removed; audit event retained.' : result?.error || 'Delete refused.',
              result?.warning || !result?.ok ? 'bad' : 'neutral');
              if (result?.ok) ctx.navigate(route(ctx, 'readings'));
            } }, 'Delete') : null].filter(Boolean),
          body: h('div', { class: 'stack-sm' },
            h('p', { class: 'small' }, 'Source: ', (ctx.state.decisions || []).some((d) => d.id === r.decisionId)
              ? h('a', { href: `#/decisions?decision=${encodeURIComponent(r.decisionId)}` }, 'Open the original decision')
              : 'Removed from this workspace · frozen grade kept for audit, excluded from calibration'),
            h('div', { class: 'stat-row' },
              stat({ label: 'Frozen P(still open)', value: pct(r.predictedStillOpenPct), hint: `Review date ${r.reviewOn}` }),
              stat({ label: 'Expected root wait', value: money(r.expectedCost, r.price?.currency), hint: 'Area under curve at freeze' }),
              stat({ label: 'Full-wait ceiling', value: money(r.fullWaitCeiling, r.price?.currency), hint: 'Not a forecast' }),
              stat({ label: 'Brier grade', value: r.graded ? String(r.graded.brier) : 'not yet', hint: r.graded ? (r.graded.stillOpen ? 'Still open at horizon' : `Decided ${r.graded.decisionDate}`) : 'A later date must settle it' })),
            r.graphSnapshot.truncated ? h('p', { class: 'text-warn small' }, 'Map was capped; graph completeness was not claimed.') : null),
        }))) : emptyState({ title: 'No decision future has been frozen',
          body: 'Open Delay futures, choose a horizon supported by the class’s recorded exits, and freeze it before the answer is known.',
          action: h('a', { class: 'btn btn-primary', href: route(ctx, 'delay') }, 'Compare timing futures') }),
    }));
}

function methodPanel(ctx, report) {
  const rows = [
    ['Kaplan–Meier product limit (1958)', 'Censored open decisions stay in the risk set. Still-open probability is S(age+h)/S(age), using the class’s own recorded decisions.'],
    ['Restricted mean survival time (RMST)', 'Integrate the conditional stepwise KM curve over 1, 2 or 4 weeks to price expected time outstanding. The endpoint-only price × h × P(open at h) is a LOWER bound, not the expected wait.'],
    ['Reinertsen linear cost of delay (2009)', 'Multiply expected outstanding weeks by the weekly price derived from the root decision’s recorded value or declared for its class. Unpriced remains unpriced. No FX conversion.'],
    ['Bounded graph exploration', 'Two-hop breadth-first walk over valid typed operational edges, at most 64 nodes / 2,000 edges. Person, candidate, private conflict and anonymous pulse records never become graph relays. Relation direction is shown, not reinterpreted as causality.'],
    ['Conditional worst-case sensitivity, not a causal estimate', 'Other linked priced work is summed by currency only as a FULL-BLOCK ceiling IF it all waits. Linkage alone cannot estimate dependency probability, so no “expected domino loss” is invented. Never add this ceiling to the root expected cost.'],
    ['Brier proper scoring (1950)', 'Freeze one probability before the horizon; later use the dated decidedOn field to grade still-open (1) or decided by review (0), once. Compare to base rate only after five outcomes.'],
    ['Transport, decomposed (ADR-0058)', 'The class curve is stability-audited on two axes: timing (calendar-cohort log-rank on time to any exit) and completion (the day-30 exit-mix decomposition, flanked at 14/60 days). A failed timing axis makes these futures descriptive until reviewed; a failed completion axis alone leaves them standing. Frozen readings stamp both axes at freeze. Nothing is recalibrated — the page says which outputs to stop quoting.'],
  ];
  return h('div', { class: 'stack' },
    card({ title: 'The model, in the open', body: table({ caption: 'Consequence Lab methods and what each one actually computes',
      columns: [{ label: 'Method', render: (row) => h('strong', null, row[0]) }, { label: 'Operational definition', render: (row) => row[1] }], rows }) }),
    card({ title: 'Refusals and guardrails', body: h('ul', { class: 'csq-list' },
      h('li', null, `At least ${report.conventions.minExits} dated exits and the Survival terminal’s at-risk floor are required. A horizon past the longest observation cannot be frozen. A missing start cannot produce a probability.`),
      h('li', null, 'A priced ceiling can exist without a supported probability. It is labelled a ceiling, never an expected loss; missing money is unpriced, never zero.'),
      h('li', null, 'A graded reading cannot be deleted or re-graded. A chosen decision without a decidedOn date refuses grading rather than manufacturing a completion day.'),
      h('li', null, 'The first-order map reflects only documented links. Missing and capped edges are reported; no employer/personal outcome, sentiment or protected attribute is modeled.'),
      h('li', null, 'The coordination threshold is a declared convention, not a causal significance test. The automation opens a human decision; it never chooses, changes status, reassigns, or sends a brief.')),
    }),
    card({ title: 'Settings in force', body: h('div', { class: 'stat-row' },
      stat({ label: 'Exit floor', value: String(report.conventions.minExits), hint: 'Dated exits, not raw open decisions' }),
      stat({ label: 'Coordination price', value: `${report.conventions.triageWeekly}/week`, hint: 'Per currency; never pooled' }),
      stat({ label: 'Direct links capped', value: String(report.conventions.maxLinks), hint: 'Source reading → operational records' }),
      stat({ label: 'Auto propagation', value: report.conventions.autoPropagate ? 'on' : 'paused', hint: 'Explicit freeze and scan always run' })),
    }));
}

export function renderConsequences(ctx) {
  const state = ctx.state || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const report = consequenceReport(state, now, state.settings || {}, ctx.query.get('decision'));
  const active = PANELS.find((p) => p.key === ctx.query.get('panel'))?.key || 'overview';
  const body = { map: ripplePanel, delay: delayPanel, readings: readingsPanel, method: methodPanel }[active]?.(ctx, report)
    || executivePanel(ctx, report);
  return h('div', { class: 'stack page' },
    pageHeader({ eyebrow: 'Schema v67 · ADR-0056', title: 'The Consequence Lab',
      subtitle: 'What does an unmade decision touch, what does another two weeks actually cost, and which claims can your records support?',
      actions: [h('button', { type: 'button', class: 'btn', onClick: () => {
        const text = consequenceBrief(report.focused, now);
        const saved = downloadText({ filename: `decision-consequence-${dayKey(now)}.txt`, text, mime: 'text/plain' });
        if (!saved) openModal({ title: 'Copy the consequence brief',
          description: 'This browser prevented a download. Select and copy the text below instead.',
          body: h('textarea', { rows: '16', readOnly: true, value: text, 'aria-label': 'Consequence brief text' }) });
      } }, 'Save board brief')],
      meta: h('p', { class: 'muted small' }, `${report.candidates.length} open decisions · ${report.readings.length} frozen readings · local only · no causal claim`) }),
    tabs({ items: PANELS, active, ariaLabel: 'Consequence Lab panels', onSelect: (panel) => ctx.navigate(route(ctx, panel)) }),
    active !== 'readings' && active !== 'method' && report.candidates.length
      ? h('div', { class: 'csq-selector' },
        h('label', { for: 'csq-focus' }, 'Trace a different decision'),
        h('select', { id: 'csq-focus', value: report.focusId, onChange: (event) => ctx.navigate(route(ctx, active, event.target.value)) },
          ...report.candidates.map((c) => h('option', { value: c.id, selected: c.id === report.focusId }, c.title || c.id))))
      : null,
    body);
}
