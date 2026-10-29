/**
 * app/views/propagation.js — the Propagation Ledger (`#/propagation`).
 *
 * Session 61 / ADR-0026. Every other screen in LeadOS shows what the automation
 * PRODUCED. This one shows what it COST, what it declined, and what it lost.
 *
 * Three tabs, in the order the questions get asked:
 *
 *   Price    What the last write actually did: how many rule invocations were
 *            attempted, how many applied, how many declined, and where the
 *            milliseconds went. Ranked, measured, no adjectives.
 *   Coverage Which event types moved the workspace at all, and if one never
 *            does, that is visible instead of being assumed useful.
 *   Failures The durable receipts (Schema v41). A rule that threw used to lose
 *            its downstream artifacts silently; now the failure is a record
 *            that can be re-run against current state.
 *
 * The honest framing matters more here than anywhere else in the product. A
 * "declined" invocation is not a bug — it is a guard doing its job. But 37
 * declines for 5 applications on one write IS a cost, and the leader is the
 * person paying it, so they get to see it.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { describePropagationContracts } from '../core/domain/propagationContracts.js';
import { buildPropagationLedger } from '../core/domain/propagationLedger.js';
import { LINK_RELATION_LABELS, resolveLinkedEntity } from '../core/domain/cases.js';
import { PROPAGATION_LINEAGE_CAP } from '../core/domain/automationLineage.js';

const TABS = [
  { key: 'price', label: 'Price' },
  { key: 'lineage', label: 'Lineage' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'failures', label: 'Failures' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

function ms(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(1)} ms`;
}

function pct(value) {
  return Number.isFinite(value) ? `${value}%` : '—';
}

/* ------------------------------------------------------------------ tabs */

function priceTab(ledger) {
  if (!ledger.measured) {
    return card({
      title: 'Nothing measured yet in this session',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'muted' }, ledger.reason),
        h('p', { class: 'muted small' },
          'The ledger prices the most recent write, not a hypothetical one. Make any change in LeadOS — log a 1:1, open a case, record a pulse — and this screen fills with the measured cost of the automation that ran.'),
        h('a', { class: 'btn btn-ghost', href: '#/cases' }, 'Open a case to exercise the chain')),
    });
  }

  const t = ledger.totals;
  const top = ledger.costRanked.slice(0, 8);
  const maxMs = top.length ? Math.max(...top.map((r) => r.ms), 1) : 1;

  const costRows = top.map((row) => h('div', { class: 'view-stack', style: 'gap:2px' },
    h('div', null, kv(
      row.rule,
      `${ms(row.ms)} · ${row.calls} call(s) · ${row.applied} applied`,
      row.applied === 0 ? 'warn' : '',
    )),
    progressBar((row.ms / maxMs) * 100, {
      label: `${row.rule} share of rule time`,
      tone: row.applied === 0 ? 'warn' : 'neutral',
    })));

  const wasteBody = ledger.waste.length
    ? h('div', { class: 'view-stack' },
      h('p', { class: 'muted small' },
        `${ledger.waste.length} rule(s) were invoked and did nothing, costing ${ms(t.wasteMs)} — ${pct(t.wastePct)} of measured rule time. A decline is usually a guard working correctly; the cost of running the guard is still real.`),
      ...ledger.waste.slice(0, 6).map((row) => h('div', null, kv(
        row.rule,
        `${ms(row.ms)} across ${row.calls} call(s) · 0 applied`,
        'warn',
      ))))
    : h('p', { class: 'muted' }, 'Every rule that ran either applied or was collapsed as a proven repeat. Nothing was spent on a no-op this write.');

  return h('div', { class: 'view-stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Rule invocations', value: t.pairs, hint: `${t.events} event(s) × the rule chain` }),
      stat({ label: 'Applied', value: t.applied, hint: 'Produced a write or an emission', tone: 'good' }),
      stat({ label: 'Declined', value: t.declined, hint: 'Guard ran, nothing to do', tone: t.declined > t.applied ? 'warn' : '' }),
      stat({
        label: 'Collapsed',
        value: t.collapsed,
        hint: 'Proven-identical re-runs skipped',
        tone: t.collapsed > 0 ? 'good' : '',
      })),
    card({
      title: 'Where the write time went',
      subtitle: `${ledger.rootEvent || 'a write'} · revision ${ledger.revision ?? '—'} · ${ledger.at || 'not timestamped'}`,
      body: h('div', { class: 'view-stack' },
        h('div', null, kv('Sum of rule durations', ms(t.pairMs))),
        h('div', null, kv('Measured rule time spent on declines', `${ms(t.wasteMs)} (${pct(t.wastePct)})`, t.wastePct > 50 ? 'warn' : '')),
        h('div', null, kv('Wall clock for the chain', ms(t.elapsedMs))),
        t.elapsedMs !== null && t.elapsedMs - t.pairMs > 1
          ? h('p', { class: 'muted small' },
            `${ms(t.elapsedMs - t.pairMs)} of the chain was engine overhead (queueing, savepoints, audit logging) rather than rule time. It is reported separately instead of being folded into a rule's share.`)
          : null,
        costRows.length ? h('h3', { class: 'card-subtitle' }, 'Cost by rule') : null,
        ...costRows),
    }),
    card({
      title: 'Spent on nothing',
      subtitle: 'Ranked by measured cost, not by opinion',
      body: wasteBody,
    }));
}

function coverageTab(ledger, contracts) {
  const eventRows = ledger.measured ? ledger.events : [];
  return h('div', { class: 'view-stack' },
    card({
      title: 'Event types that moved the workspace',
      subtitle: 'An event delivered to zero applying rules is cost without effect',
      body: eventRows.length
        ? table({
          caption: 'Event types observed in the last measured write',
          columns: [
            { label: 'Event type', render: (r) => h('code', null, r.event) },
            { label: 'Rule invocations', render: (r) => String(r.pairs) },
            { label: 'Applied', render: (r) => (r.applied ? String(r.applied) : badge('none', 'warn')) },
            { label: 'Cost', render: (r) => ms(r.ms) },
          ],
          rows: eventRows,
        })
        : emptyState({
          title: 'No event types measured yet',
          body: 'The coverage table is built from the last measured write. Make a change and come back.',
        }),
    }),
    card({
      title: 'The rule chain',
      subtitle: `${contracts.total} rules · ${contracts.documented} documented · ${contracts.memoized} collapse-proven · ${contracts.scanning} scan the workspace`,
      body: h('div', { class: 'view-stack' },
        table({
          caption: 'Every post-commit rule, its declared purpose and its engine properties',
          columns: [
            { label: 'Rule', render: (r) => h('div', null,
              h('div', null, h('code', null, r.rule)),
              h('div', { class: 'muted small' }, r.module)) },
            { label: 'Purpose', render: (r) => h('span', { class: 'muted small' }, r.purpose || '—') },
            { label: 'Scans', render: (r) => (r.scansWorkspace ? badge('workspace', 'neutral') : badge('local', 'neutral')) },
            {
              label: 'Decline collapse',
              render: (r) => (r.declineMemoizable
                ? badge('proven', 'good', 'A declined verdict depends only on the workspace version and the event type; a repeat is skipped.')
                : badge('not claimed', 'neutral', 'The engine never skips this rule.')),
            },
          ],
          rows: contracts.rows,
        }),
        h('p', { class: 'muted small' },
          'Collapse is only ever applied to a rule invocation that produced no write, no emission, no audit entry, no warning and no effect list. A rule the engine has not proven that property for is never skipped, however expensive it is.')),
    }));
}

function failuresTab(ctx, ledger) {
  const receipts = ledger.receipts;
  const actionable = receipts.items.filter((r) => r.status === 'open' || r.status === 'retried');

  const rows = receipts.items.map((r) => h('div', { class: 'view-stack', style: 'gap:4px' },
    h('div', { class: 'row-between' },
      h('div', null,
        h('div', null, h('strong', null, r.rule), ' ', badge(r.status, r.status === 'open' ? 'warn' : r.status === 'resolved' ? 'good' : 'neutral')),
        h('div', { class: 'muted small' }, `${r.eventType || 'unknown event'} · ${r.entity || 'workspace'}/${r.entityId || '—'} · ${r.at}`)),
      h('div', { class: 'view-stack', style: 'gap:4px' },
        r.status === 'open' || r.status === 'retried'
          ? h('button', {
            class: 'btn btn-tiny btn-primary',
            type: 'button',
            onClick: () => {
              const res = ctx.api.retryPropagationReceipt(r.id);
              if (!res?.ok) { toast(res?.error || 'That propagation could not be retried.', 'bad'); return; }
              if (res.resolved) toast(`${r.rule} re-ran cleanly against the current workspace.`, 'good');
              else toast(`The rule failed again: ${res.error || 'see the receipt'}. The receipt is kept.`, 'bad');
              ctx.refresh();
            },
          }, 'Retry now')
          : null,
        r.status === 'open' || r.status === 'retried'
          ? h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => {
              const res = ctx.api.dismissPropagationReceipt(r.id);
              if (!res?.ok) { toast(res?.error || 'Could not dismiss that receipt.', 'bad'); return; }
              toast('Receipt dismissed. The failure stays in the ledger history.', 'good');
              ctx.refresh();
            },
          }, 'Dismiss')
          : null)),
    h('p', { class: 'muted small' }, r.error || 'No error text was recorded.'),
    r.attempts.length
      ? h('ul', { class: 'plain-list small' }, ...r.attempts.slice(-4).map((a) => h('li', { class: 'muted' },
        `${a.at} · ${a.outcome} · ${a.detail}`)))
      : null));

  return h('div', { class: 'view-stack' },
    actionable.length
      ? banner({
        tone: 'warn',
        title: `${actionable.length} propagation${actionable.length === 1 ? '' : 's'} did not complete`,
        body: 'Each one is a rule that threw and was rolled back, so the decisions, delegations or goals it would have created are absent. Retrying re-runs only that rule against the workspace as it stands now.',
      })
      : null,
    card({
      title: 'Propagation receipts',
      subtitle: 'Schema v41 · durable, content-free, capped at 50',
      body: rows.length
        ? h('div', { class: 'view-stack' }, ...rows)
        : emptyState({
          title: 'No failed propagations recorded',
          body: 'A rule that throws is rolled back so the workspace stays consistent — and its failure is written here so it is never silently lost. An empty list is the good outcome.',
        }),
    }),
    card({
      title: 'What a receipt holds — and does not',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'muted small' },
          'A receipt stores the event that triggered the failure (type, entity, entity id), the rule name, the error message and a bounded retry history. It never stores record content, so it cannot become a second copy of your workspace outside the export and conflict-privacy boundaries.'),
        h('div', null, kv('Ledger size', `${receipts.total} receipt(s) · ${receipts.open} open · ${receipts.resolved} resolved`))),
    }));
}

function lineageReference(state, type, id, { cleared = false } = {}) {
  if (cleared) return h('span', { class: 'muted small' }, `${type || 'Record'} · cleared with demo data`);
  if (!type) return h('span', { class: 'muted small' }, 'Workspace-level event');
  if (!id) return h('span', { class: 'muted small' }, `${type} record unavailable`);
  const record = resolveLinkedEntity(state, type, id);
  return record
    ? h('a', { class: 'link', href: record.route }, record.title)
    : h('span', { class: 'muted small' }, `${type} record no longer present`);
}

function lineageTab(ctx) {
  const allRows = Array.isArray(ctx.state.propagationLineage) ? ctx.state.propagationLineage : [];
  const rows = [...allRows].reverse();
  const requestedId = ctx.query?.get?.('trace') || ctx.query?.trace || null;
  const selected = rows.find((row) => row.id === requestedId) || rows[0] || null;
  // The row itself is a keyboard-operable button, so render plain text here
  // rather than nesting a record link inside that button. Detailed references
  // below remain navigable in the selected transaction panel.
  const sourceName = (row) => {
    if (!row.rootEvent.entity) return 'Workspace action';
    if (row.rootEvent.cleared) return `${row.rootEvent.entity} · cleared with demo data`;
    const record = resolveLinkedEntity(ctx.state, row.rootEvent.entity, row.rootEvent.entityId);
    return record?.title || `${row.rootEvent.entity} record no longer present`;
  };
  const traceButton = (row) => {
    const targets = row.steps.reduce((sum, step) => sum + step.targets.length, 0);
    const edges = row.steps.reduce((sum, step) => sum + step.links.length, 0);
    const isSelected = row.id === selected?.id;
    return h('button', {
      type: 'button',
      class: `lineage-item${isSelected ? ' is-selected' : ''}`,
      'aria-pressed': isSelected ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/propagation?tab=lineage&trace=${encodeURIComponent(row.id)}`),
    },
    h('span', { class: 'lineage-item-heading' },
      h('strong', null, sourceName(row)),
      h('span', { class: 'muted small' }, `${new Date(row.at).toLocaleString()} · revision ${row.revision ?? '—'}`)),
    h('span', { class: 'muted small' },
      `${row.rootEvent.type} · ${row.steps.length} rule step(s) · ${targets} changed record(s) · ${edges} new typed edge(s)`));
  };

  const detail = selected
    ? card({
      title: `Transaction ${selected.rootEvent.type}`,
      subtitle: `${selected.at} · revision ${selected.revision ?? '—'} · source ${selected.rootEvent.entity || 'workspace'}`,
      body: h('div', { class: 'view-stack', 'data-testid': 'propagation-lineage-detail' },
        ...selected.steps.map((step) => h('article', { class: 'lineage-step' },
          h('div', { class: 'lineage-step-heading' },
            h('div', null,
              h('strong', null, step.rule),
              h('div', { class: 'muted small' }, `${step.event.type} · depth ${step.depth}${step.parentStepId ? ` · follows ${step.parentStepId}` : ''}`)),
            h('div', { class: 'badge-row' },
              ...step.ruleIds.map((ruleId) => badge(ruleId, 'neutral')),
              ...step.changedCollections.slice(0, 5).map((collection) => badge(collection, 'info')))),
          step.event.entity
            ? h('p', { class: 'small muted' }, 'Event record: ', lineageReference(ctx.state, step.event.entity, step.event.entityId, { cleared: step.event.cleared }))
            : null,
          step.targets.length
            ? h('div', null,
              h('h3', { class: 'lineage-subheading' }, 'Changed records'),
              h('ul', { class: 'plain-list small' }, ...step.targets.map((target) => h('li', null,
                badge(target.change, target.change === 'created' ? 'good' : target.change === 'removed' ? 'warn' : 'neutral'),
                ' ', lineageReference(ctx.state, target.type, target.id, { cleared: target.cleared })))))
            : null,
          step.links.length
            ? h('div', null,
              h('h3', { class: 'lineage-subheading' }, 'New typed relationships'),
              h('ul', { class: 'plain-list small' }, ...step.links.map((link) => h('li', null,
                lineageReference(ctx.state, link.sourceType, link.sourceId, { cleared: link.sourceCleared }),
                ` — ${LINK_RELATION_LABELS[link.relation] || link.relation} → `,
                lineageReference(ctx.state, link.targetType, link.targetId, { cleared: link.targetCleared })))))
            : null,
          step.emitted.length
            ? h('p', { class: 'muted small' }, 'Emitted events: ', step.emitted.map((event) => event.type).join(', '))
            : null,
          step.omittedTargets || step.omittedLinks || step.omittedEvents
            ? h('p', { class: 'muted small' }, `Trace cap: ${step.omittedTargets} target(s), ${step.omittedLinks} edge(s), ${step.omittedEvents} event(s) not retained for this step.`)
            : null)),
        selected.truncatedSteps || selected.omittedTargets || selected.omittedLinks || selected.omittedEvents
          ? banner({
            tone: 'info',
            title: 'This transaction reached a trace bound',
            body: `${selected.truncatedSteps} later rule step(s), ${selected.omittedTargets} target(s), ${selected.omittedLinks} relationship(s) and ${selected.omittedEvents} emitted event(s) were omitted to keep the local ledger bounded.`,
          })
          : null),
    })
    : null;

  return h('div', { class: 'view-stack', 'data-testid': 'propagation-lineage-page' },
    card({
      title: 'Successful propagation history',
      subtitle: `${allRows.length} of at most ${PROPAGATION_LINEAGE_CAP} recent transactions · content-free · no backfilled history`,
      body: rows.length
        ? h('div', { class: 'lineage-list' }, ...rows.map(traceButton))
        : emptyState({
          title: 'No successful automation trace yet',
          body: 'The ledger starts with the next rule that actually changes a record or emits a typed event. Older successes are not guessed from audit summaries.',
          action: h('a', { class: 'btn btn-ghost', href: '#/cases' }, 'Open a case to exercise the event spine'),
        }),
    }),
    detail,
    card({
      title: 'What is retained',
      body: h('p', { class: 'muted small' },
        'Each transaction keeps the source event type and typed ID, rule names, changed collection names, changed record IDs, newly added typed edges and emitted event types. It never copies titles, notes, summaries, score inputs or record bodies. Conflicts and pulse responses are excluded; demo references are scrubbed when demo data is cleared. JSON backup preserves this bounded ledger.'),
    }));
}

/* ---------------------------------------------------------------- render */

export function renderPropagation(ctx) {
  const requestedTab = ctx.query?.get?.('tab') || ctx.query?.tab;
  const tab = TAB_KEYS.has(requestedTab) ? requestedTab : 'price';
  const contracts = describePropagationContracts();
  const ledger = buildPropagationLedger({
    metrics: ctx.propagationMetrics || null,
    receipts: ctx.state.propagationReceipts || [],
    contracts,
    now: ctx.now,
  });

  const openReceipts = ledger.receipts.open + ledger.receipts.retried;

  const body = tab === 'price'
    ? priceTab(ledger)
    : tab === 'lineage'
      ? lineageTab(ctx)
      : tab === 'coverage'
        ? coverageTab(ledger, ledger.contracts)
        : failuresTab(ctx, ledger);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Automation integrity',
      title: 'Propagation ledger',
      subtitle: 'What the automation chain changed, what it cost, what it declined, and what it lost.',
      actions: [
        h('a', { class: 'btn btn-ghost', href: '#/assurance' }, 'Rehearse a case change'),
        h('a', { class: 'btn btn-ghost', href: '#/insights' }, 'Signals'),
      ],
      meta: openReceipts
        ? badge(`${openReceipts} unresolved`, 'warn')
        : badge('no unresolved failures', 'good'),
    }),
    tabs({
      items: TABS.map((t) => ({
        ...t,
        count: t.key === 'failures' ? openReceipts || undefined
          : t.key === 'lineage' ? ctx.state.propagationLineage?.length || undefined
            : undefined,
      })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/propagation?tab=${key}`),
      ariaLabel: 'Propagation ledger sections',
    }),
    body);
}
