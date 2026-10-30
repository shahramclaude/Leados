/**
 * app/views/autopilot.js — Autopilot Studio (Schema v58, RULE-AP-01).
 *
 * The screen is organised around one promise: nothing here runs until a person
 * has seen exactly what it would do. Every agreement is a draft until it is
 * rehearsed against the current records, and rehearsal is the approval — the
 * activation token binds the definition, the workspace revision and the
 * preview, so anything that changes afterwards invalidates the approval.
 *
 *   Agreements  every operating agreement, the selected one's definition in
 *               plain language, its budgets, its history and its actions
 *   Runs        the bounded execution ledger: what fired, on which record,
 *               and what it created, reused or refused
 *   Method      the registry, the limits and the exact guarantees
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, table, tabs, timeline } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  AUTOPILOT_ACTION_BY_ID,
  AUTOPILOT_LIMITS,
  AUTOPILOT_OPERATORS,
  AUTOPILOT_SOURCE_BY_ID,
} from '../core/domain/autopilotRegistry.js';
import { autopilotBrief, autopilotCoverage } from '../core/domain/autopilot.js';
import {
  openAutopilotPolicyDialog,
  openAutopilotRehearseDialog,
  openAutopilotPauseDialog,
  confirmAutopilotRetire,
  confirmAutopilotDelete,
} from '../ui/autopilot-modals.js';

const STATUS_TONE = { draft: 'neutral', active: 'good', paused: 'warn', retired: 'neutral' };
const RUN_TONE = { applied: 'good', reused: 'neutral', blocked: 'bad' };

function statusBadge(policy) {
  return badge(`${policy.status} · v${policy.version}`, STATUS_TONE[policy.status] || 'neutral',
    policy.status === 'paused' && policy.pausedReason ? policy.pausedReason : `Version ${policy.version}`);
}

function conditionSentence(policy, condition) {
  const source = AUTOPILOT_SOURCE_BY_ID[policy.sourceType];
  const field = source?.fields.find((f) => f.id === condition.field);
  const op = (AUTOPILOT_OPERATORS[field?.type] || []).find((o) => o.id === condition.op);
  const value = typeof condition.value === 'boolean' ? (condition.value ? 'yes' : 'no') : String(condition.value);
  return `${field?.label || condition.field} ${op?.label || condition.op} ${value}`;
}

function actionSentence(action) {
  const spec = AUTOPILOT_ACTION_BY_ID[action.type];
  const owner = action.ownerMode === 'fixed' ? 'a named person' : action.ownerMode === 'source' ? 'the source owner' : null;
  return owner ? `${spec?.label || action.type} (owner: ${owner})` : (spec?.label || action.type);
}

function sourceRoute(sourceType, sourceId) {
  const routes = { case: 'cases', decision: 'decisions', delegation: 'delegations', goal: 'goals' };
  const base = routes[sourceType];
  return base ? `#/${base}` : '#/today';
}

export function renderAutopilot(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const requestedPanel = ctx.query?.get?.('panel') || ctx.query?.get?.('tab') || 'agreements';
  const panels = ['agreements', 'runs', 'method'];
  const panel = panels.includes(requestedPanel) ? requestedPanel : 'agreements';
  const policies = Array.isArray(ctx.state.autopilotPolicies) ? ctx.state.autopilotPolicies : [];
  const runs = Array.isArray(ctx.state.autopilotRuns) ? ctx.state.autopilotRuns : [];
  const selectedId = ctx.query?.get?.('policy') || '';
  const selected = policies.find((row) => row.id === selectedId) || policies[0] || null;

  const active = policies.filter((p) => p.status === 'active');
  const blocked = runs.filter((r) => r.status === 'blocked');
  const created = runs.flatMap((r) => r.actions || []).filter((a) => a.status === 'created').length;

  const header = pageHeader({
    eyebrow: 'Automation · Schema v58',
    title: 'Autopilot Studio',
    subtitle: 'Standing operating agreements between you and the workspace: when a recorded event matches a declared condition, the agreement creates accountable work and drafts — never silent decisions. Nothing runs until you have rehearsed it against your current records.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAutopilotPolicyDialog(ctx, {}) }, 'New agreement'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const ok = downloadText({ filename: 'leados-operating-agreements.txt', text: autopilotBrief(ctx.state, now), mime: 'text/plain' });
          if (!ok) toast('The download was refused by this browser. The agreements panel shows the same summary.', 'bad');
        },
      }, 'Download brief'),
    ],
    meta: policies.length
      ? badge(`${active.length} active · ${runs.length} runs retained`, active.length ? 'good' : 'neutral')
      : badge('no agreements yet', 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Active agreements',
      value: `${active.length} / ${AUTOPILOT_LIMITS.active}`,
      hint: 'each one was rehearsed before activation',
      tone: active.length >= AUTOPILOT_LIMITS.active ? 'warn' : '',
    }),
    stat({
      label: 'Matched events',
      value: String(runs.length),
      hint: runs.length ? `${created} record(s) created across all runs` : 'nothing has fired yet',
    }),
    stat({
      label: 'Blocked runs',
      value: String(blocked.length),
      hint: blocked.length ? 'a blocked run pauses its agreement until you decide' : 'no refusals on record',
      tone: blocked.length ? 'bad' : '',
    }),
    stat({
      label: 'Safety ceiling',
      value: `${AUTOPILOT_LIMITS.newRecordsPerEvent} records / event`,
      hint: 'an oversized batch applies nothing, not a prefix',
    }));

  const tabsRow = tabs({
    items: [
      { key: 'agreements', label: 'Agreements', count: policies.length },
      { key: 'runs', label: 'Runs', count: runs.length },
      { key: 'method', label: 'Method' },
    ],
    active: panel,
    onSelect: (key) => ctx.navigate(`#/autopilot?panel=${key}${selected ? `&policy=${encodeURIComponent(selected.id)}` : ''}`),
    ariaLabel: 'Autopilot Studio sections',
  });

  let body;
  if (panel === 'runs') body = renderRunsPanel(ctx, policies, runs);
  else if (panel === 'method') body = renderMethodPanel();
  else body = renderAgreementsPanel(ctx, policies, runs, selected);

  return h('div', { class: 'page' }, header, null, stats, tabsRow, body);
}

/* ------------------------------------------------------- agreements panel */

function policyActions(ctx, policy) {
  const buttons = [];
  if (policy.status !== 'retired') {
    buttons.push(h('button', {
      class: 'btn btn-small btn-primary', type: 'button',
      onClick: () => openAutopilotRehearseDialog(ctx, policy),
    }, policy.status === 'active' ? 'Re-rehearse' : 'Rehearse & activate'));
  }
  if (policy.status === 'active') {
    buttons.push(h('button', {
      class: 'btn btn-small btn-ghost', type: 'button',
      onClick: () => openAutopilotPauseDialog(ctx, policy),
    }, 'Pause'));
  }
  if (policy.status === 'draft' || policy.status === 'paused') {
    buttons.push(h('button', {
      class: 'btn btn-small btn-ghost', type: 'button',
      onClick: () => openAutopilotPolicyDialog(ctx, { policy }),
    }, 'Edit'));
  }
  if (policy.status !== 'retired') {
    buttons.push(h('button', {
      class: 'btn btn-small btn-ghost', type: 'button',
      onClick: () => confirmAutopilotRetire(ctx, policy),
    }, 'Retire'));
  }
  if (policy.status !== 'active' && policy.runCount === 0) {
    buttons.push(h('button', {
      class: 'btn btn-small btn-ghost', type: 'button',
      onClick: () => confirmAutopilotDelete(ctx, policy),
    }, 'Delete'));
  }
  return buttons;
}

function renderAgreementsPanel(ctx, policies, runs, selected) {
  const nodes = [];
  if (!policies.length) {
    nodes.push(emptyState({
      title: 'No operating agreements yet',
      body: 'An agreement says: when this event happens and these recorded facts match, create this accountable work. Start from a template — a production delay, a completed delegation or an off-track goal — then rehearse it against your real records before anything can run.',
      icon: '⛭',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAutopilotPolicyDialog(ctx, {}) }, 'Declare the first agreement'),
    }));
    nodes.push(banner({
      tone: 'info',
      title: 'What an agreement can never do',
      body: 'No message is ever sent. No rating, pay, hiring, promotion or termination decision is automated. A missing owner blocks the run instead of being guessed, and a coached person receives a prompt for their next 1:1 — not a verdict.',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  const rows = policies.map((policy) => ({ ...policy, className: selected && policy.id === selected.id ? 'is-selected' : '' }));
  nodes.push(card({
    title: 'Agreements',
    subtitle: `${policies.length} of ${AUTOPILOT_LIMITS.policies} · editing an active agreement returns it to draft, because the rehearsal it was approved under no longer describes it`,
    body: table({
      caption: 'Operating agreements with their source event, conditions, actions, status and execution counts',
      columns: [
        {
          label: 'Agreement', render: (row) => h('div', { class: 'stack-xs' },
            h('a', { class: 'link-button', href: `#/autopilot?panel=agreements&policy=${encodeURIComponent(row.id)}` }, h('strong', null, row.name)),
            h('span', { class: 'muted small' }, `When ${row.trigger} · ${row.conditions.length} condition(s), all must match`)),
        },
        { label: 'Then', render: (row) => h('span', { class: 'small' }, row.actions.map(actionSentence).join(' · ')) },
        { label: 'Status', render: (row) => statusBadge(row) },
        { label: 'Runs', className: 'num', render: (row) => `${row.activationRunCount}/${row.maxRuns} this activation · ${row.runCount} lifetime` },
      ],
      rows,
    }),
  }));

  if (!selected) return h('div', { class: 'stack' }, ...nodes);

  if (selected.status === 'paused' && selected.pausedReason) {
    nodes.push(banner({ tone: 'warn', title: `“${selected.name}” is paused`, body: selected.pausedReason }));
  }
  const source = AUTOPILOT_SOURCE_BY_ID[selected.sourceType];
  const policyRuns = runs.filter((r) => r.policyId === selected.id).slice(-8).reverse();
  nodes.push(card({
    title: selected.name,
    subtitle: selected.purpose || 'No purpose recorded.',
    actions: policyActions(ctx, selected),
    body: h('div', { class: 'stack' },
      h('p', { class: 'small' }, h('strong', null, 'Source: '), `${source?.label || selected.sourceType} · event ${selected.trigger}`),
      selected.conditions.length
        ? h('div', null,
          h('h3', { class: 'small-heading' }, 'All of these must match'),
          h('ul', { class: 'evidence-list' }, ...selected.conditions.map((c) => h('li', null, conditionSentence(selected, c)))))
        : h('p', { class: 'muted small' }, 'No conditions: every event of this kind matches. Prefer at least one condition so the agreement stays narrow.'),
      h('div', null,
        h('h3', { class: 'small-heading' }, 'Then create'),
        h('ul', { class: 'evidence-list' }, ...selected.actions.map((a) => h('li', null, actionSentence(a))))),
      h('p', { class: 'muted small' }, `Budget: ${selected.activationRunCount} of ${selected.maxRuns} matched events used this activation · ${selected.runCount} lifetime · activated ${selected.activatedAt ? selected.activatedAt.slice(0, 10) : 'never'}`),
      policyRuns.length
        ? h('div', null,
          h('h3', { class: 'small-heading' }, 'Recent runs'),
          h('ul', { class: 'evidence-list' }, ...policyRuns.map((run) => h('li', null,
            `${run.at.slice(0, 10)} · ${run.status} · ${(run.actions || []).filter((a) => a.status === 'created').length} created, ${(run.actions || []).filter((a) => a.status === 'reused').length} reused, ${(run.actions || []).filter((a) => a.status === 'blocked').length} blocked · `,
            h('a', { class: 'link-button', href: sourceRoute(run.sourceType, run.sourceId) }, 'open source')))))
        : h('p', { class: 'muted small' }, 'No runs retained for this agreement yet.'),
      h('div', null,
        h('h3', { class: 'small-heading' }, 'History'),
        timeline((selected.history || []).slice(-8).reverse().map((entry) => ({
          date: entry.at.slice(0, 10), kind: entry.type, title: entry.summary,
        })), { empty: 'No history yet.' }))),
  }));
  return h('div', { class: 'stack' }, ...nodes);
}

/* ------------------------------------------------------------ runs panel */

function renderRunsPanel(ctx, policies, runs) {
  const byId = new Map(policies.map((p) => [p.id, p]));
  if (!runs.length) {
    return h('div', { class: 'stack' }, emptyState({
      title: 'No runs retained',
      body: 'Every matched event is recorded here with what it created, reused or refused. Activate a rehearsed agreement and this ledger becomes the audit trail a sceptical reviewer would ask for.',
      icon: '≣',
    }));
  }
  const rows = [...runs].reverse().map((run) => ({ ...run, policyName: byId.get(run.policyId)?.name || 'Deleted agreement' }));
  return h('div', { class: 'stack' },
    banner({
      tone: 'info', title: 'A bounded ledger, not a memory',
      body: `The newest ${AUTOPILOT_LIMITS.runs} runs are retained; older ones age out. Counts below are retained history, not a causal estimate of value or time saved.`,
    }),
    card({
      title: 'Execution ledger',
      subtitle: 'Newest first · each row carries a durable idempotency key, so a retried event reuses rather than duplicates',
      body: table({
        caption: 'Retained operating-agreement runs with their outcome and per-action results',
        columns: [
          { label: 'When', render: (row) => row.at.slice(0, 16).replace('T', ' ') },
          {
            label: 'Agreement', render: (row) => h('a', { class: 'link-button', href: `#/autopilot?panel=agreements&policy=${encodeURIComponent(row.policyId)}` }, `${row.policyName} · v${row.policyVersion}`),
          },
          {
            label: 'Source', render: (row) => h('a', { class: 'link-button', href: sourceRoute(row.sourceType, row.sourceId) }, `${AUTOPILOT_SOURCE_BY_ID[row.sourceType]?.label || row.sourceType} · ${row.trigger}`),
          },
          { label: 'Outcome', render: (row) => badge(row.status, RUN_TONE[row.status] || 'neutral') },
          {
            label: 'Actions', render: (row) => h('span', { class: 'small' }, (row.actions || []).map((a) => {
              const label = AUTOPILOT_ACTION_BY_ID[a.type]?.label || a.type;
              return `${label}: ${a.status}${a.reason ? ` — ${a.reason}` : ''}`;
            }).join(' · ') || 'idempotent re-fire: nothing new to do'),
          },
        ],
        rows,
      }),
    }));
}

/* ---------------------------------------------------------- method panel */

function renderMethodPanel() {
  const coverage = autopilotCoverage();
  return h('div', { class: 'stack' },
    card({
      title: 'How an agreement works',
      body: h('div', { class: 'stack' },
        h('ol', { class: 'numbered' },
          h('li', null, h('strong', null, 'Declare. '), 'Pick a source event, up to six conditions over facts the registry exposes, and up to five actions. No code, no free-text rules, no guessing.'),
          h('li', null, h('strong', null, 'Rehearse. '), 'The executor runs the agreement against your current records on a disposable copy. Nothing is written. The preview shows every match, every record it would create, every owner it would load and every blocked action.'),
          h('li', null, h('strong', null, 'Activate. '), 'Activation binds your approval to a digest of the definition, the workspace revision and the rehearsal. Any later change — to the agreement or the workspace — invalidates the approval.'),
          h('li', null, h('strong', null, 'Execute. '), 'Matched events run inside the same transaction as the event that triggered them, with typed provenance links, durable idempotency keys and a bounded execution budget. A blocked action pauses the agreement instead of half-applying it.')),
        h('p', { class: 'muted small' }, 'Frameworks: management by exception (only matches interrupt you); Deming plan-do-check-act (rehearsal is the check); RAND assumption-based planning (assumptions are declared with signposts); DACI (decisions name a driver and a review); Mendelow audience selection (briefs go to key and opposing stakeholders); explicit authority delegation (every task names its authority level).')),
    }),
    card({
      title: 'Registry coverage',
      subtitle: 'New sources plug into the same compiler, rehearsal, executor and ledger — this table is generated from the registry, not written by hand',
      body: table({
        caption: 'Registered autopilot sources with their event and fact counts',
        columns: [
          { label: 'Source', render: (row) => row.source },
          { label: 'Events', className: 'num', render: (row) => String(row.events) },
          { label: 'Facts', className: 'num', render: (row) => String(row.facts) },
        ],
        rows: coverage,
      }),
    }),
    card({
      title: 'Limits and guarantees',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, `At most ${AUTOPILOT_LIMITS.active} active agreements and ${AUTOPILOT_LIMITS.policies} total; each activation carries its own 1–100 event budget plus a ${AUTOPILOT_LIMITS.lifetimeRuns}-event lifetime ceiling.`),
        h('li', null, `One event can create at most ${AUTOPILOT_LIMITS.newRecordsPerEvent} records across all agreements; an oversized batch applies nothing rather than an arbitrary prefix.`),
        h('li', null, `Rehearsal covers up to ${AUTOPILOT_LIMITS.rehearsalRecords} source records; above that, activation is refused until the population is narrowed.`),
        h('li', null, 'An agreement never sends a message, never selects a decision option, never writes a rating, and never touches pay, hiring or termination.'),
        h('li', null, 'A record created by an agreement cannot trigger another agreement. Built-in module rules still see those records and apply their normal documented effects.'),
        h('li', null, 'Records with propagation paused are invisible to every agreement, and rehearsal is current-state only — never a historical backtest or a forecast.')),
    }));
}
