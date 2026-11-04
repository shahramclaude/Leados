/**
 * app/views/disclosure.js — the Disclosure Console (`#/disclosure`) and the
 * altitude-appropriate aggregate screen every withheld-detail module now gets
 * (Schema v90, ADR-0086).
 *
 * Two screens, one idea: the workspace should be usable at every altitude and
 * say exactly why it is showing what it is showing. Above a module's detail
 * ceiling the shell no longer hands the leader a refusal page — it hands them
 * the aggregate the level above actually acts on, and gives them one legitimate
 * route to more detail (a consented, expiring, span-bounded release).
 */

import { h, toast, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, kv, tabs, barRow, table } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import { MODULE_MANIFESTS, MANIFEST_ROUTES, manifestFor } from '../core/domain/disclosureManifests.js';
import { activeGrants, validateGrantRequest } from '../core/domain/disclosure.js';
import { DISCLOSURE_LIMITS, DISCLOSURE_MODES, DISCLOSURE_POSTURES } from '../core/domain/disclosureRegistry.js';

const POSTURE_TONE = { detail: 'good', aggregate: 'caution', withheld: 'bad' };
const STATUS_TONE = { granted: 'caution', requested: 'neutral', refused: 'bad', revoked: 'bad', expired: 'neutral' };

const money = (map) => {
  const rows = Object.entries(map || {});
  if (!rows.length) return '—';
  return rows.map(([cur, amt]) => `${cur} ${Number(amt).toLocaleString('en-US', { maximumFractionDigits: 0 })}`).join(' · ');
};

function copyText(text, label = 'Copied') {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(label, 'good'), () => toast('Copy blocked by the browser', 'bad'));
    return;
  }
  toast('Clipboard is not available here', 'bad');
}

/* ------------------------------------------------------------- console */

function requestDialog(ctx, report, presetRoute = null) {
  const seat = report.compiled.seatId ? { id: report.compiled.seatId } : null;
  const built = ctx.seatContext?.built || null;
  const activeSeatObj = ctx.seatContext?.seat || null;
  const eligibleRoutes = Object.entries(report.compiled.entries)
    .filter(([, e]) => e.posture === DISCLOSURE_POSTURES.AGGREGATE
      && e.mode !== DISCLOSURE_MODES.AGGREGATE
      && e.classKey !== 'enterprise');
  if (!eligibleRoutes.length) {
    toast('Nothing at this altitude is held back as detail: there is no ceiling to release.', 'neutral');
    return;
  }
  const routeSelect = h('select', { id: 'dsc-route' },
    ...eligibleRoutes.map(([route, e]) => h('option', { value: route, ...(presetRoute === route ? { selected: 'selected' } : {}) }, `${e.label} — ${e.classLabel}`)));
  const spanOptions = built && activeSeatObj && !activeSeatObj.fullAccess
    ? [...activeSeatObj.scope].filter((pid) => pid !== activeSeatObj.id && built.chain.byId.has(pid))
    : [];
  const spanSelect = h('select', { id: 'dsc-span' },
    ...(spanOptions.length
      ? spanOptions.map((pid) => {
        const node = built.chain.nodes.get(pid) || null;
        return h('option', { value: pid }, node?.name || pid);
      })
      : [h('option', { value: '' }, 'No subordinate span in this seat')]));
  const days = h('input', { id: 'dsc-days', type: 'number', min: String(DISCLOSURE_LIMITS.minDays), max: String(DISCLOSURE_LIMITS.maxDays), value: String(report.conventions.disclosureReviewDays) });
  const purpose = h('textarea', { id: 'dsc-purpose', rows: '4', maxlength: '400', placeholder: 'What decision does this detail change? The span leader is being asked to agree to something specific.' });
  const preview = h('p', { class: 'muted small' });

  function refreshPreview() {
    const verdict = validateGrantRequest(ctx.state, activeSeatObj, built, {
      route: routeSelect.value, spanId: spanSelect.value || 'none', purpose: purpose.value, days: days.value,
    }, { now: ctx.now, settings: ctx.state.settings });
    preview.textContent = verdict.ok
      ? `Admissible: ${verdict.value.days} day(s), one screen, one span. The span leader still has to consent — this button only asks.`
      : verdict.error;
    preview.className = verdict.ok ? 'muted small' : 'small field-error';
  }
  [routeSelect, spanSelect, days, purpose].forEach((el) => el.addEventListener('input', refreshPreview));
  refreshPreview();

  openModal({
    title: 'Request a bounded release',
    description: 'A release lifts one class ceiling, for one span, on one screen, until a stated date — and only after the span leader consents.',
    body: h('div', { class: 'stack-sm' },
      h('label', { for: 'dsc-route' }, 'Screen'),
      routeSelect,
      h('label', { for: 'dsc-span' }, 'Span whose detail is being requested'),
      spanSelect,
      h('label', { for: 'dsc-days' }, `Days (${DISCLOSURE_LIMITS.minDays}–${DISCLOSURE_LIMITS.maxDays})`),
      days,
      h('label', { for: 'dsc-purpose' }, 'Purpose (at least 12 characters, kept with the record)'),
      purpose,
      preview),
    footer: [
      h('button', { class: 'btn', type: 'button', onClick: () => document.querySelector('#modal-root')?.dispatchEvent(new window.CustomEvent('leados:close')) }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.disclosureRequest({
            route: routeSelect.value, spanId: spanSelect.value, purpose: purpose.value, days: Number(days.value),
          });
          if (!result?.ok) { toast(result?.error || 'The request was refused.', 'bad'); return; }
          toast('Release requested — the span leader has a consent task.', 'good');
          document.querySelector('#modal-root')?.dispatchEvent(new window.CustomEvent('leados:close'));
          ctx.refresh();
        },
      }, 'Send the request'),
    ],
  });
}

function coveragePanel(ctx, report) {
  const rows = Object.entries(report.compiled.entries)
    .sort((a, b) => Object.values(DISCLOSURE_POSTURES).indexOf(a[1].posture) - Object.values(DISCLOSURE_POSTURES).indexOf(b[1].posture) || a[1].label.localeCompare(b[1].label))
    .map(([route, entry]) => ({
      route,
      entry,
      cells: [
        h('a', { href: `#/${route}`, onClick: (e) => { e.preventDefault(); ctx.navigate(`#/${route}`); } }, entry.label),
        badge(entry.posture, POSTURE_TONE[entry.posture] || 'neutral'),
        h('span', { class: 'muted small' }, entry.declared ? `${entry.classLabel} · floor ${entry.floorRank} · detail to rank ${entry.detailCeiling}` : 'undeclared'),
        h('span', { class: 'muted small' }, entry.reason || (entry.grantedBy ? `Release ${entry.grantedBy}` : 'Full detail at this altitude.')),
      ],
    }));
  return card({
    title: 'Every screen, and the posture it holds here',
    subtitle: `${report.coverage.declared} screens declared · ${report.coverage.detail} in detail · ${report.coverage.aggregate} aggregate-only · ${report.coverage.withheld} withheld (${report.coverage.withheldBelowFloor} below a class floor).`,
    body: table({
      columns: [
        { label: 'Screen', render: (r) => r.cells[0] },
        { label: 'Posture', render: (r) => r.cells[1] },
        { label: 'Class and window', render: (r) => r.cells[2] },
        { label: 'Why', render: (r) => r.cells[3] },
      ],
      rows,
      caption: 'Disclosure posture by screen',
    }),
  });
}

function posturePanel(ctx, report) {
  const aggs = report.aggregates.filter((a) => a.spanTotal !== null || a.withheldCells > 0);
  if (!aggs.length) {
    return card({
      title: 'Nothing is being held back as counts',
      body: emptyState({ title: 'Every open screen at this altitude is readable in full.', body: 'Aggregates appear here for screens whose detail sits above this seat’s ceiling.' }),
    });
  }
  return h('div', { class: 'stack' }, ...aggs.slice(0, 10).map((agg) => card({
    title: `${agg.label}`,
    subtitle: agg.spanTotal === null
      ? `Total withheld: fewer than ${agg.floorN} records in this span.`
      : `${agg.spanTotal} record(s) · ${agg.totals.open ?? '—'} open · ${agg.totals.overdue ?? '—'} overdue · oldest ${agg.totals.oldestDays ?? 'unknown'}d · ${money(agg.totals.money)}`,
    actions: [h('button', { class: 'btn btn-small', type: 'button', onClick: () => { ctx.navigate(`#/${agg.route}`); } }, 'Open the aggregate')],
    body: h('div', { class: 'stack-sm' },
      ...agg.spans.map((span) => (span.withhold
        ? h('p', { class: 'muted small' }, `${span.label}: withheld — ${span.withholdReason}`)
        : barRow({ label: span.label, value: span.count, hint: `${span.open} open · ${span.overdue} overdue` }))),
      ...agg.notes.map((note) => h('p', { class: 'muted small' }, note))),
  })));
}

function releasesPanel(ctx, report) {
  const request = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => requestDialog(ctx, report) }, 'Request a release');
  const rows = report.grants.map((grant) => ({
    grant,
    cells: [
      h('div', { class: 'stack-xs' },
        h('strong', null, grant.moduleLabel),
        h('span', { class: 'muted small' }, grant.spanLabel || grant.spanId),
        h('span', { class: 'muted small' }, `“${grant.purpose}”`)),
      badge(grant.status, STATUS_TONE[grant.status] || 'neutral'),
      h('span', { class: 'small' }, grant.status === 'granted'
        ? `${formatDate(grant.grantedOn)} → ${formatDate(grant.expiresOn)} · consented by ${grant.consentFromId}`
        : grant.status === 'requested'
          ? `Asked ${formatDate(grant.requestedOn)} · ${grant.days}d requested`
          : grant.refusedReason || grant.revokedReason || `ended ${formatDate(grant.expiredOn)}`),
      h('div', { class: 'row-actions' },
        grant.status === 'requested' ? h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.disclosureRefuse(grant.id, 'Declined from the Disclosure Console with a recorded reason.');
            if (!result?.ok) { toast(result?.error || 'Refused.', 'bad'); return; }
            toast('Refused, with the reason kept.', 'good');
            ctx.refresh();
          },
        }, 'Refuse') : null,
        grant.status === 'granted' ? h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.disclosureRevoke(grant.id, 'Ended early from the Disclosure Console.');
            if (!result?.ok) { toast(result?.error || 'Refused.', 'bad'); return; }
            toast('Release ended.', 'good');
            ctx.refresh();
          },
        }, 'End early') : null,
        grant.decisionId ? h('a', { class: 'small', href: '#/decisions', onClick: () => {} }, 'Governed decision opened') : null),
    ],
  }));
  return card({
    title: 'Release contracts',
    subtitle: 'A release is requested by the altitude that needs the detail and consented by the span that owns it. It expires on its own date and its end is recorded.',
    actions: [request],
    body: rows.length
      ? table({
        columns: [
          { label: 'Release', render: (r) => r.cells[0] },
          { label: 'Status', render: (r) => r.cells[1] },
          { label: 'Window', render: (r) => r.cells[2] },
          { label: 'Actions', render: (r) => r.cells[3] },
        ],
        rows,
        caption: 'Disclosure release contracts',
      })
      : emptyState({ title: 'No releases recorded at this seat.', body: 'Detail above your ceiling stays as counts until the span leader consents to a bounded window.', action: request }),
  });
}

function briefPanel(ctx, report) {
  const brief = ctx.api.disclosureBriefText?.();
  const text = brief?.ok ? brief.text : 'The brief could not be compiled at this seat.';
  return card({
    title: 'The upward brief',
    subtitle: 'Counts, rates and currency totals only — safe to paste into the level above.',
    actions: [h('button', { class: 'btn btn-small', type: 'button', onClick: () => copyText(text, 'Disclosure brief copied') }, 'Copy brief')],
    body: h('pre', { class: 'mono small wrap' }, text),
  });
}

export function renderDisclosure(ctx) {
  const previewSeat = ctx.query?.get?.('seat') || null;
  const compiled = ctx.api.disclosureRead(previewSeat);
  if (!compiled?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Governance', title: 'Disclosure Console', subtitle: 'The boundary explaining itself.' }),
      card({ title: 'This view could not be compiled', body: h('p', null, compiled?.error || 'Unknown refusal.'), className: 'card-bad' }));
  }
  const report = compiled;
  const panel = ['coverage', 'posture', 'releases', 'brief'].includes(ctx.query?.get?.('panel')) ? ctx.query.get('panel') : 'coverage';
  const operatorSeats = ctx.seatContext?.built?.seats || [];
  const previewSelect = ctx.seatContext?.seat?.fullAccess && operatorSeats.length
    ? h('div', { class: 'stack-xs' },
      h('label', { for: 'dsc-preview' }, 'Preview a declared seat’s posture (operator view only)'),
      h('select', {
        id: 'dsc-preview',
        onChange: (e) => ctx.navigate(`#/disclosure?seat=${encodeURIComponent(e.target.value)}`),
      },
      h('option', { value: '' }, '— operator view (unenforced) —'),
      ...operatorSeats.map((s) => h('option', { value: s.id, ...(previewSeat === s.id ? { selected: 'selected' } : {}) }, `${s.label} — rank ${s.rank}`))))
    : null;
  const body = panel === 'coverage'
    ? coveragePanel(ctx, report)
    : panel === 'posture'
      ? posturePanel(ctx, report)
      : panel === 'releases'
        ? releasesPanel(ctx, report)
        : briefPanel(ctx, report);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Governance · ADR-0086',
      title: 'Disclosure Console',
      subtitle: `${report.compiled.enforced ? report.compiled.seatLabel : 'Undeclared operator view'} · every screen states the posture it holds here, and every withheld cell states why.`,
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => { const r = ctx.api.disclosureScan(); toast(r?.ok ? 'Sweep complete: expiries applied, reviews opened.' : 'The sweep was refused.', r?.ok ? 'good' : 'bad'); ctx.refresh(); } }, 'Run the sweep'),
        h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => requestDialog(ctx, report) }, 'Request a release'),
      ],
      meta: previewSelect,
    }),
    h('div', { class: 'stat-row' },
      stat({ label: 'Detail', value: report.coverage.detail, hint: 'screens readable in full here' }),
      stat({ label: 'Aggregate', value: report.coverage.aggregate, hint: 'counts and rates, no item detail' }),
      stat({ label: 'Withheld', value: report.coverage.withheld, hint: 'below a class floor or undeclared' }),
      stat({ label: 'Open coverage', value: `${report.coverage.openPct}%`, hint: `${report.coverage.declared} screens declared` }),
      stat({ label: 'Live releases', value: report.active.length, hint: `${report.awaitingConsent.length} awaiting consent · ${report.expiringSoon.length} expiring soon` })),
    tabs({
      items: [
        { key: 'coverage', label: 'Coverage', count: report.coverage.declared },
        { key: 'posture', label: 'Aggregates', count: report.aggregates.length },
        { key: 'releases', label: 'Releases', count: report.grants.length },
        { key: 'brief', label: 'Brief' },
      ],
      active: panel,
      onSelect: (key) => ctx.navigate(`#/disclosure?panel=${key}${previewSeat ? `&seat=${encodeURIComponent(previewSeat)}` : ''}`),
      ariaLabel: 'Disclosure console sections',
    }),
    body);
}

/* --------------------------------------------- the altitude-appropriate screen */

/**
 * What the shell renders instead of the legacy view when a screen sits above the
 * seat's detail ceiling. It is the same module, read at the altitude that is
 * actually operating: counts, load, money by currency, per-child-span detail
 * with floors — and one honest route to a consented release.
 */
export function renderAggregatePosture(ctx, entry, aggregate) {
  const label = entry?.label || 'This module';
  if (!aggregate) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Aggregate posture', title: label, subtitle: entry?.reason || 'No aggregate could be compiled.' }),
      card({ title: 'Nothing to aggregate', body: h('p', null, 'This screen has no record ledger of its own at this altitude.') }));
  }
  const reachable = (aggregate.route ? `#/${aggregate.route}` : null);
  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: `Aggregate posture · ${aggregate.classLabel}`,
      title: label,
      subtitle: entry?.reason || '',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => ctx.navigate('#/disclosure?panel=releases') }, 'Request a bounded release'),
        h('a', { class: 'btn btn-small', href: '#/disclosure', onClick: (e) => { e.preventDefault(); ctx.navigate('#/disclosure'); } }, 'Why this is an aggregate'),
      ],
    }),
    h('div', { class: 'stat-row' },
      stat({ label: 'Records', value: aggregate.spanTotal === null ? 'withheld' : aggregate.spanTotal, hint: aggregate.spanTotal === null ? `below the floor of ${aggregate.floorN}` : 'inside this seat’s span' }),
      stat({ label: 'Open', value: aggregate.totals.open ?? '—', hint: 'still needing a decision' }),
      stat({ label: 'Overdue', value: aggregate.totals.overdue ?? '—', hint: 'past a promised date' }),
      stat({ label: 'Severity load', value: aggregate.totals.severitySum ? aggregate.totals.severitySum : '—', hint: aggregate.totals.severityMax ? `max ${aggregate.totals.severityMax}` : 'no severity recorded' }),
      stat({ label: 'Money at stake', value: money(aggregate.totals.money), hint: 'never pooled across currencies' })),
    card({
      title: 'By span',
      subtitle: `Each row is a span under this seat. Cells below ${aggregate.floorN} records are withheld, and one further cell is withheld so the hidden ones cannot be recovered by subtraction.`,
      body: aggregate.spans.length
        ? h('div', { class: 'stack-sm' }, ...aggregate.spans.map((span) => (span.withhold
          ? h('p', { class: 'muted small' }, `${span.label}: withheld — ${span.withholdReason}`)
          : barRow({ label: span.label, value: span.count, hint: `${span.open} open · ${span.overdue} overdue · oldest ${span.oldestDays ?? 'unknown'}d${span.severitySum ? ` · severity ${span.severitySum}` : ''}` }))))
        : emptyState({ title: 'No records in this seat’s span.', body: 'That is a measurement, not a failure: nothing here has been opened, delegated or decided yet.' }),
    }),
    aggregate.notes.length
      ? card({ title: 'What this aggregate refuses to claim', body: h('ul', { class: 'stack-xs' }, ...aggregate.notes.map((note) => h('li', { class: 'small' }, note))) })
      : null,
    card({
      title: 'The same records, without the summary',
      subtitle: 'Item-level detail for this screen sits above this seat’s ceiling. Only the span that owns the records can release it, for a stated purpose and a stated number of days.',
      body: h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, `${entry?.classLabel || 'This class'} is disclosed above rank ${entry?.detailCeiling ?? '—'} as counts and rates, not item detail.`),
        h('div', { class: 'row-actions' },
          h('a', { class: 'btn btn-small', href: '#/disclosure', onClick: (e) => { e.preventDefault(); ctx.navigate('#/disclosure?panel=releases'); } }, 'Open a release request'),
          reachable ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => ctx.navigate(reachable) }, 'Reload this module') : null)),
    }));
}

/** Small helper for other screens that want to print a posture chip inline. */
export function postureChip(entry) {
  if (!entry) return null;
  return badge(entry.posture, POSTURE_TONE[entry.posture] || 'neutral', entry.reason || '');
}

export { MANIFEST_ROUTES, MODULE_MANIFESTS, manifestFor, activeGrants, kv };
