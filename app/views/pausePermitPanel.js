/**
 * app/views/pausePermitPanel.js — `#/settings?panel=pause-permits`, the
 * Automation Pause Permit Register (ADR-0182, Schema v145, RULE-PMP-01).
 *
 * The control-environment question this screen answers — and the one a line
 * manager cannot answer for themselves: "a control is switched off. Who
 * authorised that, why, until when, and what stands in for it while it is off?"
 *
 * Every figure printed here is a field of the report `buildPausePermits`
 * returned. The screen computes nothing: no state, no day count, no reach claim.
 * A rendering stores nothing.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 *  - "Permitted" for a switch that is on. An on switch is not silenced.
 *  - "Expired" for a switch no permit ever named. That is `unpermitted`.
 *  - A grace verdict for a pause whose start the record cannot date.
 *  - The reason or the compensating measure of a permit to a seat below the
 *    full-access operator view: below it the register says whether one is
 *    recorded, never quotes it.
 *  - A reach claim beyond what the source supports: it names the rule module
 *    that goes quiet and stops there.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, kv, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildPausePermits,
  pausePermitBriefText,
  pausePermitCsvRows,
  PAUSE_PERMIT_OWNER_STATES,
} from '../core/domain/pausePermits.js';
import { defaultPermitWindow } from '../core/domain/pausePermitActions.js';
import {
  PAUSE_PERMIT_ADR,
  PAUSE_PERMIT_CSV_COLUMNS,
  PAUSE_PERMIT_LIMITS,
  PAUSE_PERMIT_METHOD,
  PAUSE_PERMIT_REACH_RULES,
  PAUSE_PERMIT_RULE_ID,
  PAUSE_PERMIT_SETTING_KEYS,
  PAUSE_PERMIT_SETTING_LABELS,
} from '../core/domain/pausePermitRegistry.js';

const BAD = new Set(['unpermitted', 'expired', 'off-roster']);
const WARN = new Set(['unknown']);
const tone = (key) => (BAD.has(key) ? 'bad' : WARN.has(key) ? 'warn' : key === 'permitted' || key === 'on' ? 'good' : 'neutral');
const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function act(ctx, result, ok) {
  if (!result?.ok) { toast(result?.error || 'The action was refused.', 'bad'); return; }
  toast(ok, 'good');
  refresh(ctx);
}

function stateBadge(row) {
  const text = row.stateLabel || row.stateKey;
  return badge(text, tone(row.stateKey));
}

/* --------------------------------------------------------------- the board */

function boardPanel(report) {
  const b = report.board;
  const off = b.switchesDeclaredN - b.states.on;
  return card({
    title: 'The control environment, as it actually stands',
    subtitle: 'Every declared automatic switch on the reading day, split by the authority behind the silence — not by the switch value alone.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Automatic switches declared', value: num(b.switchesDeclaredN), hint: 'derived from the settings in force' }),
        stat({ label: 'Switched off', value: num(off), tone: off ? 'warn' : '', hint: 'of which the reach figure below matters most' }),
        stat({ label: 'Off with no permit', value: num(b.states.unpermitted), tone: b.states.unpermitted ? 'bad' : 'good', hint: 'anonymous silence' }),
        stat({ label: 'Off past a permit', value: num(b.states.expired), tone: b.states.expired ? 'bad' : 'good', hint: 'the pause outlived its authority' }),
        stat({ label: 'Off under a live permit', value: num(b.states.permitted), hint: 'an authoriser, a reason and an end date' }),
        stat({ label: 'Known to reach a second line', value: `${num(b.reachOffN)} of ${num(b.reachSwitchesN)}`, tone: b.reachUnpermittedN ? 'bad' : b.reachOffN ? 'warn' : 'good', hint: 'silenced, of the switches that read the reporting graph' })),
      h('p', { class: 'muted small', 'data-pmp': 'statesClaim' },
        `States reconcile: ${b.statesReconcile ? 'yes' : 'NO — the discrepancy is printed, not smoothed'} (${b.states.on} on + ${b.states.permitted} permitted + ${b.states.expired} expired + ${b.states.unpermitted} unpermitted = ${b.states.on + b.states.permitted + b.states.expired + b.states.unpermitted} of ${b.switchesDeclaredN}).`),
      b.reachUnpermittedN
        ? banner({
          tone: 'bad',
          title: `${b.reachUnpermittedN} silenced control(s) that reach a second reporting line have no permit`,
          body: 'These rules read the reporting graph. While they are silent, work that would have reached a shared contributor’s OTHER manager was not issued on an ordinary write. Nothing was deleted and no manager was left uninformed by this register — but the pull is off, and nobody is named as having decided that.',
        })
        : null,
      b.states.expired
        ? banner({
          tone: 'bad',
          title: `${b.states.expired} pause(s) outlived the permit that authorised them`,
          body: 'The authority ran out and the switch stayed off. This is not the same failure as an anonymous pause and is not counted as one: here somebody DID authorise it, and the end date they set passed.',
        })
        : null,
      b.permitsOverlappedN
        ? banner({
          tone: 'warn',
          title: `${b.permitsOverlappedN} switch(es) carry overlapping permits`,
          body: 'Two permits were in force on the same day for one control, so more than one seat can be named as its authoriser. The app refuses to create this; an imported file can. Both are printed and neither is silently preferred.',
        })
        : null),
  });
}

/* -------------------------------------------------------------- the switches */

function switchesPanel(report) {
  const rows = report.switches.map((row) => ({
    key: row.key,
    state: stateBadge(row),
    reach: row.reachesMatrix
      ? h('span', { class: 'small' }, badge('reaches a second line', 'warn', `Silencing this stops ${row.reachRule} on an ordinary write.`))
      : h('span', { class: 'muted small' }, '—'),
    rule: row.reachRule || '—',
    authoriser: row.permit ? (row.permit.authoriserName || 'not recorded') : '—',
    reason: row.permit ? (row.permit.reason || 'recorded; not printed at this detail level') : '—',
    window: row.permit ? `${row.permit.from} → ${row.permit.to} (${row.permit.daysLeft} day(s) left)` : '—',
    offDays: row.offDays === null ? (row.on ? '—' : 'start not on the record') : String(row.offDays),
    permitN: row.permitN,
  }));
  const body = rows.length
    ? table({
      columns: [
        { key: 'key', label: 'Switch' },
        { key: 'state', label: 'State' },
        { key: 'reach', label: 'Reach' },
        { key: 'rule', label: 'Rule it silences' },
        { key: 'authoriser', label: 'Authoriser' },
        { key: 'reason', label: 'Reason on the record' },
        { key: 'window', label: 'Permit window' },
        { key: 'offDays', label: 'Days off (dated)' },
        { key: 'permitN', label: 'Permits ever' },
      ],
      rows,
      caption: `Declared automatic switches — ${rows.length} shown of ${report.board.switchesDeclaredN}`,
      emptyMessage: 'This seat reads counts only; switch keys are withheld.',
    })
    : emptyState({ title: 'No switch keys at this detail level', body: report.detail.reason });

  return card({
    title: 'Switches and the authority behind each silence',
    subtitle: report.detail.withheld
      ? `Read at the ${report.detail.level} level. ${report.detail.reason}`
      : 'A switch that is on is not silenced and claims nothing. A switch that is off is permitted only while a permit naming it is in force — first and last day inclusive.',
    body: h('div', { class: 'stack' },
      body,
      report.switchesUnlistedN
        ? h('p', { class: 'muted small' }, `${report.switchesUnlistedN} further switch(es) are not printed on this screen; every count above covers all ${report.board.switchesDeclaredN}.`)
        : null,
      h('p', { class: 'muted small' },
        'Days off is dated from the latest surviving permit’s first day. The record does NOT hold the day a switch was flipped: the event log that would is capped and evicted, which is the defect this register exists to name. Where no permit survives, the start reads “not on the record” and no grace verdict is claimed.'),
    ),
  });
}

/* --------------------------------------------------------- unpermitted list */

function unpermittedPanel(report) {
  const rows = report.offSwitches.filter((r) => r.stateKey !== 'permitted');
  if (!rows.length) return null;
  return card({
    title: `Silences with no live authority — ${rows.length}`,
    subtitle: 'Each row is a control that is off while no permit in force names it. The register does not flip it back on: a switch moved automatically would be exactly the kind of unowned decision this ledger exists to prevent.',
    body: table({
      columns: [
        { key: 'key', label: 'Switch' },
        { key: 'state', label: 'State' },
        { key: 'reach', label: 'Reaches a second line' },
        { key: 'offDays', label: 'Days off' },
        { key: 'grace', label: 'Past the declared grace' },
        { key: 'last', label: 'Last permit' },
        { key: 'action', label: '' },
      ],
      rows: rows.map((row) => ({
        key: row.key,
        state: stateBadge(row),
        reach: row.reachesMatrix ? `yes — ${row.reachRule}` : 'no',
        offDays: row.offDays === null ? 'not on the record' : String(row.offDays),
        grace: row.pastGrace === null
          ? h('span', { class: 'muted small' }, 'not provable')
          : badge(row.pastGrace ? 'past the declared grace' : 'inside the grace', row.pastGrace ? 'bad' : 'good'),
        last: row.lastPermit
          ? `${row.lastPermit.to}${row.lastPermit.revoked ? ` (revoked ${row.lastPermit.revokedOn})` : ''}`
          : 'never',
        action: report.actor.canPermit
          ? h('button', {
            class: 'btn btn-small', type: 'button',
            onClick: () => openPermitDialog(report, row),
          }, 'Authorise or end it')
          : h('span', { class: 'muted small' }, report.actor.permitRefusal || ''),
      })),
      caption: 'Silenced controls with no permit in force',
      emptyMessage: 'Every silenced control has a live permit.',
    }),
  });
}

/* --------------------------------------------------------------- the permits */

function permitsPanel(report) {
  const rows = report.permits.map((p) => ({
    key: p.key,
    state: badge(p.state, p.state === 'live' ? 'good' : p.state === 'revoked' ? 'neutral' : p.state === 'pending' ? 'info' : 'bad'),
    authoriser: p.authoriserName || 'not recorded',
    window: `${p.from} → ${p.to}`,
    days: num(p.days),
    scope: p.scope,
    reason: p.reason || 'recorded; not printed at this detail level',
    mitigation: p.mitigation || 'recorded; not printed at this detail level',
    reach: p.reachRule || '—',
    revoked: p.revoked ? `${p.revokedOn || ''}${p.revokedById ? '' : ' · operator'}` : '—',
    action: p.state === 'live' && report.actor.canPermit
      ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => revoke(ctx0, p) }, 'Revoke & bring back up')
      : null,
  }));
  return card({
    title: `Permits on the record — ${report.permits.length}`,
    subtitle: 'Append-only. A permit is never edited: it is revoked, with a day, and the switch comes back up in the same commit unless another live permit still names it.',
    body: table({
      columns: [
        { key: 'key', label: 'Switch' },
        { key: 'state', label: 'State' },
        { key: 'authoriser', label: 'Authoriser' },
        { key: 'window', label: 'First → last day' },
        { key: 'days', label: 'Days' },
        { key: 'scope', label: 'Scope' },
        { key: 'reason', label: 'Reason' },
        { key: 'mitigation', label: 'Compensating measure' },
        { key: 'reach', label: 'Rule it silences' },
        { key: 'revoked', label: 'Revoked' },
        { key: 'action', label: '' },
      ],
      rows,
      caption: 'Dated permits authorising the silence of one automatic control each',
      emptyMessage: 'No permit has ever been granted in this workspace. Every paused control therefore reads as an anonymous silence.',
    }),
  });
}

/** Module-level, so the row action can reach the live context. Set at render. */
let ctx0 = null;
function revoke(ctx, permit) {
  const form = buildForm([
    { name: 'reason', label: 'Why is the authority being withdrawn? (optional)', type: 'textarea', rows: 3 },
    { type: 'static', label: 'What revoking does', value: h('p', { class: 'muted small' }, `Withdraws permit ${permit.permitId} and brings ${permit.key} back up in the SAME atomic commit, unless another live permit still names it. The permit is not deleted: the revocation is dated and stays on the record.`) },
  ]);
  openModal({
    title: `Revoke the permit for ${permit.key}?`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.pausePermitRevoke(permit.permitId, form.getValues().reason || '');
          closeAllModals();
          act(ctx, result, `${permit.key} is back up. The revocation is on the record.`);
        },
      }, 'Revoke and bring it back up'),
    ],
    size: 'md',
  });
}

/* ------------------------------------------------------------- permit dialog */

function openPermitDialog(report, row) {
  const ctx = ctx0;
  if (!ctx) return;
  const win = defaultPermitWindow(ctx.state?.settings, report.today);
  const form = buildForm([
    { type: 'static', label: 'Switch', value: h('code', null, row.key) },
    {
      type: 'static',
      label: 'What goes quiet',
      value: h('p', { class: 'muted small' }, row.reachesMatrix
        ? `${row.reachRule} reads the reporting graph. While this is off, work that would have reached a shared contributor’s second line is not issued on an ordinary write.`
        : 'This rule does not read the reporting graph, so silencing it reaches no second line through the matrix. It still stops the rule on an ordinary write.'),
    },
    { name: 'reason', label: 'Reason this control has to be off', type: 'textarea', rows: 3, required: true, help: `At least ${PAUSE_PERMIT_LIMITS.reasonMinChars} characters. A reader six months from now has to be able to act on it.` },
    { name: 'mitigation', label: 'Compensating measure while it is off', type: 'textarea', rows: 3, required: true, help: `At least ${PAUSE_PERMIT_LIMITS.mitigationMinChars} characters. A bypassed control carries what stands in for it, or it is an unmonitored gap.` },
    { name: 'from', label: 'First day', type: 'date', value: win.from, required: true },
    { name: 'to', label: 'Last day (inclusive)', type: 'date', value: win.to, required: true },
    { name: 'counterpartId', label: 'Counterpart manager to name (optional)', type: 'text', help: 'Recorded, never enforced. Leave blank rather than guessing.' },
  ]);
  openModal({
    title: `Authorise the pause of ${row.key}`,
    description: 'One permit, one authoriser, one control. The permit and the switch are written in the same atomic commit.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.updateSettings({ [row.key]: false }, {
            key: row.key,
            reason: values.reason,
            mitigation: values.mitigation,
            from: values.from,
            to: values.to,
            counterpartId: values.counterpartId || null,
            scope: 'workspace',
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          closeAllModals();
          toast(`Permitted to ${values.to}. The switch is off and the authority is on the record.`, 'good');
          refresh(ctx);
        },
      }, 'Grant the permit and pause it'),
    ],
    size: 'lg',
  });
}

/* ----------------------------------------------------------------- the brief */

function briefPanel(report) {
  const rows = pausePermitCsvRows(report);
  const downloadCsv = () => {
    downloadText(serializeCsv(rows, PAUSE_PERMIT_CSV_COLUMNS), `leados-automation-pause-permits-${report.generatedOn}.csv`, 'text/csv');
  };
  return card({
    title: 'The brief (identity-free)',
    subtitle: 'The paragraph that goes upward. It names no switch, no authoriser and no person.',
    actions: [
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => downloadText(pausePermitBriefText(report), `leados-pause-permits-${report.generatedOn}.txt`, 'text/plain') }, 'Download brief'),
      h('button', { class: 'btn btn-small', type: 'button', onClick: downloadCsv }, 'Download CSV (aggregate-only)'),
    ],
    body: h('pre', { class: 'brief', 'data-pmp': 'brief', style: 'white-space:pre-wrap' }, pausePermitBriefText(report)),
  });
}

/* -------------------------------------------------------------- the method */

function methodPanel(report) {
  return card({
    title: 'What the register declares, and what it refuses',
    subtitle: `${PAUSE_PERMIT_ADR} · ${PAUSE_PERMIT_RULE_ID}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack-sm' },
        kv('Reading day', report.today),
        kv('Conventions', `default window ${report.defaultDays} day(s) · grace ${report.escalateAfterDays} day(s) · ask window ${report.askDueDays} day(s)`),
        kv('Who may authorise', report.authoriser.unique
          ? `${report.authoriser.seatName || 'one seat'}${report.authoriser.isLeaderOnly ? ' (the workspace leader)' : ''}`
          : report.authoriser.reason)),
      h('h4', {}, 'The method, stated'),
      h('ol', { class: 'compact-list' }, ...PAUSE_PERMIT_METHOD.map((line) => h('li', { class: 'small' }, line))),
      h('h4', {}, 'What "reaches a second line" means here'),
      h('p', { class: 'muted small' },
        'A switch is on that list when a post-commit rule module that reads the reporting graph reads it. The test is pinned to the source by a suite that re-derives the list from the code and fails the build when it drifts, so the claim cannot quietly go stale.'),
      h('ul', { class: 'compact-list' }, ...Object.entries(PAUSE_PERMIT_REACH_RULES).map(([key, rule]) => h('li', { class: 'small' }, h('code', null, key), ' → ', h('code', null, rule)))),
      h('h4', {}, 'Conventions in force'),
      h('div', { class: 'grid grid-2' }, ...Object.entries(report.conventions).map(([name, value]) => {
        const key = PAUSE_PERMIT_SETTING_KEYS[name];
        return h('p', { 'data-pmp': `conv-${name}`, class: 'small' }, h('strong', null, PAUSE_PERMIT_SETTING_LABELS[name] || name), ': ', String(value), key ? h('code', { class: 'muted small' }, ` (${key})`) : null);
      })),
    ),
  });
}

/* -------------------------------------------------------------------- page */

export function renderPausePermitPanel(ctx) {
  ctx0 = ctx;
  const state = ctx?.state || {};
  const now = ctx?.now || new Date();
  const report = buildPausePermits(state, { now, settings: state.settings || null });

  if (report.seat?.readOnly) {
    return banner({ tone: 'warn', title: 'The operating seat is unresolved', body: 'Declare a seat before reading the pause-permit register; an unresolved seat reads no control environment.' });
  }

  return h('div', { class: 'stack', 'data-pmp': 'panel', 'data-engine': report.engineVersion },
    h('p', { class: 'lede' },
      'Eighty-six automatic controls run in this workspace and nine of them read the reporting graph — so silencing one means work that would have reached somebody’s second manager was never issued. Until now a pause was a bare yes/no with no authoriser, no reason and no end date, and the only trace of who silenced it was evicted from a capped log. This register puts an authority beside every silence, and prints the ones that have none.'),
    boardPanel(report),
    unpermittedPanel(report),
    switchesPanel(report),
    permitsPanel(report),
    briefPanel(report),
    methodPanel(report),
    report.inertNote ? emptyState({ title: 'Nothing is silenced', body: report.inertNote }) : null,
  );
}
