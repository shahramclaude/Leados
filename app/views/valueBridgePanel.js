/**
 * app/views/valueBridgePanel.js — Enterprise Value Bridge (ADR-0214, Session
 * 287). Sixth panel of `#/finance`.
 *
 * ONE READER, ONE SET OF NUMBERS. Every figure on this screen comes from
 * `buildValueBridge` through the seat-checked `valueBridgeReport` command, and
 * every money cell carries the same whole cents in `data-cents` that the reader
 * returned — so what is displayed can be checked against what was computed cell
 * by cell, which is the only way the Bulletproof Reliability Mandate can be
 * tested rather than believed.
 *
 * NOTHING IS COMPUTED HERE. Not a leg, not a movement, not a percentage. A
 * withheld figure prints a dash with its reason, never a zero; a refused
 * attribution prints both levels and says what it will not divide.
 *
 * DIRECTION IS ALWAYS IN WORDS. Colour is never the only signal: the strip below
 * each bridge encodes MAGNITUDE and says so, and the sign lives in the text.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  BRIDGE_LEGS,
  vbDriftText,
  vbMoneyText,
  vbMovementText,
  vbMultipleText,
} from '../core/domain/valueBridgeMath.js';
import {
  VALUE_BRIDGE_BOUNDS,
  VALUE_BRIDGE_CSV_COLUMNS,
  VALUE_BRIDGE_FLAGS,
  VALUE_BRIDGE_FRAMEWORKS,
  VALUE_BRIDGE_LIMITS,
  VALUE_BRIDGE_METHOD,
  VALUE_BRIDGE_PERIMETERS,
  VALUE_BRIDGE_REFUSALS,
  VALUE_BRIDGE_SETTING_KEYS,
  VALUE_BRIDGE_STATES,
  VALUE_BRIDGE_VIEWS,
} from '../core/domain/valueBridgeRegistry.js';

const L = VALUE_BRIDGE_LIMITS;
const BASE_HREF = '#/finance?panel=value';
const DIAGRAM_URL = './app/assets/value-bridge-attribution.jpg';
const DIAGRAM_SHA = 'recorded in DELIVERY-MANIFEST / the ADR at the session that produced it';

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The value-bridge act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/** A money cell: the printed text, and the same whole cents as data. */
function moneyCell(currency, cents, testid, { movement = false } = {}) {
  const claimed = Number.isSafeInteger(cents);
  return h('span', {
    class: 'num',
    'data-testid': testid,
    'data-cents': claimed ? String(cents) : '',
    ...(claimed ? {} : { title: 'Withheld or not applicable — see the refusal printed with this bridge.' }),
  }, claimed ? (movement ? vbMovementText(currency, cents) : vbMoneyText(currency, cents)) : '—');
}

const yesNo = (value) => (value === null || value === undefined ? '—' : (value ? 'yes' : 'no'));

/* ----------------------------------------------------------------- dialogs */

function recordReading(ctx, candidates) {
  const supersedeOptions = [{ value: '', label: '— a new day —' }, ...candidates.readings.map((row) => ({ value: row.id, label: `${row.day} · ${row.currency} (restate this)` }))];
  const form = buildForm([
    { name: 'day', label: 'Date of the reading', type: 'date', required: true, value: candidates.today, help: 'The day the figure is read FOR — the board pack date, the valuation date. A day after today is refused.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: candidates.currencies[0] || '', placeholder: 'DKK', help: 'One chain, one currency. Two currencies are never pooled and never converted.' },
    { name: 'ebitda', label: 'Reported EBITDA (whole currency units)', type: 'text', required: true, placeholder: '145000000.00', help: 'Two decimals at most, no separators, no exponent. A blank is refused; zero is typed as 0.' },
    { name: 'multiple', label: 'Multiple the market put on it', type: 'text', required: true, placeholder: '8.5', help: 'Up to four decimals and above zero. A multiple of zero is not a valuation and is refused.' },
    { name: 'netDebt', label: 'Net debt (whole currency units)', type: 'text', required: true, placeholder: '320000000.00', help: 'A negative figure is a net cash position and is recorded as its own fact, never floored at zero.' },
    { name: 'perimeter', label: 'How the perimeter stands', type: 'select', required: true, options: VALUE_BRIDGE_PERIMETERS.map((row) => ({ value: row.key, label: row.label })), value: 'organic', help: 'Organic: already like-for-like. Reported: you declare the adjustment below. Unseparated: the register will print the movement and refuse the attribution.' },
    { name: 'perimeterAdjustment', label: 'Perimeter adjustment (only for “reported”)', type: 'text', placeholder: '18000000.00', help: 'The EBITDA inside the reported figure that belongs to a business which entered or left the perimeter. Required for “reported”; an absent adjustment is never read as zero.' },
    { name: 'supersedesId', label: 'Restating an existing reading?', type: 'select', options: supersedeOptions, value: '', help: 'A day carries one live reading per currency. Restating names the reading it replaces, so the restatement is visible instead of silent.' },
    { name: 'basis', label: 'Where these figures come from', type: 'textarea', required: true, wide: true, help: `At least ${L.reasonMin} characters — the board pack, the valuation memo, the signed-off model. A bridge is only as good as the source of its two ends.` },
  ]);
  openModal({
    title: 'Record a valuation reading',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A reading is declared, never scraped', body: 'Nothing here is inferred from a budget, an investment case or an imported feed. EBITDA, the multiple and net debt are typed by an executive seat with their source, and every leg is re-derived on each read.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'vb-reading-save',
        onClick: () => {
          const values = form.getValues();
          finish(ctx, ctx.api.valueBridgeRecordReading(values), 'Reading recorded. Every bridge is re-derived from it.', form);
        },
      }, 'Record reading'),
    ],
  });
}

function claimLeg(ctx, candidates) {
  if (!candidates.claimable.length) {
    toast('This seat holds nobody in its reporting tree or on a declared line, so there is no leg it may attribute.', 'bad');
    return;
  }
  const form = buildForm([
    { name: 'leg', label: 'Which leg', type: 'select', required: true, options: candidates.legs.map((row) => ({ value: row.key, label: row.label })), value: 'operating', help: 'Operating is the only leg that is evidence about operators; perimeter follows a cheque, re-rating follows the market, net debt follows cash.' },
    { name: 'personId', label: 'Who answers for it', type: 'select', required: true, options: candidates.claimable.map((row) => ({ value: row.id, label: `${row.name}${row.via === 'self' ? ' — this seat' : row.via === 'declared-line' ? ' — through a declared line' : ''}` })), value: candidates.claimable[0]?.id || '', help: 'Only people this seat holds. If two lines claim one leg, the register prints CONTESTED and attributes the figure to neither.' },
    { name: 'fromDay', label: 'Period starts', type: 'date', required: true, value: `${candidates.today.slice(0, 7)}-01`, help: 'A claim is scored only against a bridge whose period is exactly this one.' },
    { name: 'toDay', label: 'Period ends', type: 'date', required: true, value: candidates.today },
    { name: 'promised', label: 'What this leg was promised to deliver (value, whole currency units)', type: 'text', required: true, placeholder: '42000000.00', help: 'The value-creation plan figure, in owner-value terms. A promise of zero is typed as 0; a blank is not a promise.' },
    { name: 'basis', label: 'The basis of this promise', type: 'textarea', required: true, wide: true, help: `At least ${L.reasonMin} characters — the value-creation plan, the board paper, the agreed target.` },
  ]);
  openModal({
    title: 'Claim a value leg for a person',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Ownership is declared, never computed', body: 'Nothing is read from the reporting graph to guess an owner. A leg with one claim gets promise-versus-realised; a leg with two claims is printed contested and is never divided.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'vb-claim-save',
        onClick: () => {
          const values = form.getValues();
          finish(ctx, ctx.api.valueBridgeClaimLever(values), 'Leg claimed. It is scored only against a bridge with this exact period.', form);
        },
      }, 'Claim the leg'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const key = VALUE_BRIDGE_SETTING_KEYS.staleDays;
  const [min, max] = VALUE_BRIDGE_BOUNDS.staleDays;
  const form = buildForm([
    { name: key, label: 'Days after a reading’s date at which its bridge prints as stale', type: 'number', required: true, value: String(report.conventions[key]), help: `A whole number from ${min} to ${max}. Outside that range the value is refused, never clamped — a typo must not change what counts as news.` },
  ]);
  openModal({
    title: 'Value-bridge conventions',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A stale bridge is still arithmetic', body: 'Staleness never suppresses a figure. It stops the claim that the figure is news, and it is counted on the Finance badge for the seats that read it.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'vb-conventions-save',
        onClick: () => {
          const raw = form.getValues()[key];
          finish(ctx, ctx.api.valueBridgeSetConventions({ [key]: /^\d+$/.test(String(raw).trim()) ? Number(raw) : NaN }), 'Conventions saved.', form);
        },
      }, 'Save'),
    ],
  });
}

function briefDialog(ctx) {
  const result = ctx.api.valueBridgeBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief could not be read.', 'bad'); return; }
  const body = h('textarea', { class: 'input', rows: 16, readonly: true }, result.text);
  openModal({
    title: 'The bridge in sentences',
    size: 'lg',
    body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, 'Built from the printed cents only. Nothing in it is asserted that the register did not compute.'), body),
    footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { body.focus(); body.select(); } }, 'Select all'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: closeAllModals }, 'Close')],
  });
  body.focus();
}

function downloadCsv(ctx, today) {
  const result = ctx.api.valueBridgeCsvRows();
  if (!result?.ok) { toast(result?.error || 'The export was refused.', 'bad'); return; }
  const text = serializeCsv(VALUE_BRIDGE_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows);
  if (!downloadText({ filename: `leados-value-bridge-${today}.csv`, text, mime: 'text/csv' })) {
    toast('The browser refused the download; the CSV is in the brief.', 'bad');
  }
}

/* ------------------------------------------------------------------- cells */

/** The strip encodes MAGNITUDE only; the sign is in the words beside it. */
function magnitudeStrip(bridge) {
  if (!bridge.printed || bridge.state !== 'attributable') return null;
  const legs = BRIDGE_LEGS.map((leg) => ({ key: leg.key, label: leg.label, cents: bridge.printed[`${leg.key}Cents`] }));
  const total = legs.reduce((acc, leg) => acc + Math.abs(leg.cents || 0), 0);
  if (!total) return null;
  return h('div', { class: 'stack-xs', 'data-testid': `vb-strip-${bridge.key}` },
    h('div', {
      role: 'img',
      'aria-label': `Magnitude of the four legs: ${legs.map((leg) => `${leg.label} ${vbMoneyText(bridge.currency, Math.abs(leg.cents))}`).join(', ')}. Direction is printed in the table.`,
      style: { display: 'flex', height: '10px', width: '100%', 'border-radius': '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
    }, ...legs.map((leg, index) => h('span', {
      style: {
        width: `${(Math.abs(leg.cents) / total) * 100}%`,
        background: ['var(--accent, #6ea8fe)', 'var(--tone-warn, #d0a215)', 'var(--tone-good, #3f9c6b)', 'var(--tone-info, #7c8cf8)'][index],
      },
    }))),
    h('p', { class: 'muted tiny', style: { margin: '0' } }, 'Strip: share of the total magnitude in each leg (operating · perimeter · re-rating · net debt). Direction and sign are in the table below.'),
  );
}

function ownershipCell(currency, record) {
  if (!record) return h('span', { class: 'muted small' }, '—');
  if (record.state === 'contested') {
    return h('div', { class: 'stack-xs', 'data-testid': `vb-owner-contested-${record.leg}` },
      badge('Contested — not divided', 'bad'),
      h('span', { class: 'small' }, record.owners.map((owner) => owner.name).join(' and ')),
      h('span', { class: 'muted tiny' }, record.note));
  }
  if (record.state === 'declared') {
    const owner = record.owners[0];
    return h('div', { class: 'stack-xs', 'data-testid': `vb-owner-declared-${record.leg}` },
      h('span', { class: 'small' }, owner?.name || owner?.id || '—'),
      Number.isSafeInteger(record.promisedCents)
        ? h('span', { class: 'muted tiny' }, `promised ${vbMoneyText(currency, record.promisedCents)}`)
        : null,
      Number.isSafeInteger(record.attainedCents)
        ? h('span', { class: record.attainedCents < 0 ? 'small text-warn' : 'small' },
          record.attainedCents === 0 ? 'Delivered exactly the promise.' : `${record.attainedCents > 0 ? 'Delivered' : 'Short by'} ${vbMoneyText(currency, Math.abs(record.attainedCents))} ${record.attainedCents > 0 ? 'more than promised' : 'against the promise'}.`)
        : null);
  }
  return h('span', { class: 'muted small', 'data-testid': `vb-owner-undeclared-${record.leg}` }, 'Undeclared — no name is put against it.');
}

function legTable(bridge) {
  const attributable = bridge.printed && bridge.state === 'attributable';
  const rows = BRIDGE_LEGS.map((leg) => ({
    key: leg.key,
    label: leg.label,
    cents: attributable ? bridge.printed[`${leg.key}Cents`] : null,
    ownership: bridge.ownership ? bridge.ownership[leg.key] : null,
    says: leg.says,
  }));
  return table({
    caption: `${bridge.currency} ${bridge.fromDay} → ${bridge.toDay}: the four legs in whole cents as printed. A dash is withheld.`,
    columns: [
      { label: 'Leg', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.label), h('span', { class: 'muted tiny' }, row.says)) },
      { label: 'Movement in owner value', render: (row) => moneyCell(bridge.currency, row.cents, `vb-${bridge.key}-${row.key}`, { movement: true }) },
      { label: 'Declared owner', render: (row) => ownershipCell(bridge.currency, row.ownership) },
    ],
    rows,
  });
}

function integrityLine(bridge) {
  if (!bridge.rounding) {
    return h('p', { class: 'muted small' }, bridge.balancesReason || 'Nothing is claimed for this pair.');
  }
  const parts = [
    bridge.balances === true
      ? 'The printed cents re-add: opening equity + the four printed legs = closing equity.'
      : bridge.balances === false
        ? 'THE PRINTED CENTS DO NOT RE-ADD. That is a defect in this register, not in the readings.'
        : 'No additive claim is made for this bridge.',
    `${bridge.rounding.exactN} printed cell(s) are exactly their value, ${bridge.rounding.nearestN} are the nearest cent of an exact rational, ${bridge.rounding.movedN} were moved off the nearest cent to keep the column adding up (largest move ${vbDriftText(bridge.rounding.maxDriftE3)} cent).`,
    bridge.levelClaim === 'independent'
      ? 'The enterprise-value and net-debt levels are independently rounded and are not part of the additive claim.'
      : null,
  ].filter(Boolean);
  return h('div', { class: 'stack-xs', 'data-testid': `vb-integrity-${bridge.key}` },
    ...parts.map((part) => h('p', { class: `tiny ${bridge.balances === false ? 'text-warn' : 'muted'}`, style: { margin: '0' } }, part)));
}

function flagBadges(bridge) {
  const active = VALUE_BRIDGE_FLAGS.filter((flag) => bridge.flags?.[{
    stale: 'stale',
    'multiple-not-meaningful': 'multipleNotMeaningful',
    'net-cash': 'netCash',
    'perimeter-moved': 'perimeterMoved',
  }[flag.key]]);
  return active.map((flag) => badge(flag.label, flag.key === 'stale' ? 'caution' : 'neutral', flag.says));
}

function bridgeCard(bridge) {
  if (!bridge.ok || bridge.state === 'unreadable') {
    return card({
      title: `${bridge.key} · ${bridge.currency} ${bridge.fromDay} → ${bridge.toDay}`,
      attrs: { 'data-testid': `vb-bridge-${bridge.key}` },
      body: h('div', { class: 'stack-sm' },
        banner({ tone: 'bad', title: 'Not printed', body: bridge.balancesReason || bridge.reason || 'This pair could not be read.' }),
        h('p', { class: 'muted small' }, `${bridge.readingAgeDays} day(s) between the closing reading and today. The pair is counted on the Finance badge and nothing is attributed.`)),
    });
  }
  const stateRow = VALUE_BRIDGE_STATES.find((row) => row.key === bridge.state);
  return card({
    title: `${bridge.key} · ${bridge.currency} ${bridge.fromDay} → ${bridge.toDay}`,
    subtitle: `Closing reading ${bridge.readingAgeDays} day(s) before today · ${vbMultipleText(bridge.closing.multipleE4)} on closing EBITDA · opening ${vbMultipleText(bridge.opening.multipleE4)}`,
    attrs: { 'data-testid': `vb-bridge-${bridge.key}` },
    body: h('div', { class: 'stack' },
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        badge(stateRow ? stateRow.label : bridge.state, stateRow?.tone || 'neutral', stateRow?.says || ''),
        ...flagBadges(bridge)),
      h('div', { class: 'stat-row' },
        stat({ label: 'Opening equity value', value: moneyCell(bridge.currency, bridge.printed.openingEquityCents, `vb-${bridge.key}-opening`), hint: 'independently rounded level' }),
        stat({ label: 'Movement', value: moneyCell(bridge.currency, bridge.printed.totalMovementCents, `vb-${bridge.key}-movement`, { movement: true }), hint: bridge.state === 'attributable' ? 'printed closing − printed opening' : 'difference of two independently rounded levels' }),
        stat({ label: 'Closing equity value', value: moneyCell(bridge.currency, bridge.printed.closingEquityCents, `vb-${bridge.key}-closing`), hint: 'independently rounded level' })),
      bridge.state !== 'attributable'
        ? banner({ tone: 'warn', title: 'Attribution refused', body: `${stateRow?.says || ''} ${bridge.balancesReason || ''}`.trim() })
        : null,
      magnitudeStrip(bridge),
      legTable(bridge),
      integrityLine(bridge),
      h('details', { class: 'stack-xs' },
        h('summary', { class: 'small' }, 'Readings behind this bridge'),
        h('ul', { class: 'stack-xs' },
          ...[['Opening', bridge.opening], ['Closing', bridge.closing]].map(([label, reading]) => h('li', { class: 'small' },
            h('strong', null, `${label}: `),
            `${reading.day} · EBITDA ${vbMoneyText(reading.currency, reading.ebitdaCents)} · multiple ${vbMultipleText(reading.multipleE4)} · net debt ${vbMoneyText(reading.currency, reading.netDebtCents)} · `,
            h('span', { class: (reading.perimeter === 'unseparated' ? 'text-warn' : 'muted') }, reading.perimeter === 'organic'
              ? 'organic perimeter'
              : reading.perimeter === 'reported'
                ? `reported, declared adjustment ${vbMoneyText(reading.currency, reading.perimeterAdjCents)}`
                : 'reported, perimeter NOT separated'),
            h('span', { class: 'muted' }, ` — ${reading.basis}`)))),
      ),
    ),
  });
}

function chainCard(chain) {
  return card({
    title: `${chain.key} · ${chain.currency} across the whole chain: ${chain.fromDay} → ${chain.toDay}`,
    subtitle: `${chain.moments} readings · every consecutive bridge is attributed, so the chain is added rather than re-derived from its ends`,
    attrs: { 'data-testid': `vb-chain-${chain.key}` },
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Opening equity value', value: moneyCell(chain.currency, chain.printed.openingEquityCents, `vb-${chain.key}-opening`) }),
        stat({ label: 'Movement', value: moneyCell(chain.currency, chain.printed.totalMovementCents, `vb-${chain.key}-movement`, { movement: true }) }),
        stat({ label: 'Closing equity value', value: moneyCell(chain.currency, chain.printed.closingEquityCents, `vb-${chain.key}-closing`) })),
      table({
        caption: `Chain legs in ${chain.currency}, whole cents as printed.`,
        columns: [
          { label: 'Leg', render: (row) => row.label },
          { label: 'Movement', render: (row) => moneyCell(chain.currency, row.cents, `vb-${chain.key}-${row.key}`, { movement: true }) },
        ],
        rows: BRIDGE_LEGS.map((leg) => ({ key: leg.key, label: leg.label, cents: chain.printed[`${leg.key}Cents`] })),
      }),
      integrityLine(chain)),
  });
}

/* ------------------------------------------------------------------ views */

function summary(report) {
  const t = report.totals;
  return h('div', { class: 'stat-row', 'data-testid': 'vb-summary' },
    stat({ label: 'Readings on file', value: h('span', { 'data-testid': 'vb-count-readings' }, String(t.liveReadingsN)), hint: `${t.withdrawnReadingsN} withdrawn, never deleted` }),
    stat({ label: 'Bridges printed', value: h('span', { 'data-testid': 'vb-count-bridges' }, String(t.bridgesN)), hint: `in ${t.currenciesN} currency chain(s), never pooled` }),
    stat({ label: 'Attributed', value: h('span', { 'data-testid': 'vb-count-attributed' }, String(t.attributableN)), hint: 'four legs printed and re-added' }),
    stat({ label: 'Attribution refused', value: h('span', { 'data-testid': 'vb-count-refused' }, String(t.refusedN + t.unreadableN)), tone: t.refusedN + t.unreadableN ? 'warn' : '', hint: 'perimeter undeclared, or two live readings on a day' }),
    stat({ label: 'Contested legs', value: h('span', { 'data-testid': 'vb-count-contested' }, String(t.contestedLegsN)), tone: t.contestedLegsN ? 'warn' : '', hint: 'two people claim one leg; attributed to neither' }),
    stat({ label: 'Stale bridges', value: h('span', { 'data-testid': 'vb-count-stale' }, String(t.staleN)), tone: t.staleN ? 'warn' : '', hint: `closing reading older than ${report.conventions[VALUE_BRIDGE_SETTING_KEYS.staleDays]} days` }));
}

function refusalsCard() {
  return card({
    title: 'Everything this register refuses',
    body: h('ul', { class: 'stack-sm' }, ...VALUE_BRIDGE_REFUSALS.map((row) => h('li', { class: 'small' }, row.says))),
  });
}

function ownersSection(report) {
  const rows = [];
  for (const bridge of report.bridges) {
    if (!bridge.ok || !bridge.ownership) continue;
    for (const leg of BRIDGE_LEGS) {
      const record = bridge.ownership[leg.key];
      rows.push({
        bridge: `${bridge.currency} ${bridge.fromDay} → ${bridge.toDay}`,
        leg: leg.label,
        state: record.state,
        owners: record.owners.map((owner) => owner.name).join(' and ') || '—',
        promised: record.promisedCents,
        realised: record.realisedCents,
        attained: record.attainedCents,
        currency: bridge.currency,
        note: record.note,
      });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'A contested leg is named, never divided',
      body: h('div', { class: 'prose small' },
        h('p', null, 'In a matrix a functional line and a business line can both legitimately claim the same EBITDA movement. This register stores both claims, prints both names, and computes attainment for neither — an allocation no human agreed to is exactly what the Matrix Leadership Mandate forbids. The seats above both settle it; the register will not.'),
        h('p', { class: 'muted' }, 'A leg nobody claimed prints as undeclared and gets no attainment. A missing promise is not a promise of zero.')),
    }),
    rows.length
      ? table({
        caption: 'Declared ownership of every leg on every printed bridge. Promise and attainment are in whole cents.',
        columns: [
          { label: 'Bridge', render: (row) => row.bridge },
          { label: 'Leg', render: (row) => row.leg },
          { label: 'Ownership', render: (row) => h('div', { class: 'stack-xs' }, badge(row.state, row.state === 'contested' ? 'bad' : 'neutral'), h('span', { class: 'small' }, row.owners)) },
          { label: 'Promised', render: (row) => (Number.isSafeInteger(row.promised) ? vbMoneyText(row.currency, row.promised) : '—') },
          { label: 'Realised (printed)', render: (row) => (Number.isSafeInteger(row.realised) ? vbMovementText(row.currency, row.realised) : '—') },
          { label: 'Attainment', render: (row) => (Number.isSafeInteger(row.attained) ? vbMovementText(row.currency, row.attained) : '—') },
        ],
        rows,
      })
      : emptyState({ title: 'No bridge is printed yet', body: 'Ownership is scored against a printed bridge. Record two readings in one currency and the legs appear here.' }),
    report.claimsWithoutPeriod.length
      ? card({
        title: 'Claims with no matching bridge',
        subtitle: 'Kept and counted; never prorated into a period they do not name',
        body: table({
          caption: 'Live claims whose period equals no printed bridge.',
          columns: [
            { label: 'Person', render: (row) => row.name },
            { label: 'Leg', render: (row) => row.leg },
            { label: 'Period', render: (row) => `${row.fromDay} → ${row.toDay}` },
            { label: 'Promised', render: (row) => vbMoneyText(null, row.promisedCents) },
          ],
          rows: report.claimsWithoutPeriod,
        }),
      })
      : null,
  );
}

function methodSection(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this bridge is for',
      body: h('div', { class: 'prose small' },
        h('p', null, 'Equity value is the owners’ claim on the company: EBITDA at the multiple the market pays for it, less net debt. When it moves, four different things can have moved — and only one of them is evidence about the people running the business.'),
        h('p', null, 'This register reads that claim twice, at two declared dates, and divides the movement into operating, perimeter, re-rating and net debt, in whole cents that provably re-add. It separates what was operated from what was bought, and it refuses the division outright when a reading will not declare its perimeter.')),
    }),
    card({
      title: 'The method, in the register’s own words',
      body: h('ul', { class: 'stack-sm' },
        ...['reading', 'bridge', 'perimeter', 'ownership', 'staleness', 'rounding', 'notSaid'].map((key) => h('li', { class: 'small' }, h('strong', null, `${key}: `), VALUE_BRIDGE_METHOD[key]))),
    }),
    card({
      title: 'Frameworks applied',
      body: h('ul', { class: 'stack-sm' }, ...VALUE_BRIDGE_FRAMEWORKS.map((row) => h('li', { class: 'small' }, h('strong', null, `${row.label} — `), row.says))),
    }),
    card({
      title: 'Conventions',
      actions: report.seat.canGovern ? [h('button', { type: 'button', class: 'btn btn-sm', 'data-testid': 'vb-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Edit')] : [],
      body: h('p', { class: 'small' }, `A closing reading older than ${report.conventions[VALUE_BRIDGE_SETTING_KEYS.staleDays]} day(s) makes its bridge STALE: the arithmetic stands, the claim that it is news does not. Staleness is a printed fact, never folded into the state. Engine ${report.engineVersion}, ${report.adr}.`),
    }),
    card({
      title: 'The attribution, drawn',
      subtitle: 'Generated method illustration — not workspace data',
      body: h('figure', { style: { margin: '0' } },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Illustration of an equity-value bridge: opening equity value, then operating, perimeter, re-rating and net-debt steps, then closing equity value.',
          loading: 'lazy',
          style: { width: '100%', 'max-width': '1100px', height: 'auto', 'border-radius': '12px' },
        }),
        h('figcaption', { class: 'muted tiny' }, 'A generated asset, not workspace data: it shows the shape of the calculation and never a figure from this workspace. Provenance is recorded with the ADR.')),
    }),
    refusalsCard(),
  );
}

/* -------------------------------------------------------------------- page */

export function renderFinanceValueBridgePanel(ctx, { tabs: panelTabs = null } = {}) {
  const result = ctx.api.valueBridgeReport();
  const requested = ctx.query?.get?.('view');
  const view = VALUE_BRIDGE_VIEWS.some((row) => row.key === requested) ? requested : 'bridge';

  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Finance & the owners’ claim', title: 'Enterprise value bridge', subtitle: 'What moved the owners’ claim on the company, and whose leg it was.' }),
      panelTabs,
      card({ body: banner({ tone: 'bad', title: 'The bridge could not be read', body: result?.error || 'The read was refused.' }) }));
  }
  const report = result.report;

  const head = pageHeader({
    eyebrow: 'Finance & the owners’ claim',
    title: 'Enterprise value bridge',
    subtitle: '“Equity value is down 4%” is four facts with four owners: what operators did at the multiple the market already paid, what a cheque bought, what the market changed its mind about, and what cash did to net debt. This divides the movement exactly — and refuses the division when a reading will not declare its perimeter.',
    actions: [
      report.seat.canRecord
        ? h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'vb-record-open', onClick: () => {
          const candidates = ctx.api.valueBridgeCandidates();
          if (!candidates?.ok) { toast(candidates?.error || 'Recording a reading was refused.', 'bad'); return; }
          recordReading(ctx, candidates);
        } }, 'Record a reading')
        : null,
      report.seat.canClaim
        ? h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'vb-claim-open', onClick: () => {
          const candidates = ctx.api.valueBridgeCandidates();
          if (!candidates?.ok) { toast(candidates?.error || 'Claiming a leg was refused.', 'bad'); return; }
          claimLeg(ctx, candidates);
        } }, 'Claim a leg')
        : null,
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'vb-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'vb-csv', onClick: () => downloadCsv(ctx, report.today) }, 'CSV'),
    ].filter(Boolean),
  });

  const viewTabs = tabs({
    ariaLabel: 'Enterprise value bridge views',
    active: view,
    items: VALUE_BRIDGE_VIEWS.map((row) => ({ key: row.key, label: row.label })),
    onSelect: (key) => ctx.navigate(`${BASE_HREF}${key === 'bridge' ? '' : `&view=${key}`}`),
  });

  if (view === 'method') return h('div', { class: 'page' }, head, panelTabs, viewTabs, methodSection(ctx, report));
  if (view === 'owners') return h('div', { class: 'page' }, head, panelTabs, viewTabs, ownersSection(report));

  return h('div', { class: 'page' },
    head,
    panelTabs,
    viewTabs,
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.warnings.length ? card({ body: banner({ tone: 'warn', title: 'Rows that could not be read exactly were not loaded', body: report.warnings.join(' ') }) }) : null,
    summary(report),
    report.bridges.length
      ? null
      : card({
        body: emptyState({
          title: 'No bridge is printed',
          body: report.seat.canRecord
            ? 'Record two readings in one currency — EBITDA, the multiple and net debt at each date — and the movement between them divides into operating, perimeter, re-rating and net debt. Nothing is inferred from an investment case, a budget or an imported feed.'
            : 'Equity value is enterprise material: it is read at the executive altitude (rank 4 and above) and recorded there. Nothing is inferred from an investment case, a budget or an imported feed.',
        }),
      }),
    ...report.bridges.map(bridgeCard),
    report.bridgesNotShown ? card({ body: h('p', { class: 'small text-warn' }, `${report.bridgesNotShown} further bridge(s) are beyond the ${L.bridgesShown} this page prints. They are in the CSV.`) }) : null,
    report.chains.length
      ? card({
        title: 'The whole chain',
        body: h('p', { class: 'small muted' }, 'Where every consecutive bridge is attributed, the chain is added from its legs — not re-derived from its ends, which would hide an inside perimeter change inside a single opening-to-closing difference.'),
      })
      : null,
    ...report.chains.map(chainCard),
    refusalsCard());
}
