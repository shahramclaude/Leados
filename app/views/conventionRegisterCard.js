/**
 * app/views/conventionRegisterCard.js — "Conventions in force" on
 * Settings & data (ADR-0180).
 *
 * The card prints the register `buildConventionRegister` derives from the
 * settings in memory, and nothing else: every figure on it is a field of that
 * one object (the `data-crg` attributes name the field, so a test can compare
 * the page with the record exactly). Rendering stores nothing.
 */

import { h, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { card, badge, banner, table } from '../ui/components.js';
import { buildConventionRegister, conventionRegisterBriefText } from '../core/domain/conventionRegister.js';
import { CONVENTION_REGISTER_LIMITS } from '../core/domain/conventionRegisterRegistry.js';

const code = (text) => h('code', null, text);

function figure(label, field, value) {
  return h('div', null, h('dt', null, label), h('dd', { 'data-crg': field }, String(value)));
}

/** One reload claim: the word "Holds" / "Fails" is printed, never only a colour. */
function claimLine(field, holds, holdsText, failsText) {
  return h(
    'p',
    { 'data-crg': field, 'data-state': holds ? 'holds' : 'fails' },
    badge(holds ? 'Holds' : 'Fails', holds ? 'good' : 'bad'),
    ' ',
    holds ? holdsText : failsText,
  );
}

function openBrief(register) {
  const form = buildForm([
    {
      name: 'brief',
      label: 'Conventions in force — text brief',
      type: 'textarea',
      rows: 16,
      value: conventionRegisterBriefText(register),
    },
  ]);
  openModal({
    title: 'Conventions in force — text brief',
    description: 'Select all and copy. Text values and the inside of structured values are not printed.',
    body: form.node,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
    size: 'lg',
  });
}

export function renderConventionRegisterCard(ctx) {
  const register = buildConventionRegister(ctx.state);
  const t = register.totals;
  const c = register.claims;
  const cap = CONVENTION_REGISTER_LIMITS.tableRows;
  const shown = register.differing.slice(0, cap);
  const notShown = register.differing.length - shown.length;
  // What the load itself said about the stored settings (the receipt in
  // `normalizeState`). After a save the stored file no longer holds the key, so
  // this notice clears itself at the next load.
  const loadWarnings = (ctx.warnings || []).map(String).filter((warning) => warning.startsWith('Settings:'));

  const limits = [
    ...register.switchDefects.declaredButUnread.map((key) => h('li', null, code(key), ' is declared and stored but read by no rule — switching it changes nothing.')),
    ...register.switchDefects.readButNotCarried.map((key) => h('li', null, code(key), ' is read by a rule but cannot be stored in this version — that rule cannot be paused.')),
    ...register.fallbackDisagreements.map((row) => h('li', null, code(row.key), ` has two defaults: a new workspace starts at ${row.newWorkspaceText}; a stored file missing the key loads ${row.missingKeyText}.`)),
  ];

  const body = h(
    'div',
    { class: 'stack', 'data-crg': 'register', 'data-engine': register.engineVersion },
    loadWarnings.length
      ? banner({
          tone: 'caution',
          title: 'At the last load',
          body: h('ul', { class: 'compact-list', 'data-crg': 'loadWarnings' }, ...loadWarnings.map((warning) => h('li', { class: 'small' }, warning))),
        })
      : null,
    h(
      'dl',
      { class: 'settings-list' },
      figure('Conventions carried by this version', 'carriedN', t.carriedN),
      figure('Differ from a new workspace’s default', 'differsN', t.differsN),
      figure('At the default', 'atDefaultN', t.atDefaultN),
      figure('Automation switches', 'switchesN', t.switchesN),
      figure('Automation switches on', 'switchesOnN', t.switchesOnN),
      figure('Automation switches off', 'switchesOffN', t.switchesOffN),
    ),
    h(
      'div',
      { class: 'stack-tight' },
      h('h3', { class: 'sub-title' }, 'Automations switched off'),
      register.switchesOff.length
        ? h('ul', { 'data-crg': 'switchesOff' }, ...register.switchesOff.map((key) => h('li', null, code(key))))
        : h('p', { class: 'muted', 'data-crg': 'switchesOff' }, 'None — every automation switch is on.'),
      // ADR-0182: this register can say WHICH switches are off. It can say
      // nothing about who silenced them or until when, and it should not look
      // as though it has. The authority beside each silence lives in its own
      // register, and this is the door to it.
      h('p', { class: 'muted small', 'data-crg': 'pausePermits' },
        'Which switch is off, and who authorised it, are different questions. ',
        h('a', { href: '#/settings?panel=pause-permits' }, 'Pause permits'),
        ' records the authoriser, the reason, the end date and the compensating measure beside every silenced control — and prints the ones that have none.'),
      register.switchesIndeterminate.length
        ? h('p', { class: 'text-bad', 'data-crg': 'switchesIndeterminate' }, `Not readable as on or off: ${register.switchesIndeterminate.join(', ')}.`)
        : null,
    ),
    h(
      'div',
      { class: 'stack-tight' },
      h('h3', { class: 'sub-title' }, 'Would a reload keep what is declared?'),
      claimLine(
        'nothingDropped',
        c.nothingDropped,
        'Every convention in memory is one a reload carries.',
        `${t.notCarriedN} convention${t.notCarriedN === 1 ? '' : 's'} in memory would NOT survive a reload: ${register.notCarried.join(', ')}.`,
      ),
      claimLine(
        'nothingRepaired',
        c.nothingRepaired,
        'Every carried value in memory is the value a reload restores.',
        `${t.repairedN} value${t.repairedN === 1 ? '' : 's'} would be CHANGED by a reload: ${register.repaired.map((row) => `${row.key} (${row.inMemoryText} → ${row.reloadText})`).join(', ')}.`,
      ),
      h(
        'p',
        { class: 'muted', 'data-crg': 'memory' },
        `In memory: ${t.inMemoryN} settings keys — ${t.presentN} carried, ${t.retiredN} retired, ${t.notCarriedN} not carried. `
          + `${t.absentN} carried convention${t.absentN === 1 ? ' is' : 's are'} not yet written and read at the default; `
          + `${t.filledFromEmptyN} empty value${t.filledFromEmptyN === 1 ? ' is' : 's are'} read at the default.`,
      ),
    ),
    h(
      'div',
      { class: 'stack-tight' },
      h('h3', { class: 'sub-title' }, 'Differs from the default'),
      shown.length
        ? table({
            caption: 'Conventions that differ from a new workspace’s default',
            columns: [
              { key: 'key', label: 'Convention', render: (row) => code(row.key) },
              { key: 'kindLabel', label: 'Kind' },
              { key: 'defaultText', label: 'Default' },
              { key: 'inForceText', label: 'In force' },
            ],
            rows: shown.map((row) => ({ ...row, attrs: { 'data-crg-row': row.key } })),
          })
        : h('p', { class: 'muted', 'data-crg': 'noDiffering' }, 'Every convention is at the value a new workspace starts with.'),
      notShown > 0
        ? h('p', { class: 'muted', 'data-crg': 'notShown' }, `${notShown} more not shown here — the text brief lists every one.`)
        : null,
    ),
    limits.length
      ? h(
          'div',
          { class: 'stack-tight' },
          h('h3', { class: 'sub-title' }, 'Known limits of this register'),
          h('ul', { 'data-crg': 'limits' }, ...limits),
        )
      : null,
    h(
      'details',
      { class: 'quality-details' },
      h('summary', null, 'How this is computed — and what it does not claim'),
      h('dl', { class: 'settings-list' }, ...register.method.map((row) => h('div', null, h('dt', null, row.label), h('dd', null, row.value)))),
    ),
  );

  return card({
    title: 'Conventions in force',
    subtitle: 'Every declared number and automation switch this workspace runs under, read through the same loader a reload uses.',
    actions: [
      h('a', { class: 'btn btn-small', href: '#/settings?panel=pause-permits' }, 'Pause permits'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openBrief(register) }, 'Text brief'),
    ],
    body,
    attrs: { 'data-card': 'convention-register' },
  });
}
