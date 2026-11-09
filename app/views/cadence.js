/**
 * app/views/cadence.js — the Operating Cadence Clock (`#/cadence`, Schema v93,
 * ADR-0087).
 *
 * Five role-tiered panels across the five organisational altitudes. The page is
 * organised around the one question the rest of the workspace never asks: *which
 * standing forum is competent to close this, when does it next sit, and can it
 * physically carry the agenda converging on it?*
 *
 *   1. The clock (`clock`)      — every declared forum as a governance server:
 *                                 ρ, flow time, next sitting and the days of
 *                                 slack each altitude holds.
 *   2. Queue workbench          — file, attribute and see which items land where.
 *   3. Constraint               — the named binding constraint (Theory of
 *      Constraints), the secondary constraints, the escape ladder and the
 *      frozen-reading ledger with out-of-sample grading.
 *   4. Forum fit (Conway)       — does membership mirror the work arriving at it?
 *   5. Brief                    — identity-free Markdown + aggregate CSV.
 *
 * Honest boundaries are rendered on the page, not hidden in a README: the queueing
 * model states its assumptions next to the number it produced, every refusal
 * prints the figure that caused it, and no person is ever measured.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import {
  CADENCE_ALTITUDE_PLAYBOOK,
  CADENCE_BOUNDS,
  CADENCE_LIMITS,
  CADENCE_PANELS,
  CONSTRAINT_TYPE_LABELS,
  FORUM_CADENCES,
  FORUM_CADENCE_LABELS,
  FORUM_KIND_LABELS,
  FORUM_KINDS,
  FORUM_STATUS_LABELS,
  INPUT_CLASSES,
  TOPOLOGY_PATTERN_LABELS,
  UTILISATION_BANDS,
} from '../core/domain/cadenceRegistry.js';

const panelFor = (query) => {
  const p = query?.get?.('panel');
  return CADENCE_PANELS.includes(p) ? p : 'clock';
};

const go = (ctx, panel, extra = '') => ctx.navigate(`#/cadence?panel=${panel}${extra}`);
const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
const altShort = (key) => ({
  frontline: 'Frontline (7d)',
  manager: 'Manager (30d)',
  director: 'Director (90d)',
  exec: 'Executive (180d)',
  chief: 'Chief / CEO (365d)',
}[key] || key || '—');

const verdictTone = (verdict) => ({
  slack: 'good',
  balanced: 'good',
  critical: 'caution',
  congested: 'bad',
  unmeasured: 'neutral',
}[verdict] || 'neutral');

const stateTone = (state) => ({
  'on-clock': 'good',
  'escape-ladder': 'bad',
  congested: 'bad',
  unpredictable: 'caution',
  'no-competent-forum': 'caution',
  refused: 'neutral',
  'no-horizon': 'neutral',
}[state] || 'neutral');

const STATE_LABELS = {
  'on-clock': 'On the clock',
  'escape-ladder': 'Escapes the ladder',
  congested: 'Congested queue',
  unpredictable: 'Unpredictable',
  'no-competent-forum': 'No competent forum',
  refused: 'Not reviewable',
  'no-horizon': 'No declared horizon',
};

const topologyTone = (pattern) => ({
  mirrored: 'good',
  'narrower-than-work': 'caution',
  'wider-than-work': 'neutral',
  disjoint: 'bad',
  unmodelled: 'neutral',
}[pattern] || 'neutral');

/** People as options for a chair / attendance picker. */
function personOptions(state) {
  return (state.people || [])
    .filter((p) => p && p.status !== 'archived')
    .map((p) => ({ id: p.id, name: p.name || p.id, role: p.role || p.level || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function renderCadence(ctx) {
  const panel = panelFor(ctx.query);
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const state = ctx.state;
  const result = ctx.api.cadenceRead({ includeItems: true });
  if (!result || result.ok === false) {
    return h('div', { class: 'page' }, banner({
      tone: 'bad',
      title: 'The cadence read model could not be built',
      body: result?.error || 'The operating seat could not resolve the forum register.',
    }));
  }

  const {
    report, forums, readings, band, constraint, secondary, planning, altitudeRows, clock, counts, conventions, seat,
  } = result;
  const people = personOptions(state);
  const nameOf = (id) => people.find((p) => p.id === id)?.name || id || '—';
  const playbook = CADENCE_ALTITUDE_PLAYBOOK.find((row) => row.key === (seat.altitudeKey || 'chief')) || CADENCE_ALTITUDE_PLAYBOOK[4];

  /* ------------------------------------------------------------- actions */

  const rerender = () => ctx.navigate(`#/cadence?panel=${panel}`);

  const runScan = () => {
    const res = ctx.api.cadenceScan();
    if (res.ok) toast('Cadence re-derived; queue provenance, constraint and agenda fit re-checked.');
    else toast(res.error || 'The scan was refused.', 'bad');
    rerender();
  };

  const freezeReading = () => {
    const res = ctx.api.cadenceFreezeReading({});
    if (res.ok) toast('Frozen. This is a prospective claim and it will be graded once, afterwards.');
    else toast(res.error || 'The reading could not be frozen.', 'bad');
    rerender();
  };

  const gradeReading = (id) => {
    const res = ctx.api.cadenceGradeReading(id);
    if (res.ok) toast(`Graded: ${res.reading.grade.outcome === 'held' ? 'the prediction held' : 'the prediction did not hold'}.`);
    else toast(res.error || 'The reading is not due for grading.', 'bad');
    rerender();
  };

  const exportCsv = () => {
    const res = ctx.api.cadenceCsvRows();
    if (!res.ok) return toast(res.error || 'The export failed.', 'bad');
    const columns = [
      'row_kind', 'altitude', 'horizon_days', 'cadence', 'forum_kind', 'items',
      'demand_days', 'capacity_days', 'rho', 'flow_days', 'verdict', 'topology',
      'closures_per_sitting', 'suppressed',
    ].map((key) => ({ key, header: key }));
    downloadText(
      serializeCsv(columns, res.rows),
      `leados-operating-cadence-${dayKey(now)}.csv`,
      'text/csv',
    );
    toast(`Exported ${res.rows.length} aggregate row(s). No name, no id, no item title.`);
  };

  const downloadBrief = () => {
    const res = ctx.api.cadenceBriefText();
    if (!res.ok) return toast(res.error || 'The brief failed.', 'bad');
    downloadText(res.text, `leados-cadence-brief-${dayKey(now)}.md`, 'text/markdown');
    toast('Identity-free brief downloaded.');
  };

  /* --------------------------------------------------------- declare forum */

  const openDeclare = () => {
    const chair = { value: seat.id };
    const kind = { value: 'operating-review' };
    const cadence = { value: 'weekly' };
    const title = { value: '' };
    const capacity = { value: String(playbook.rank <= 2 ? 4 : 5) };
    const service = { value: '3' };
    const attending = { value: [] };
    const previewBox = { node: h('div', { class: 'stack-tight' }) };

    const refreshPreview = () => {
      const res = ctx.api.cadencePreviewForum({
        title: title.value || 'Preview forum',
        kind: kind.value,
        cadence: cadence.value,
        chairSeatId: chair.value,
        attending: attending.value,
        decisionCapacity: Number(capacity.value),
        serviceDays: Number(service.value),
      });
      closeAllModals();
      if (!res.ok) {
        previewBox.node.replaceChildren(h('p', { class: 'muted' }, res.error || 'The preview could not be built.'));
        return;
      }
      const p = res.preview;
      const tone = verdictTone(p.flow?.verdict);
      previewBox.node.replaceChildren(
        h('div', { class: 'row-wrap' },
          badge(`${p.itemN} item(s) would be attributed`, p.itemN ? 'caution' : 'good'),
          badge(p.flow?.verdict ? p.flow.bandLabel : 'unmeasured', tone),
          badge(TOPOLOGY_PATTERN_LABELS[p.fit?.topology] || 'unmodelled', topologyTone(p.fit?.topology)),
        ),
        h('p', null, `ρ would be ${fmt(p.demand?.rho)} against a ${p.demand?.targetPct ?? conventions.cadenceUtilisationTargetPct}% target; flow time ${fmt(p.flow?.flowDays, ' d')}; next sitting ${p.next?.known ? formatDate(p.next.on) : (p.next?.reason || 'unknown')}.`),
        h('p', { class: 'muted' }, p.verdict || 'Declare the forum to begin measuring it.'),
      );
      openDeclareModal();
    };

    const fields = [
      h('label', { class: 'field' }, h('span', null, 'Forum name'), h('input', {
        class: 'input', type: 'text', maxlength: '160', value: title.value,
        onInput: (e) => { title.value = e.target.value; },
      })),
      h('label', { class: 'field' }, h('span', null, 'Kind (what it is competent to close)'), h('select', {
        class: 'input', onChange: (e) => { kind.value = e.target.value; },
      }, ...FORUM_KINDS.map((k) => h('option', { value: k, selected: k === kind.value }, FORUM_KIND_LABELS[k])))),
      h('label', { class: 'field' }, h('span', null, 'Cadence (interval)'), h('select', {
        class: 'input', onChange: (e) => { cadence.value = e.target.value; },
      }, ...FORUM_CADENCES.map((c) => h('option', { value: c, selected: c === cadence.value }, FORUM_CADENCE_LABELS[c])))),
      h('label', { class: 'field' }, h('span', null, 'Chair (the seat accountable for the sitting)'), h('select', {
        class: 'input', onChange: (e) => { chair.value = e.target.value; },
      }, ...people.map((p) => h('option', { value: p.id, selected: p.id === chair.value }, `${p.name}${p.role ? ` · ${p.role}` : ''}`)))),
      h('label', { class: 'field' }, h('span', null, 'Declared decision capacity per sitting'), h('input', {
        class: 'input', type: 'number', min: '1', max: '40', value: capacity.value,
        onInput: (e) => { capacity.value = e.target.value; },
      })),
      h('label', { class: 'field' }, h('span', null, 'Declared service time (days from agenda to closed)'), h('input', {
        class: 'input', type: 'number', min: '0.5', step: '0.5', value: service.value,
        onInput: (e) => { service.value = e.target.value; },
      })),
      h('div', { class: 'field' },
        h('span', null, 'Attending seats (optional — used to test Conway fit)'),
        h('div', { class: 'row-wrap' }, ...people.map((p) => h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            onChange: (e) => {
              if (e.target.checked) attending.value = [...attending.value, p.id];
              else attending.value = attending.value.filter((id) => id !== p.id);
            },
          }),
          h('span', null, p.name),
        ))),
      ),
    ];

    const openDeclareModal = () => {
      openModal({
        title: 'Declare a standing forum',
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted' }, 'A forum is a governance server: it has a declared decision capacity, a declared service time and a competence list. Declare what it can actually close, not what you hope it will.'),
          ...fields,
          previewBox.node,
        ),
        footer: [
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: refreshPreview }, 'Preview load'),
          h('button', {
            class: 'btn btn-primary',
            type: 'button',
            onClick: () => {
              const res = ctx.api.cadenceDeclareForum({
                title: title.value,
                kind: kind.value,
                cadence: cadence.value,
                chairSeatId: chair.value,
                attending: attending.value,
                decisionCapacity: Number(capacity.value),
                serviceDays: Number(service.value),
              });
              if (!res.ok) return toast(res.error || 'The forum was refused.', 'bad');
              closeAllModals();
              toast('Forum declared. Its load is now measured every read.');
              rerender();
            },
          }, 'Declare forum'),
        ],
      });
    };
    openDeclareModal();
  };

  /* --------------------------------------------------------- log a sitting */

  const openLogSession = (forumRow) => {
    const heldOn = { value: dayKey(now) };
    const closedN = { value: '0' };
    const plannedN = { value: String(forumRow.forum.decisionCapacity) };
    const status = { value: 'held' };
    const classes = { value: [] };
    const estimate = { value: '' };

    openModal({
      title: `Record a sitting — ${forumRow.title}`,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Declared capacity is ${forumRow.forum.decisionCapacity} binding decision(s) per sitting. A recorded closure count above that is refused, so the measured closures-per-sitting figure cannot be inflated by data entry.`),
        h('label', { class: 'field' }, h('span', null, 'Date the forum sat'),
          h('input', { class: 'input', type: 'date', value: heldOn.value, max: dayKey(now), onInput: (e) => { heldOn.value = e.target.value; } })),
        h('label', { class: 'field' }, h('span', null, 'Outcome'),
          h('select', { class: 'input', onChange: (e) => { status.value = e.target.value; } },
            h('option', { value: 'held', selected: true }, 'Sat — record what closed'),
            h('option', { value: 'cancelled' }, 'Cancelled — record the cadence slip'))),
        h('label', { class: 'field' }, h('span', null, 'Items that actually closed'),
          h('input', { class: 'input', type: 'number', min: '0', max: String(forumRow.forum.decisionCapacity), value: closedN.value, onInput: (e) => { closedN.value = e.target.value; } })),
        h('label', { class: 'field' }, h('span', null, 'Items that were on the agenda'),
          h('input', { class: 'input', type: 'number', min: '0', value: plannedN.value, onInput: (e) => { plannedN.value = e.target.value; } })),
        h('div', { class: 'field' },
          h('span', null, 'Input classes closed (drives the planning-factor measurement)'),
          h('div', { class: 'row-wrap' }, ...INPUT_CLASSES.filter((c) => c.reviewable).map((c) => h('label', { class: 'check' },
            h('input', { type: 'checkbox', onChange: (e) => {
              if (e.target.checked) classes.value = [...classes.value, c.key];
              else classes.value = classes.value.filter((k) => k !== c.key);
            } }),
            h('span', null, c.label),
          ))),
        ),
        h('label', { class: 'field' }, h('span', null, 'Your estimate at agenda lock (days to close) — the planning-fallacy input'),
          h('input', { class: 'input', type: 'number', min: '0', step: '0.5', value: estimate.value, placeholder: 'leave blank if not estimated', onInput: (e) => { estimate.value = e.target.value; } })),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.cadenceLogSession(forumRow.id, {
              heldOn: heldOn.value,
              status: status.value,
              closedN: Number(closedN.value),
              plannedN: Number(plannedN.value),
              closedClassKeys: classes.value,
              estimatedServiceDays: estimate.value === '' ? null : Number(estimate.value),
            });
            if (!res.ok) return toast(res.error || 'The sitting was refused.', 'bad');
            closeAllModals();
            toast(status.value === 'held' ? 'Sitting recorded; the clock has advanced.' : 'Cancellation recorded — the cadence slip is visible, not hidden.');
            rerender();
          },
        }, 'Record sitting'),
      ],
    });
  };

  /* ------------------------------------------------------------ panel 1 */

  function clockPanel() {
    const activeForums = forums.filter((row) => row.status === 'active');
    return [
      h('div', { class: 'grid grid-4' },
        stat({ label: 'Declared forums', value: String(forums.length), hint: `${activeForums.length} active` }),
        stat({ label: 'Workspace ρ', value: fmt(report.workspaceRho), tone: band.tone === 'bad' ? 'bad' : band.tone === 'caution' ? 'caution' : 'good', hint: band.label }),
        stat({ label: 'Items queued', value: String(counts.attributable), hint: `${counts.unmatched} unmatched · ${counts.unreviewable} unreviewable` }),
        stat({ label: 'Escaping the ladder', value: String(clock.counts.escape), tone: clock.counts.escape ? 'bad' : clock.counts.unpredictable ? 'caution' : 'neutral', hint: `${clock.counts.unpredictable} unpredictable; zero escapes does not prove every item can land in time` }),
      ),
      band.key !== 'unmeasured' && h('div', null, banner({
        tone: band.tone === 'bad' ? 'bad' : band.tone === 'caution' ? 'caution' : 'info',
        title: `Workspace utilisation ${fmt(report.workspaceRho)} — ${band.label}`,
        body: `${band.verdict} ρ is demand-days divided by capacity-days at the declared ${conventions.cadenceUtilisationTargetPct}% planning target. It is a statement about the calendar, never about the people on it.`,
      })),
      !forums.length && emptyState({
        title: 'No standing forum has been declared',
        body: 'LeadOS will not invent a meeting calendar. Declare the forums you actually run — their cadence, their decision capacity and what they are competent to close — and this page becomes a live model of whether your governance can close the work in front of it.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: openDeclare }, 'Declare the first forum'),
        icon: '◷',
      }),
      (() => {
        const focusForumId = ctx.query?.get?.('forum') || null;
        const focused = focusForumId ? forums.find((f) => f.id === focusForumId) : null;
        if (!focused) return null;
        return card({
          title: `Focused forum · ${focused.title}`,
          subtitle: 'Addressed from a typed graph edge. Everything below is derived on read from the register and the dated records — nothing on this card is stored.',
          body: h('div', { class: 'stack-tight' },
            banner({
              tone: focused.flow.verdict === 'congested' ? 'bad' : focused.flow.verdict === 'critical' ? 'caution' : 'info',
              title: `${focused.kindLabel} · ${FORUM_CADENCE_LABELS[focused.cadence] || focused.cadence} · ${focused.status}`,
              body: `ρ ${fmt(focused.demand.rho)} · demand ${fmt(focused.demand.demandDays)}d against capacity ${fmt(focused.demand.capacityDays)}d · flow ${focused.flow.flowDays === null ? 'refused (no steady state)' : `${fmt(focused.flow.flowDays)}d`} · ${focused.itemN} item(s) · topology ${TOPOLOGY_PATTERN_LABELS[focused.fit.topology] || focused.fit.topology}.`,
            }),
            h('div', { class: 'muted small' }, focused.fit.topologyNote || ''),
          ),
        });
      })(),
      forums.length ? card({
        title: 'The governance clock',
        subtitle: 'Every declared forum read as a single-server queue with a calendar. Waiting time is refused at ρ ≥ 1 because no steady state exists.',
        actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: openDeclare }, 'Declare forum')],
        body: table({
          caption: 'Standing forums with derived demand, utilisation, flow time and next sitting',
          columns: [
            { label: 'Forum', render: (row) => h('div', null,
              h('strong', null, row.title),
              h('div', { class: 'muted small' }, `${row.kindLabel} · ${FORUM_CADENCE_LABELS[row.cadence] || row.cadence} · ${altShort(row.forum.altitudeKey)}`)) },
            { label: 'Chair', render: (row) => nameOf(row.chairSeatId) },
            { label: 'Status', render: (row) => badge(FORUM_STATUS_LABELS[row.status] || row.status, row.status === 'active' ? 'good' : 'neutral') },
            { label: 'Items', render: (row) => String(row.itemN) },
            { label: 'Demand d', render: (row) => fmt(row.demand.demandDays) },
            { label: 'Capacity d', render: (row) => fmt(row.demand.capacityDays) },
            { label: 'ρ', render: (row) => h('span', null, fmt(row.demand.rho), ' ', badge(row.flow.bandLabel || 'unmeasured', verdictTone(row.flow.verdict))) },
            { label: 'Flow d', render: (row) => (row.flow.flowDays === null ? h('span', { class: 'muted' }, 'no steady state') : fmt(row.flow.flowDays)) },
            { label: 'Next sitting', render: (row) => (row.next.on
              ? h('span', null, row.next.known ? formatDate(row.next.on) : `Expected ${formatDate(row.next.on)}; ${row.next.reason}`)
              : h('span', { class: 'muted' }, row.next.reason || 'unknown')) },
            { label: 'Closures/sitting', render: (row) => (row.closuresPerSitting === null
              ? h('span', { class: 'muted' }, `needs ${conventions.cadenceFloorN}`)
              : `${row.closuresPerSitting} of ${row.forum.decisionCapacity}`) },
            { label: '', render: (row) => h('div', { class: 'row-wrap' },
              h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openLogSession(row) }, 'Record sitting'),
              h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => {
                  const res = ctx.api.cadenceUpdateForum(row.id, { status: row.status === 'active' ? 'paused' : 'active' });
                  if (!res.ok) return toast(res.error || 'The change was refused.', 'bad');
                  rerender();
                },
              }, row.status === 'active' ? 'Pause' : 'Resume')) },
          ],
          rows: forums,
        }),
      }) : null,
      card({
        title: 'What each altitude runs',
        subtitle: `You are operating from: ${seat.label}${seat.fullAccess ? ' (undeclared operator — full workspace)' : ''}. The clock reads differently at every altitude, and that is the point.`,
        body: table({
          caption: 'Forums, items, utilisation and escaping items by organisational altitude',
          columns: [
            { label: 'Altitude', render: (row) => h('div', null, h('strong', null, row.label), h('div', { class: 'muted small' }, `${row.horizonDays}-day time span`)) },
            { label: 'Forums', render: (row) => `${row.forumN}${row.attunedForumN !== row.forumN ? ` (${row.attunedForumN} stable)` : ''}` },
            { label: 'Items', render: (row) => String(row.itemN) },
            { label: 'ρ', render: (row) => fmt(row.rho) },
            { label: 'Escaping', render: (row) => (row.escapingN ? badge(String(row.escapingN), 'bad') : badge('0', 'good')) },
            { label: 'The question at this altitude', render: (row) => h('span', { class: 'muted' }, (CADENCE_ALTITUDE_PLAYBOOK.find((p) => p.key === row.key) || {}).clockQuestion || '—') },
          ],
          rows: altitudeRows,
        }),
      }),
      card({
        title: 'The model, stated',
        body: h('ul', { class: 'stack-tight' },
          h('li', null, 'Arrivals are Poisson (C_a² = 1) and service is the DECLARED service time on a single server per forum — the Kingman (1961) VUT approximation, printed beside the figure it produces.'),
          h('li', null, 'At ρ ≥ 1 no steady state exists, so no flow time and no landing date is printed. That is a refusal, not an error.'),
          h('li', null, 'Decision capacity is what you declared the forum can produce, never a derived optimum. The measured figure is closures per recorded sitting.'),
          h('li', null, 'Nothing here rates a person. Every subject is a forum, an input class or a span.'),
        ),
      }),
    ];
  }

  /* ------------------------------------------------------------ panel 2 */

  function workbenchPanel() {
    const rows = clock.rows.filter((r) => r.reviewable).slice(0, 80);
    const byClass = InputClassSummary(clock);
    return [
      h('div', { class: 'grid grid-4' },
        stat({ label: 'Reviewable items', value: String(counts.reviewable), hint: 'classified from the record’s own shape' }),
        stat({ label: 'Attributed', value: String(counts.attributable), hint: 'a competent forum exists' }),
        stat({ label: 'Unmatched', value: String(counts.unmatched), tone: counts.unmatched ? 'caution' : 'good', hint: 'no competent forum at the required horizon' }),
        stat({ label: 'Not reviewable', value: String(counts.unreviewable), tone: counts.unreviewable ? 'caution' : 'good', hint: 'facts not recorded — excluded from capacity' }),
      ),
      card({
        title: 'Queue attribution by input class',
        subtitle: 'The classification is a reading of the record’s own fields: a severe FMEA rating is a quality defect because the workspace recorded severity, a requisition is a staffing gap because it is a requisition. The default is “not reviewable”, never a guess.',
        body: table({
          caption: 'Open items by input class with the forum competent to close them',
          columns: [
            { label: 'Input class', render: (row) => h('div', null, h('strong', null, row.label), h('div', { class: 'muted small' }, row.question)) },
            { label: 'Horizon', render: (row) => fmt(row.horizonDays, ' d') },
            { label: 'Service', render: (row) => fmt(row.serviceDays, ' d') },
            { label: 'Items', render: (row) => String(row.n) },
            { label: 'On clock', render: (row) => badge(String(row.onClock), row.onClock ? 'good' : 'neutral') },
            { label: 'Escaping', render: (row) => (row.escape ? badge(String(row.escape), 'bad') : badge('0', 'good')) },
            { label: 'Unmatched', render: (row) => (row.unmatched ? badge(String(row.unmatched), 'caution') : '—') },
            { label: 'Competent forum kinds', render: (row) => h('span', { class: 'muted small' }, row.forums.map((k) => FORUM_KIND_LABELS[k].split(' (')[0]).join(', ') || 'none — not reviewable') },
          ],
          rows: byClass,
        }),
      }),
      card({
        title: 'The queue',
        subtitle: 'Each item attributed to ONE competent forum, with the two slack figures that matter: the measured slack (queue-adjusted) and the declared slack (a strict lower bound on lateness).',
        body: rows.length ? table({
          caption: 'Open items with their attributed forum and clock state',
          columns: [
            { label: 'Item', render: (row) => h('div', null,
              h('strong', null, row.title),
              h('div', { class: 'muted small' }, `${row.typeLabel} · ${row.classLabel}`)) },
            { label: 'Owner span', render: (row) => (row.ownerNodeId ? nameOf(row.ownerNodeId) : h('span', { class: 'muted' }, 'unowned')) },
            { label: 'Age', render: (row) => `${row.ageDays} d` },
            { label: 'Horizon', render: (row) => fmt(row.requiredHorizonDays, ' d') },
            { label: 'Forum', render: (row) => (row.forumTitle ? row.forumTitle : h('span', { class: 'muted' }, 'none')) },
            { label: 'State', render: (row) => badge(STATE_LABELS[row.clock.state] || row.clock.state, stateTone(row.clock.state)) },
            { label: 'Slack', render: (row) => (row.clock.slackDays === null ? h('span', { class: 'muted' }, '—') : `${row.clock.slackDays} d`) },
            { label: 'Expected close', render: (row) => (row.clock.expectedCloseOn ? formatDate(row.clock.expectedCloseOn) : h('span', { class: 'muted' }, 'unpromisable')) },
            { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.clock.reason || (row.matchReason || '')) },
          ],
          rows,
        }) : emptyState({ title: 'No open work', body: 'Nothing in the workspace is waiting on a forum. The clock is still running; it simply has nothing to carry.' }),
      }),
      card({
        title: 'Sources this page deliberately refuses',
        body: h('ul', { class: 'stack-tight' },
          h('li', null, 'A performance concern is a confidential people process with its own terminal. It contributes a count and never an identity, and it can never become a forum item.'),
          h('li', null, 'A 1:1 and a feedback follow-up are coaching work, not governance work: they appear as counts only, because routing them to a standing forum would be a disclosure failure.'),
          h('li', null, 'An item whose facts are not recorded is classified “not reviewable” rather than guessed into a class. It is excluded from every capacity figure, so an incomplete record can never make a forum look busy.'),
        ),
      }),
    ];
  }

  /* ------------------------------------------------------------ panel 3 */

  function constraintPanel() {
    // A graph edge may address one frozen reading (Schema v93 link contract): the
    // focused reading is read first, and the panel says so rather than silently
    // rendering whatever happens to be newest.
    const focusReadingId = ctx.query?.get?.('reading') || null;
    const focusedReading = focusReadingId ? readings.find((r) => r.id === focusReadingId) || null : null;
    const latest = focusedReading || readings[0] || null;
    const graded = readings.filter((r) => r.grade);
    return [
      h('div', { class: 'grid grid-4' },
        stat({ label: 'Named constraint', value: CONSTRAINT_TYPE_LABELS[constraint.type]?.split(' (')[0] || constraint.type, tone: constraint.type === 'none' ? 'good' : 'caution', hint: constraint.itemN ? `${constraint.itemN} item(s) affected` : 'nothing binding' }),
        stat({ label: 'Escaping items', value: String(clock.counts.escape), tone: clock.counts.escape ? 'bad' : 'good', hint: 'certain to miss their horizon' }),
        stat({ label: 'Secondary constraints', value: String(secondary.length), tone: secondary.length ? 'caution' : 'good', hint: 'everything else that is wrong' }),
        stat({ label: 'Graded readings', value: String(graded.length), hint: `${readings.length} frozen` }),
      ),
      focusedReading ? card({
        title: `Focused frozen reading · ${focusedReading.frozenOn || focusedReading.id}`,
        subtitle: 'Addressed from a typed link. A reading is frozen evidence: its conventions and figures are shown exactly as recorded, never re-derived.',
        body: banner({
          tone: focusedReading.grade ? 'good' : 'info',
          title: focusedReading.grade
            ? `Graded once: ${focusedReading.grade.outcome === 'held' ? 'the prediction held' : 'the prediction did not hold'}`
            : 'Frozen, not yet graded',
          body: `Engine ${focusedReading.engineVersion || '—'} · ${(focusedReading.forums || []).length} forum(s) in scope · utilisation target ${focusedReading.conventions?.cadenceUtilisationTargetPct ?? '—'}%${focusedReading.grade?.brier !== undefined ? ` · Brier ${focusedReading.grade.brier}` : ''}.`,
        }),
      }) : null,
      card({
        title: 'The binding constraint',
        subtitle: 'Theory of Constraints (Goldratt 1984/1997): name the ONE thing whose relief moves the most items, in a deterministic order stated on the page.',
        actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: freezeReading }, 'Freeze a reading')],
        body: h('div', { class: 'stack-tight' },
          banner({
            tone: constraint.type === 'none' ? 'info' : 'caution',
            title: constraint.title,
            body: constraint.detail,
          }),
          h('div', { class: 'row-wrap' },
            badge(constraint.label, constraint.type === 'none' ? 'good' : 'caution'),
            constraint.rho !== null ? badge(`ρ ${constraint.rho}`, 'caution') : null,
            constraint.itemN ? badge(`${constraint.itemN} item(s)`, 'bad') : null,
          ),
          h('p', null, h('strong', null, 'Remedy: '), constraint.remedy),
          h('p', { class: 'muted small' }, 'Ordering: unreviewable demand → no competent forum → congested forum (ρ ≥ 1) → escape ladder → utilisation above target → Conway mismatch → none. The ordering is a declared convention: it reflects what a leader can actually fix this week, not what is mathematically worst.'),
        ),
      }),
      secondary.length ? card({
        title: 'Everything else that is wrong',
        subtitle: 'A page that shows only the worst fact invites a leader to fix it and assume the machine is healthy. This is the rest of the list, in the same deterministic order.',
        body: table({
          caption: 'Secondary cadence constraints',
          columns: [
            { label: 'Constraint', render: (row) => h('div', null, h('strong', null, row.label), h('div', { class: 'muted small' }, row.title)) },
            { label: 'Items', render: (row) => String(row.itemN) },
            { label: 'ρ', render: (row) => fmt(row.rho) },
            { label: 'Remedy', render: (row) => h('span', { class: 'muted small' }, row.remedy) },
          ],
          rows: secondary,
        }),
      }) : null,
      clock.escape.length ? card({
        title: `The escape ladder — ${clock.escape.length} item(s) that cannot land in time`,
        subtitle: 'The second clock. A forum is a queue AND a calendar: an item can sit safely inside the queue (ρ < 1) and still cross its own time span before the forum next sits. These items miss their horizon even at each competent forum’s declared service time, before any queueing delay.',
        body: h('div', { class: 'stack' },
          table({
            caption: 'Escape-ladder findings by input class',
            columns: [
              { label: 'Input class', render: (row) => row.classLabel },
              { label: 'Items', render: (row) => badge(String(row.n), 'bad') },
              { label: 'Worst slack', render: (row) => `${row.worstSlackDays} d` },
              { label: 'Owning spans', render: (row) => h('span', { class: 'muted' }, row.spanIds.map(nameOf).join(', ') || 'unowned work') },
            ],
            rows: clock.escapeByClass,
          }),
          table({
            caption: 'Each escaping item with the rungs it was evaluated against',
            columns: [
              { label: 'Item', render: (row) => h('div', null, h('strong', null, row.title), h('span', { class: 'muted small' }, ` ${row.classLabel}`)) },
              { label: 'Age / horizon', render: (row) => `${row.ageDays} / ${row.clock.horizonDays} d` },
              { label: 'Ladder', render: (row) => h('div', { class: 'stack-tight' }, ...row.clock.forumPath.map((rung) => h('div', { class: 'muted small' },
                `${rung.title}: next ${rung.waitDays ?? '—'} d + service ${rung.declaredServiceDays} d → declared slack ${rung.declaredSlackDays ?? '—'} d${rung.congested ? ' (congested)' : ''}`))) },
              { label: 'Verdict', render: (row) => h('span', { class: 'small' }, row.clock.reason) },
            ],
            rows: clock.escape.slice(0, 25),
          }),
        ),
      }) : card({
        title: 'The escape ladder',
        subtitle: 'No item currently misses its own horizon through every competent forum. This is a measured statement about the declared calendar, not a claim that the decisions are good.',
        body: banner({
          tone: 'info',
          title: 'Nothing escapes the ladder right now',
          body: clock.counts.congested
            ? `${clock.counts.congested} item(s) sit in a congested queue, so their landing date is genuinely unpromisable rather than late. That is reported separately because "unknown" and "on time" are not the same fact.`
            : 'Every attributable item can land inside its horizon at the current declared intervals and service times.',
        }),
      }),
      card({
        title: 'Planning fallacy — measured, not asserted',
        subtitle: 'Kahneman & Lovallo (1993) named the planning fallacy; this measures it from your own submitted estimates against the declared service time, per input class, and refuses below the evidence floor.',
        body: h('div', { class: 'stack-tight' },
          banner({ tone: planning.pooledRatio === null ? 'info' : planning.pooledRatio > 1 ? 'caution' : 'info', title: planning.verdict }),
          table({
            caption: 'Measured planning factor by input class',
            columns: [
              { label: 'Input class', render: (row) => row.label },
              { label: 'Sittings', render: (row) => String(row.n) },
              { label: 'Mean estimate', render: (row) => fmt(row.meanEstimateDays, ' d') },
              { label: 'Mean declared', render: (row) => fmt(row.meanDeclaredDays, ' d') },
              { label: 'Ratio', render: (row) => (row.refused ? h('span', { class: 'muted' }, 'withheld') : badge(String(row.ratio), row.ratio > 1 ? 'caution' : 'good')) },
              { label: 'Refusal / reading', render: (row) => h('span', { class: 'muted small' }, row.refused || 'Measured against the declared service time for this class.') },
            ],
            rows: planning.rows,
          }),
        ),
      }),
      card({
        title: 'Frozen readings — one prospective claim, graded once',
        subtitle: 'A reading freezes what the clock said on a date and makes exactly one falsifiable claim about the next sitting. It is graded afterwards from recorded sittings and never rewritten.',
        actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: freezeReading }, 'Freeze now')],
        body: readings.length ? table({
          caption: 'Frozen cadence readings and their grades',
          columns: [
            { label: 'Frozen', render: (row) => formatDate(row.frozenOn) },
            { label: 'Workspace ρ', render: (row) => fmt(row.workspaceRho) },
            { label: 'Constraint', render: (row) => CONSTRAINT_TYPE_LABELS[row.constraint?.type]?.split(' (')[0] || '—' },
            { label: 'The claim', render: (row) => h('span', { class: 'small' }, row.prediction?.claim || 'no claim available') },
            { label: 'Confidence', render: (row) => (row.prediction?.probabilityPct === null ? '—' : `${row.prediction.probabilityPct}%`) },
            { label: 'Due', render: (row) => (row.prediction?.dueOn ? formatDate(row.prediction.dueOn) : '—') },
            { label: 'Grade', render: (row) => (row.grade
              ? badge(row.grade.outcome === 'held' ? 'Held' : 'Did not hold', row.grade.outcome === 'held' ? 'good' : 'bad')
              : h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => gradeReading(row.id) }, 'Grade')) },
            { label: 'Note', render: (row) => h('span', { class: 'muted small' }, row.grade?.note || '') },
          ],
          rows: readings,
        }) : emptyState({
          title: 'No reading has been frozen',
          body: 'A reading is a prediction about your own governance machine. Freeze one before the next cycle and this page grades it honestly afterwards — including when it was wrong.',
        }),
      }),
      latest && latest.prediction
        ? h('p', { class: 'muted small' }, `Most recent frozen claim: ${latest.prediction.claim}`)
        : null,
    ];
  }

  /* ------------------------------------------------------------ panel 4 */

  function fitPanel() {
    const rows = forums.filter((row) => row.fit);
    return [
      card({
        title: 'Forum fit — Conway’s law applied to the governance calendar',
        subtitle: 'A forum can only close what its membership is entitled to close. This compares, from the roster, the seats that OWN the arriving work against the seats that actually ATTEND.',
        body: banner({
          tone: 'info',
          title: 'Why this is a structural finding, not a scheduling preference',
          body: 'Conway (1968) observed that an organisation produces designs that mirror its communication structure. The same is true of decisions: a forum whose membership does not mirror the spans that own the work cannot close it, so every item is relayed by a proxy — or not closed at all. The mismatch is computed here from the reporting tree, never asserted.',
        }),
      }),
      rows.length ? table({
        caption: 'Forums with their membership topology and coverage',
        columns: [
          { label: 'Forum', render: (row) => h('div', null, h('strong', null, row.title), h('div', { class: 'muted small' }, row.kindLabel)) },
          { label: 'Chair', render: (row) => nameOf(row.chairSeatId) },
          { label: 'Attendees', render: (row) => String(row.fit.attendeeN) },
          { label: 'Owning seats', render: (row) => String(row.fit.owningSeatN) },
          { label: 'Coverage', render: (row) => (row.fit.coveragePct === null ? h('span', { class: 'muted' }, 'unmeasured') : `${row.fit.coveragePct}%`) },
          { label: 'Pattern', render: (row) => badge(TOPOLOGY_PATTERN_LABELS[row.fit.topology] || row.fit.topology, topologyTone(row.fit.topology)) },
          { label: 'Finding', render: (row) => h('span', { class: 'muted small' }, row.fit.topologyNote) },
        ],
        rows,
      }) : emptyState({ title: 'No forum has been declared', body: 'Declare a forum and its attendance list; fit is then measured against the work that actually arrives at it.' }),
      card({
        title: 'The four patterns, stated',
        body: h('ul', { class: 'stack-tight' },
          h('li', null, h('strong', null, 'Mirrored — '), 'membership spans every seat that owns arriving work. The forum can close what it is sent.'),
          h('li', null, h('strong', null, 'Narrower than the work — '), 'at least one owning seat is absent. Every item is relayed by a proxy, so accountability moves without moving.'),
          h('li', null, h('strong', null, 'Disjoint — '), 'no owning seat attends. The forum cannot close anything sent to it; the queue grows without bound and nobody at the table can end it.'),
          h('li', null, h('strong', null, 'Wider than the work — '), 'more seats attend than there are items (Ashby 1956: decision variety exceeds the queue). The sitting becomes a status report.'),
        ),
      }),
    ];
  }

  /* ------------------------------------------------------------ panel 5 */

  function briefPanel() {
    const brief = ctx.api.cadenceBriefText();
    return [
      card({
        title: 'Identity-free brief',
        subtitle: `Snapshot for ${dayKey(now)} — forums, classes and counts. No person, no item title, no free text.`,
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief }, 'Download Markdown'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportCsv }, 'Download aggregate CSV'),
        ],
        body: h('pre', { class: 'brief-text', tabindex: '0' }, brief.ok ? brief.text : 'The brief could not be built.'),
      }),
      card({
        title: 'Honest boundaries',
        body: h('ul', { class: 'stack-tight' },
          h('li', null, 'Local operating seats are auditable workflow declarations inside one browser store, not authenticated multi-user security.'),
          h('li', null, 'The queueing model is an approximation with printed assumptions. It is not a simulation and it does not know your real arrival process.'),
          h('li', null, 'A refusal is not an error: at ρ ≥ 1, at a forum that has never sat, and below the evidence floor the page prints the count and the reason instead of a figure.'),
          h('li', null, 'No figure on this page is a claim about a person. Every subject is a forum, an input class or a span.'),
          h('li', null, 'Small cells are blanked in the CSV below the declared cell floor; that is small-cell withholding, not differential privacy.'),
        ),
      }),
    ];
  }

  /* ----------------------------------------------------------- compose */

  const body = panel === 'clock'
    ? clockPanel()
    : panel === 'workbench'
      ? workbenchPanel()
      : panel === 'constraint'
        ? constraintPanel()
        : panel === 'fit'
          ? fitPanel()
          : panel === 'publication'
            ? [publicationPanel(ctx, 'cadence')]
            : briefPanel();

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Schema v93 · ADR-0087 · RULE-CAD-01..04',
      title: 'Operating Cadence Clock',
      subtitle: 'Your standing forums, read as a finite decision machine: what each one is competent to close, how much demand is converging on it, when it next sits, and whether the work can land inside the horizon it demands.',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Run scan'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: openDeclare }, 'Declare forum'),
      ],
    }),
    h('p', { class: 'page-sub' },
      `Operating from ${seat.label}. ${playbook.clockQuestion} ${playbook.capacityNote}`),
    tabs({
      items: [
        { key: 'clock', label: 'The clock', count: forums.length || undefined },
        { key: 'workbench', label: 'Queue workbench', count: counts.attributable || undefined },
        { key: 'constraint', label: 'Constraint', count: clock.counts.escape || undefined },
        { key: 'fit', label: 'Forum fit' },
        { key: 'brief', label: 'Brief & export' },
      ],
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Operating Cadence Clock sections',
    }),
    h('div', { class: 'stack' }, ...body.filter(Boolean)),
  );
}

/** Per-input-class summary rows for the workbench panel. */
function InputClassSummary(clock) {
  const map = new Map();
  for (const cls of INPUT_CLASSES) {
    map.set(cls.key, {
      key: cls.key,
      label: cls.label,
      question: cls.question,
      horizonDays: cls.horizonDays,
      serviceDays: cls.serviceDays,
      forums: cls.forums,
      n: 0,
      onClock: 0,
      escape: 0,
      unmatched: 0,
      congested: 0,
    });
  }
  for (const row of clock.rows) {
    const entry = map.get(row.classKey);
    if (!entry) continue;
    entry.n += 1;
    if (row.clock.state === 'on-clock') entry.onClock += 1;
    else if (row.clock.state === 'escape-ladder') entry.escape += 1;
    else if (row.clock.state === 'no-competent-forum') entry.unmatched += 1;
    else if (row.clock.state === 'congested') entry.congested += 1;
    else if (row.clock.state === 'refused') entry.unmatched += 0;
  }
  return [...map.values()]
    .filter((row) => row.n > 0 || row.key !== 'unreviewable')
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

export { UTILISATION_BANDS, CADENCE_BOUNDS, CADENCE_LIMITS };
