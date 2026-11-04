/**
 * app/views/operatingModel.js — The Operating Model (Schema v90, ADR-0084).
 *
 * Six panels, six different questions — and they are ordered the way a reader
 * would actually work, which is a design decision, not a layout one:
 *
 *   Spans     "What are the positions, as designed?"            (the model)
 *   Load      "Where is the line broken, and what fixes it?"    (the constraint)
 *   Coupling  "How many seams are there, and who is a hub?"     (the coordination)
 *   Levers    "What is the cheapest structural relief?"         (the answer)
 *   Norms     "What did we declare, and can we trust the inputs?" (the honesty)
 *   Brief     "What can I hand upward without naming anyone?"   (the export)
 *
 * A declared seat sees its own subtree; at executive rank and above the position
 * detail is replaced by aggregate rows and the disclosure ladder is printed
 * rather than assumed.
 */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import { LEADER_ID } from '../core/domain/chain.js';
import {
  OPERATING_MODEL_LEVERS,
  OPERATING_MODEL_LIMITS_DOCS,
  OPERATING_MODEL_LIMITS,
  OPERATING_MODEL_PANELS,
  OPERATING_MODEL_RULES,
  OPERATING_MODEL_WORK_TYPES,
} from '../core/domain/operatingModelRegistry.js';

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return OPERATING_MODEL_PANELS.includes(p) ? p : 'spans';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/operating-model?panel=${panel}${extra}`);
const show = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : String(v));
const showPct = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : `${v}%`);
const showUtil = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : `${Math.round(v * 1000) / 10}%`);

const TONE = (utilisation, ceil) => {
  if (utilisation === null || utilisation === undefined) return 'neutral';
  if (utilisation > 1) return 'bad';
  if (utilisation > ceil) return 'warn';
  return 'good';
};

/** A utilisation bar with the declared ceiling drawn on it — the ceiling must
 *  be visible, because a number the reader cannot see the threshold of is a
 *  number the reader has to trust. */
function utilisationBar(utilisation, ceiling) {
  const capped = Math.min(1.5, Math.max(0, utilisation || 0));
  return h('div', { class: 'om-bar', role: 'img', 'aria-label': `${showUtil(utilisation === null ? null : utilisation * 100)} of the position's own declared week, ceiling ${Math.round(ceiling * 100)}%` },
    h('div', { class: `om-bar-fill om-bar-${TONE(utilisation, ceiling)}`, style: `width:${(capped / 1.5) * 100}%` }),
    h('div', { class: 'om-bar-ceil', style: `left:${(ceiling / 1.5) * 100}%`, title: `Declared ceiling ${Math.round(ceiling * 100)}%` }),
    h('span', { class: 'om-bar-label' }, showUtil(utilisation === null ? null : utilisation * 100)));
}

function targetAltFor(rank) {
  return rank ? `rank ${rank}` : 'span';
}

export function renderOperatingModel(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const report = ctx.api.operatingModelRead();
  const norms = report.norms;
  const state = ctx.state;
  const people = (state.people || []).filter((p) => p && p.status !== 'archived');
  const nameOf = (id) => (id === LEADER_ID ? (state.settings?.leaderName || 'Workspace leader') : (people.find((p) => p.id === id)?.name || 'a span'));
  const positions = [(LEADER_ID), ...people.filter((p) => people.some((q) => q.managerId === p.id) || !people.some((q) => q.managerId === p.id))];
  const uniquePositions = [...new Set(positions)];
  const refreshTo = (name, extra = '') => { ctx.refresh(); go(ctx, name, extra); };

  /* ------------------------------------------------------------- actions */

  const declareSplitModal = (existing = null) => {
    const levelOptions = ['frontline', 'manager', 'director', 'exec', 'chief', 'ic'];
    const level = h('select', { class: 'input', id: 'om-level' },
      ...levelOptions.map((key) => h('option', { value: key, ...(existing?.level === key ? { selected: true } : {}) }, key)));
    const fn = h('input', { class: 'input', id: 'om-fn', type: 'text', value: existing?.functionKey || 'all', maxlength: '60', 'aria-describedby': 'om-fn-hint' });
    const fields = {};
    for (const [key, label] of Object.entries(OPERATING_MODEL_WORK_TYPES)) {
      fields[key] = h('input', {
        class: 'input', type: 'number', min: '0', max: '100', step: '1', id: `om-${key}`,
        value: String(existing ? existing[key] : { altitude: 30, displaced: 35, abstention: 15, coordination: 20 }[key]),
      });
    }
    const total = h('p', { class: 'muted', id: 'om-total', 'aria-live': 'polite' });
    const recompute = () => {
      const sum = Object.values(fields).reduce((acc, input) => acc + (Number(input.value) || 0), 0);
      total.textContent = `Declared total: ${Math.round(sum * 10) / 10}%. ${Math.abs(sum - 100) < 0.5 ? 'Balanced.' : 'It will be rescaled to 100 and the rescale is reported — a reader who typed 95 remembers their own intent better than a normalizer does.'}`;
    };
    Object.values(fields).forEach((input) => input.addEventListener('input', recompute));
    recompute();
    const body = h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One split per level, not per person', body: 'The subject of this declaration is a POSITION DESIGN. Two people in the same seat share the same design; measuring it per person would turn this screen into an attendance clock, which it deliberately is not.' }),
      h('label', { class: 'field' }, h('span', null, 'Level'), level),
      h('label', { class: 'field' }, h('span', null, 'Function / unit'), fn, h('span', { class: 'muted', id: 'om-fn-hint' }, 'A free label such as “engineering”, “store ops” or “all”. A split applies to the people at that level whose role or team matches the label, or to everyone at that level when it is “all”.')),
      h('p', { class: 'muted' }, 'The four work types must be mutually exclusive. Their sum is what the model charges; it does not have to be 100 when you type it, but it will be normalised to 100.'),
      ...Object.entries(OPERATING_MODEL_WORK_TYPES).map(([key, label]) => h('label', { class: 'field' }, h('span', null, label), fields[key])),
      total,
      h('p', { class: 'muted' }, OPERATING_MODEL_LIMITS_DOCS.utilization),
    );
    openModal({
      title: existing ? 'Re-declare the work-type split' : 'Declare a work-type split',
      description: 'Four numbers, one level. This is the only input the model needs from a human.',
      body,
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const payload = { level: level.value, functionKey: fn.value.trim() || 'all' };
            for (const key of Object.keys(fields)) payload[key] = Number(fields[key].value);
            if (existing) payload.id = existing.id;
            const res = ctx.api.omDeclareSplit(payload);
            toast(res.ok ? 'Split declared. Every position at that level is now measured.' : (res.error || 'Not declared.'), res.ok ? 'good' : 'bad');
            if (res.ok) { closeAllModals(); refreshTo('norms'); }
          },
        }, 'Declare'),
      ],
    });
  };

  const declareEdgeModal = () => {
    const from = h('select', { class: 'input', id: 'om-edge-from' },
      ...uniquePositions.map((id) => h('option', { value: id }, nameOf(id))));
    const to = h('select', { class: 'input', id: 'om-edge-to' },
      ...uniquePositions.map((id) => h('option', { value: id }, nameOf(id))));
    const weight = h('input', { class: 'input', type: 'number', min: '1', max: '5', value: '2', id: 'om-edge-w' });
    const kind = h('select', { class: 'input', id: 'om-edge-kind' },
      ...['sync', 'handoff', 'review', 'escalation'].map((k) => h('option', { value: k }, k)));
    const cross = h('input', { type: 'checkbox', id: 'om-edge-cross' });
    const body = h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared, never inferred', body: 'This module has no access to a calendar and would not use one if it did. A collaboration edge exists in this model only because a person read it off their own week.' }),
      h('label', { class: 'field' }, h('span', null, 'From'), from),
      h('label', { class: 'field' }, h('span', null, 'To'), to),
      h('label', { class: 'field' }, h('span', null, 'Kind'), kind),
      h('label', { class: 'field' }, h('span', null, 'Weight (1 = light, 5 = the meeting that eats the week)'), weight),
      h('label', { class: 'field om-inline' }, h('span', null, 'Crosses a unit boundary'), cross),
      h('p', { class: 'muted' }, `Priced at the declared ${norms.omEdgeMinutes} minutes per edge per cycle.`),
    );
    openModal({
      title: 'Declare a recurring conversation',
      description: 'One edge per real relationship — duplicates double the seam cost.',
      body,
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.omDeclareEdge({ fromId: from.value, toId: to.value, weight: Number(weight.value), kind: kind.value, unitCrossing: cross.checked });
            toast(res.ok ? 'Edge declared.' : (res.error || 'Not declared.'), res.ok ? 'good' : 'bad');
            if (res.ok) { closeAllModals(); refreshTo('coupling'); }
          },
        }, 'Declare edge'),
      ],
    });
  };

  const priceItemModal = () => {
    const name = h('input', { class: 'input', type: 'text', id: 'om-item-name', maxlength: '180' });
    const hours = h('input', { class: 'input', type: 'number', min: '0', step: '0.5', id: 'om-item-hours' });
    const cycle = h('input', { class: 'input', type: 'number', min: '0.5', step: '0.5', id: 'om-item-cycle' });
    const body = h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Two numbers, and a real queue', body: 'Weekly hours and how long one of these actually takes start to finish. Little’s law (1961) then prices the work-at-once as WIP × cycle time, so “do fewer things at once” stops being advice and becomes arithmetic.' }),
      h('label', { class: 'field' }, h('span', null, 'Item'), name),
      h('label', { class: 'field' }, h('span', null, 'Hours per week this consumes'), hours),
      h('label', { class: 'field' }, h('span', null, 'Measured cycle time (days)'), cycle),
    );
    openModal({
      title: 'Price a portfolio item',
      description: 'A timed obligation, not a task list entry.',
      body,
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.omPriceItem({ id: name.value ? `omd-${name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}` : undefined, name: name.value, weeklyHours: Number(hours.value), cycleDays: Number(cycle.value) });
            toast(res.ok ? 'Item priced.' : (res.error || 'Not priced.'), res.ok ? 'good' : 'bad');
            if (res.ok) { closeAllModals(); refreshTo('levers'); }
          },
        }, 'Price it'),
      ],
    });
  };

  const runScan = () => {
    const res = ctx.api.operatingModelScan();
    toast(res.ok ? `Reconciled the operating model. ${res.propagations?.length || 0} propagation(s).` : (res.error || 'Scan failed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const res = ctx.api.operatingModelBriefText();
    if (!res.ok) { toast(res.error || 'Brief unavailable', 'bad'); return; }
    const ok = downloadText({ filename: `leados-operating-model-${dayKey(now)}.md`, text: res.text, mime: 'text/markdown;charset=utf-8' });
    toast(ok ? 'Identity-free brief downloaded' : 'Download not available — open the Brief panel and copy the text', ok ? 'good' : 'warn');
  };

  const exportCsv = () => {
    const res = ctx.api.exportCSV('operating-model');
    if (res.ok && res.csv) {
      const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'Aggregate-only CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
    } else toast(res.error || 'Export failed', 'bad');
  };

  /* -------------------------------------------------------------- panels */

  function spansPanel() {
    const rows = report.stations
      .filter((s) => report.seat?.fullAccess !== false || !report.detailWithheld || s.nodeId === report.seat?.id)
      .slice(0, 60);

    const stationCards = rows.length
      ? rows.map((station) => card({
        title: report.detailWithheld && station.nodeId !== report.seat?.id ? `${station.altitudeLabel} position` : station.name,
        subtitle: `${station.altitudeLabel} · ${station.directReports} direct report(s) · ${station.measured ? station.splitBasis : 'no declared split'}`,
        actions: [
          station.overCeiling ? badge('over ceiling', 'bad') : null,
          station.continuity ? badge('continuity trap', 'warn', `Below the ${station.continuityFloor}-report floor: a hire makes this worse`) : null,
          badge(`${station.bandVerdict} span`, station.bandVerdict === 'band' ? 'good' : 'warn', `Declared band ${station.spanBand[0]}–${station.spanBand[1]}`),
        ].filter(Boolean),
        body: station.measured
          ? h('div', { class: 'stack' },
            utilisationBar(station.utilisation, norms.utilisationCeiling),
            h('div', { class: 'om-workgrid' },
              ...Object.entries(station.types).map(([key, value]) => h('div', { class: 'om-workcell' },
                h('span', { class: 'om-workcell-pct' }, `${value}%`),
                h('span', { class: 'muted' }, OPERATING_MODEL_WORK_TYPES[key].split('—')[0].trim())))),
            h('div', { class: 'stat-grid om-statgrid' },
              stat({ label: 'Committed', value: `${station.committed} h`, hint: `of ${station.capacity} h designed · ${station.headroom >= 0 ? `${station.headroom} h headroom` : `${Math.abs(station.headroom)} h over`}` }),
              stat({ label: 'Below its own altitude', value: `${station.displacedHours} h`, hint: `${showPct(station.displacedPct)} of design` }),
              stat({ label: 'Measured overhead', value: `${station.overhead} h`, hint: `${station.coordinationHours} h cadence + ${station.supervisionHours} h supervising ${station.openDelegations} open delegation(s)` }),
              stat({
                label: 'Congruence',
                value: station.congruence?.holds ? 'holds' : 'does not hold',
                hint: station.congruence ? `${station.congruence.deepHours} h at its own altitude against a ${station.congruence.requiredHours} h declared half. ${station.congruence.basis}` : 'not measurable',
                tone: station.congruence?.holds ? 'good' : 'bad',
              })),
            h('p', { class: 'muted' }, `${station.demandItems} open obligation(s) are owned at this span, ${station.demandDisplaced} of them old enough that their age places them at a higher altitude than the owner. That is displacement measured from the record's own clock, not from a self-report.`),
          )
          : h('div', { class: 'stack' },
            banner({ tone: 'info', title: 'No design declared for this level', body: `Nothing is measured for a position with no declared work-type split — the model refuses rather than guessing a plausible split. Declare ${OPERATING_MODEL_LIMITS_DOCS.cellFloor ? 'one' : 'a'} split for ${station.altitudeLabel} on the Norms panel and this row fills in.` })),
      }))
      : [emptyState({ title: 'No positions on the roster yet', body: 'Add people and their reporting lines, then declare a work-type split for each level. A position with no design is not measured, it is not scored as good or bad.' })];

    return h('div', { class: 'stack' },
      report.detailWithheld
        ? banner({ tone: 'warn', title: 'Aggregate view at this altitude', body: `A ${report.seat?.label || 'senior'} seat reads utilisation by span and by altitude, not the design of a distant position. ${OPERATING_MODEL_LIMITS_DOCS.utilization}` })
        : null,
      h('div', { class: 'stat-grid' },
        stat({ label: 'Positions modelled', value: String(report.positions), hint: `${report.measuredPositions} measured · ${report.unmeasuredPositions} awaiting a declared split` }),
        stat({ label: 'Committed vs designed', value: showUtil(report.totals.utilisation === null ? null : report.totals.utilisation * 100), hint: `${report.totals.committedHours} h committed against ${report.totals.capacityHours} h of designed capacity`, tone: report.totals.utilisation > 1 ? 'bad' : '' }),
        stat({ label: 'Below its own altitude', value: `${report.totals.displacedHours} h`, hint: `${showPct(report.totals.displacedPct)} of all designed capacity is spent below the level the position exists at` }),
        stat({ label: 'Over the ceiling', value: String(report.totals.overCeilingN), hint: `positions above the declared ${norms.omUtilizationCeilPct}% utilisation ceiling` }),
      ),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => declareSplitModal() }, 'Declare a work-type split'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile')),
      card({
        title: 'By altitude',
        subtitle: 'Exact partitioning: a position is counted once, at its own altitude, and inherited by every level above by addition',
        body: table({
          caption: 'Operating model by altitude',
          columns: [
            { label: 'Altitude', render: (r) => r.label },
            { label: 'Positions', render: (r) => `${r.positions}` },
            { label: 'Committed', render: (r) => `${r.committedHours} h` },
            { label: 'Utilisation', render: (r) => (r.utilisation === null ? 'refused' : showUtil(r.utilisation * 100)) },
            { label: 'Displaced', render: (r) => (r.displacedPct === null ? 'refused' : showPct(r.displacedPct)) },
            { label: 'Over ceiling', render: (r) => String(r.congestedN) },
          ],
          rows: report.byAltitude,
          emptyMessage: 'No measured position yet.',
        }),
      }),
      report.continuity.fragile.length
        ? card({
          title: 'The continuity trap',
          subtitle: `${report.continuity.fragile.length} span(s) below the ${norms.omContinuityFloor}-report floor — these look light and cannot be relieved by a hire`,
          body: h('div', { class: 'stack' },
            banner({ tone: 'warn', title: 'Relief that creates a single point of failure is not relief', body: 'Below the declared floor, one absence stops the work. Every "add a head" answer to a thin span is therefore a design error wearing a solution’s clothes. The lever engine refuses to price a hire here and says why.' }),
            table({
              caption: 'Spans below the continuity floor',
              columns: [
                { label: 'Span', render: (r) => r.name },
                { label: 'Altitude', render: (r) => r.altitudeLabel },
                { label: 'Reports', render: (r) => `${r.directReports} of ${r.floor}` },
                { label: 'Utilisation', render: (r) => showUtil(r.utilisation === null ? null : r.utilisation * 100) },
                { label: 'Reading', render: (r) => 'looks light, is fragile' },
              ],
              rows: report.continuity.fragile,
            })),
        })
        : null,
      card({
        title: 'Position designs',
        subtitle: 'Every figure is a property of a design. There is no ranking of people on this screen, and none is computed.',
        body: h('div', { class: 'stack' }, ...stationCards),
      }),
    );
  }

  function loadPanel() {
    const congestion = report.congestion;
    const rows = congestion.map((row) => ({
      ...row,
      firstLabel: row.first ? `${row.first.leverLabel} — ${row.first.hours} h/week` : 'no priced lever clears the floor',
    }));
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The line, not the person', body: `Utilisation above the declared ${norms.omUtilizationCeilPct}% ceiling is a queue, not a plan (Kingman 1961): past that point an extra hour of commitment buys more waiting than work. The number is a property of the DESIGN and is printed with the ceiling it is measured against.` }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Spans over the ceiling', value: String(congestion.length), hint: `of ${report.measuredPositions} measured position(s)`, tone: congestion.length ? 'bad' : 'good' }),
        stat({ label: 'Diagnosis: over-routed', value: String(congestion.filter((r) => r.diagnosis === 'over-routed').length), hint: 'more work routed up than displaced down — a decision-rights defect, not a staffing one' }),
        stat({ label: 'Diagnosis: over-spanned', value: String(congestion.filter((r) => r.diagnosis === 'over-spanned').length), hint: `direct span above the declared ${norms.spanBand[0]}–${norms.spanBand[1]} band (Mann 1965: contingent on variety, so a declared convention)` }),
        stat({ label: 'Diagnosis: over-committed', value: String(congestion.filter((r) => r.diagnosis === 'over-committed').length), hint: 'the work itself is the constraint' }),
      ),
      card({
        title: 'Where the line is broken',
        subtitle: 'The cheapest available structural answer to each constraint, priced — and the answer is not automatically a hire',
        body: rows.length
          ? table({
            caption: 'Congested spans and their first structural answer',
            columns: [
              { label: 'Span', render: (r) => (report.detailWithheld ? `${r.altitudeLabel} · ${targetAltFor(r.rank)}` : r.name) },
              { label: 'Altitude', render: (r) => r.altitudeLabel },
              { label: 'Utilisation', render: (r) => showUtil(r.utilisation === null ? null : r.utilisation * 100) },
              { label: 'Over by', render: (r) => `${r.overHours} h` },
              { label: 'Diagnosis', render: (r) => r.diagnosis.replace('-', ' ') },
              { label: 'First answer', render: (r) => r.firstLabel },
            ],
            rows,
            emptyMessage: 'No span is over its own declared week — nothing is congested on the current declarations.',
          })
          : emptyState({ title: 'The line is balanced', body: 'No measured position is committed beyond its own declared week. If that surprises you, check the norms on the Norms panel: the model can only be as honest as the hours it was given.' }),
      }),
      congestion.length
        ? card({
          title: 'One span at a time',
          subtitle: 'Each of these opens one governed design decision per ISO week — for the span that can author the change',
          body: h('div', { class: 'stack' }, ...congestion.slice(0, 6).map((row) => card({
            title: report.detailWithheld ? `${row.altitudeLabel} position` : row.name,
            subtitle: `utilisation ${showUtil(row.utilisation === null ? null : row.utilisation * 100)} · ${row.overHours} h over a ${row.capacity} h design`,
            actions: [badge(row.diagnosis.replace('-', ' '), row.diagnosis === 'over-routed' ? 'warn' : 'bad')],
            body: h('div', { class: 'stack' },
              utilisationBar(row.utilisation, norms.utilisationCeiling),
              row.continuity ? banner({ tone: 'warn', title: 'Continuity constraint', body: 'This span is below the continuity floor, so a hire is excluded from its options by construction.' }) : null,
              ...row.options.map((option, index) => h('div', { class: 'om-lever-row' },
                h('div', { class: 'om-lever-head' },
                  h('strong', null, `${index + 1}. ${option.leverLabel}`),
                  badge(`${option.hours} h/week`, 'good')),
                h('p', { class: 'muted' }, option.reason),
                h('p', { class: 'muted' }, `Method: ${OPERATING_MODEL_LEVERS.find((l) => l.key === option.leverKey)?.measure || ''}`)))),
          })))
        })
        : null,
      card({
        title: 'Attributable labour cost',
        subtitle: 'A share of a declared envelope — never a salary',
        body: h('div', { class: 'stack' },
          h('div', { class: 'stat-grid' },
            stat({ label: 'Attributable cost', value: `${report.cost.totalCost} ${report.cost.currency}`, hint: `${report.cost.totalHours} h × ${report.cost.ratePerHour} ${report.cost.currency}/h declared rate` }),
            stat({ label: 'Of which below latitude', value: `${report.cost.belowLatitudeCost} ${report.cost.currency}`, hint: `${report.cost.belowLatitudeHours} h/week spent below the position's own altitude` }),
            stat({ label: 'Cost of a routing defect', value: `${report.totals.abstentionHours} h`, hint: 'work that exists only because a call is not trusted below' })),
          h('p', { class: 'muted' }, report.cost.basis)),
      }),
    );
  }

  function couplingPanel() {
    const coupling = report.coupling;
    const hub = coupling.busiestName;
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Graicunas, made computable', body: `A span of n direct reports carries n + 2·n(n−1)/2 distinct relationships (Graicunas 1933). With the declarations on record that is ${coupling.combinatorial} possible relationships and ${coupling.edgeCount} declared ones — and a ratio above 1.0 would mean more crossing than the reported structure explains.` }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Declared edges', value: String(coupling.edgeCount), hint: `${coupling.weeklyHours} h/week of seam cost at the declared ${norms.omEdgeMinutes} min per edge` }),
        stat({ label: 'Cross a unit boundary', value: coupling.crossUnitPct === null ? 'refused' : showPct(coupling.crossUnitPct), hint: coupling.crossUnitRefused || `${coupling.crossUnitN} of ${coupling.edgeCount} edges; 50% or more is usually a boundary drawn in the wrong place` }),
        stat({ label: 'Combinatorial ceiling', value: String(coupling.combinatorial), hint: 'Graicunas relationships implied by the direct spans on record' }),
        stat({ label: 'Busiest node', value: hub ? (report.detailWithheld ? 'a span' : hub) : 'no edge', hint: hub ? `${coupling.busiestEdgeCount} declared edge(s) — a concentration, not a compliment` : 'declare the conversations the span actually has' }),
      ),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: declareEdgeModal }, 'Declare a conversation'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile')),
      card({
        title: 'The seams',
        subtitle: 'A boundary drawn through one judgement, not between two, is usually cheaper than one more meeting',
        body: table({
          caption: 'Declared collaboration edges',
          columns: [
            { label: 'From', render: (r) => (report.detailWithheld ? 'a span' : nameOf(r.fromId)) },
            { label: 'To', render: (r) => (report.detailWithheld ? 'a span' : nameOf(r.toId)) },
            { label: 'Kind', render: (r) => r.kind },
            { label: 'Weight', render: (r) => `${r.weight} × ${norms.omEdgeMinutes} min` },
            { label: 'Crosses unit', render: (r) => (r.unitCrossing ? 'yes' : 'no') },
            { label: 'Remove', render: (r) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => {
              const res = ctx.api.omRemoveEdge(r.id);
              toast(res.ok ? 'Edge removed.' : (res.error || 'Not removed.'), res.ok ? 'good' : 'bad');
              if (res.ok) ctx.refresh();
            } }, 'Remove') },
          ],
          rows: coupling.edges,
          emptyMessage: 'No conversation declared yet. The model cannot price a seam it was not told about.',
        }),
      }),
      card({
        title: 'The skip rule',
        subtitle: 'Reading discretion rises with altitude, so the model amortises, it does not expose',
        body: h('div', { class: 'stack' },
          h('p', null, coupling.skipped.rule),
          table({
            caption: 'Spans by depth',
            columns: [
              { label: 'Depth', render: (r) => String(r.depth) },
              { label: 'Spans', render: (r) => String(r.spans) },
              { label: 'Direct reports', render: (r) => String(r.reports) },
              { label: 'Rate', render: (r) => (r.spans < coupling.skipped.floor ? 'withheld below floor' : 'printed') },
            ],
            rows: coupling.skipped.rows,
            emptyMessage: 'No spans on record.',
          })),
      }),
      card({
        title: 'One change, propagated in waves',
        subtitle: `Asking "who actually feels this", one level at a time — at the declared ${norms.omCrossWavePct}% survival per wave`,
        body: h('div', { class: 'stack' },
          h('p', null, `Origin: ${report.detailWithheld ? 'your span' : report.waves.originName} · ${report.waves.hours} h of change.`),
          table({
            caption: 'Change waves',
            columns: [
              { label: 'Wave', render: (r) => String(r.wave) },
              { label: 'Hours reaching this wave', render: (r) => `${r.absorbedHours} h` },
              { label: 'Spans', render: (r) => r.rows.length ? r.rows.map((row) => (report.detailWithheld ? row.altitudeLabel : row.name)).join(', ') : '—' },
            ],
            rows: report.waves.waves,
            emptyMessage: 'No change declared to propagate.',
          }),
          h('p', { class: 'muted' }, report.waves.note)),
      }),
    );
  }

  function leversPanel() {
    const rows = report.levers;
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The cheapest structural relief, ranked by arithmetic', body: 'Ordered by hours relieved per unit of design cost, with the continuity-safe answers first. The ordering is mathematical, not editorial: it does not care who proposed the idea, and no option names a person.' }),
      card({
        title: 'The lever book',
        subtitle: `${rows.length} priced lever(s) across ${new Set(rows.map((r) => r.nodeId)).size} span(s)`,
        body: rows.length
          ? table({
            caption: 'Structural levers ranked by relief per unit of effort',
            columns: [
              { label: 'Lever', render: (r) => r.leverLabel },
              { label: 'Family', render: (r) => r.family },
              { label: 'Span', render: (r) => (report.detailWithheld ? r.altitudeLabel : r.nodeName) },
              { label: 'Relief', render: (r) => `${r.hours} h/week` },
              { label: 'Design cost', render: (r) => r.effort },
              { label: 'Yield', render: (r) => `${r.yield} h / point` },
              { label: 'Continuity-safe', render: (r) => (r.safe ? 'yes' : 'no — would create a single point of failure') },
            ],
            rows,
            emptyMessage: 'No lever is priced yet, because no position carries a declared split.',
          })
          : emptyState({ title: 'Nothing to price', body: 'Declare a work-type split for a level and every lever prices itself against it.' }),
      }),
      card({
        title: 'The library',
        subtitle: 'Nine named patterns, each with the measured unit it moves — a recommendation is a category of design change, never a person to move',
        body: h('div', { class: 'stack' },
          ...OPERATING_MODEL_LEVERS.map((lever) => h('div', { class: 'om-lever-row' },
            h('div', { class: 'om-lever-head' },
              h('strong', null, lever.label),
              badge(lever.family, 'neutral'),
              badge(lever.effort, 'neutral')),
            h('p', null, lever.measure),
            h('p', { class: 'muted' }, `Moves: ${lever.unit}`)))),
      }),
      card({
        title: 'Price a portfolio item',
        subtitle: 'The bridge to the rest of the workspace: measured cycle time makes an item a timed obligation',
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted' }, 'The other terminals price *waiting* and *decision latency*. This one prices the work-at-once those numbers rest on. Two numbers per item is all Little’s law needs.'),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: priceItemModal }, 'Price an item')),
          table({
            caption: 'Priced portfolio items',
            columns: [
              { label: 'Item', render: (r) => r.name },
              { label: 'Hours / week', render: (r) => (r.weeklyHours === null ? 'undeclared' : `${r.weeklyHours} h`) },
              { label: 'Cycle time', render: (r) => (r.cycleDays === null ? 'undeclared' : `${r.cycleDays} d`) },
              { label: 'Status', render: (r) => r.status },
            ],
            rows: (state.omDecisions || []).slice(0, 40),
            emptyMessage: 'No priced item yet.',
          })),
      }),
    );
  }

  function normsPanel() {
    const input = (id, value, min, max, step = '0.5') => h('input', { class: 'input', type: 'number', id, min: String(min), max: String(max), step, value: String(value) });
    const deep = input('om-n-deep', norms.omDeepWorkHoursPerDay, 0.5, 12);
    const days = input('om-n-days', norms.omWorkDaysPerWeek, 1, 7, '1');
    const coord = input('om-n-coord', norms.omCoordinationHoursPerWeek, 0, 12);
    const deleg = input('om-n-deleg', norms.omDelegationHoursPerWeek, 0, 24);
    const abst = input('om-n-abst', norms.omAbstentionHoursPerWeek, 0, 24);
    const edge = input('om-n-edge', norms.omEdgeMinutes, 5, 240, '5');
    const ceil = input('om-n-ceil', norms.omUtilizationCeilPct, 50, 100, '1');
    const floor = input('om-n-floor', norms.omContinuityFloor, 1, 8, '1');
    const cell = input('om-n-cell', norms.omCellFloor, 1, 12, '1');
    const cross = input('om-n-cross', norms.omCrossWavePct, 0, 100, '1');
    const auto = h('input', { type: 'checkbox', id: 'om-n-auto', ...(norms.omAutoPropagate ? { checked: true } : {}) });

    return h('div', { class: 'stack' },
      card({
        title: 'The inputs the model is measured by',
        subtitle: 'Every one is declared, printed and editable — a model whose assumptions are hidden is a model you have to trust',
        body: h('div', { class: 'stack' },
          h('div', { class: 'om-norm-grid' },
            h('label', { class: 'field' }, h('span', null, 'Effective hours per day'), deep, h('span', { class: 'muted' }, 'Not contracted hours — the hours that are actually usable. 0.5–12.')),
            h('label', { class: 'field' }, h('span', null, 'Declared days per week'), days, h('span', { class: 'muted' }, `= ${norms.weeklyCapacity} h/week per position. ${norms.capacityBasis}.`)),
            h('label', { class: 'field' }, h('span', null, 'Hours per direct report (cadence)'), coord, h('span', { class: 'muted' }, 'The 1:1 and the team meeting, per report per week. This is a measured obligation, not overhead nobody claims.')),
            h('label', { class: 'field' }, h('span', null, 'Hours per open delegation'), deleg, h('span', { class: 'muted' }, 'The supervision that comes back with delegated work.')),
            h('label', { class: 'field' }, h('span', null, 'Hours per routed decision, above'), abst, h('span', { class: 'muted' }, 'The SMED distinction lives here: a 14-minute triage is the job; a four-hour document is a routing defect.')),
            h('label', { class: 'field' }, h('span', null, 'Minutes per collaboration edge'), edge, h('span', { class: 'muted' }, 'One recurring conversation per cycle, priced.')),
            h('label', { class: 'field' }, h('span', null, 'Utilisation ceiling (%)'), ceil, h('span', { class: 'muted' }, OPERATING_MODEL_LIMITS_DOCS.utilization)),
            h('label', { class: 'field' }, h('span', null, 'Continuity floor (reports)'), floor, h('span', { class: 'muted' }, 'Below this a span cannot survive one absence, so it cannot be relieved by a hire.')),
            h('label', { class: 'field' }, h('span', null, 'Cell floor (observations)'), cell, h('span', { class: 'muted' }, OPERATING_MODEL_LIMITS_DOCS.cellFloor)),
            h('label', { class: 'field' }, h('span', null, 'Wave survival (%)'), cross, h('span', { class: 'muted' }, 'How much of a change reaches the next level.')),
            h('label', { class: 'field om-inline' }, h('span', null, 'Automatic propagation'), auto, h('span', { class: 'muted' }, 'When off, only an explicit reconcile runs the rules.')),
          ),
          h('div', { class: 'row-actions' },
            h('button', {
              class: 'btn btn-primary',
              type: 'button',
              onClick: () => {
                const res = ctx.api.omSetNorms({
                  omDeepWorkHoursPerDay: Number(deep.value),
                  omWorkDaysPerWeek: Number(days.value),
                  omCoordinationHoursPerWeek: Number(coord.value),
                  omDelegationHoursPerWeek: Number(deleg.value),
                  omAbstentionHoursPerWeek: Number(abst.value),
                  omEdgeMinutes: Number(edge.value),
                  omUtilizationCeilPct: Number(ceil.value),
                  omContinuityFloor: Number(floor.value),
                  omCellFloor: Number(cell.value),
                  omCrossWavePct: Number(cross.value),
                  omAutoPropagate: auto.checked,
                });
                toast(res.ok ? 'Norms saved. Every figure moved together.' : (res.error || 'Not saved.'), res.ok ? 'good' : 'bad');
                if (res.ok) ctx.refresh();
              },
            }, 'Save norms'))),
      }),
      card({
        title: 'Declared work-type splits',
        subtitle: 'One row per level — the only thing a human has to add before the model can say anything',
        body: h('div', { class: 'stack' },
          report.splits.length
            ? table({
              caption: 'Declared work types',
              columns: [
                { label: 'Level', render: (r) => r.level || '—' },
                { label: 'Function', render: (r) => r.functionKey },
                { label: 'At its altitude', render: (r) => `${r.altitude}%` },
                { label: 'Below it', render: (r) => `${r.displaced}%` },
                { label: 'Routed up', render: (r) => `${r.abstention}%` },
                { label: 'Coordination', render: (r) => `${r.coordination}%` },
                { label: 'Declared', render: (r) => r.declaredOn || '—' },
                { label: 'Actions', render: (r) => h('div', { class: 'row-actions' },
                  h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => declareSplitModal(r) }, 'Re-declare'),
                  h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => {
                    const res = ctx.api.omRemoveSplit(r.id);
                    toast(res.ok ? 'Split removed. Positions at that level are unmeasured again.' : (res.error || 'Not removed.'), res.ok ? 'warn' : 'bad');
                    if (res.ok) ctx.refresh();
                  } }, 'Remove')) },
              ],
              rows: report.splits,
            })
            : emptyState({ title: 'No split declared', body: 'Four percentages for one level is the entire input. Until then the model refuses every figure rather than inventing a plausible split.' }),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => declareSplitModal() }, 'Declare a split'))),
      }),
      card({
        title: 'Input gates — gauge R&R on the model itself',
        subtitle: `${report.rnr.passed} of ${report.rnr.total} gates pass`,
        actions: [badge(report.rnr.passed === report.rnr.total ? 'all pass' : 'refused', report.rnr.passed === report.rnr.total ? 'good' : 'warn')],
        body: h('div', { class: 'stack' },
          h('p', null, report.rnr.verdict),
          ...report.rnr.results.map((gate) => h('div', { class: `om-gate om-gate-${gate.pass ? 'pass' : 'fail'}` },
            h('div', { class: 'om-lever-head' },
              h('strong', null, `${gate.pass ? 'PASS' : 'REFUSED'} — ${gate.label}`),
              badge(`${gate.measuredN} / ${gate.floor}`, gate.pass ? 'good' : 'warn')),
            h('p', null, gate.verdict),
            gate.fix ? h('p', { class: 'muted' }, `Cheapest fix: ${gate.fix}`) : null))),
      }),
      card({
        title: 'What this is not',
        body: h('div', { class: 'stack' },
          h('p', null, OPERATING_MODEL_LIMITS_DOCS.utilization),
          h('p', null, OPERATING_MODEL_LIMITS_DOCS.hoursPerEffortDay),
          h('p', null, OPERATING_MODEL_LIMITS_DOCS.span)),
      }),
      card({
        title: 'Honesty panel',
        body: h('div', { class: 'stack' },
          h('p', null, 'There is no attendance clock here. This module never reads a calendar, a badge, a keystroke or a door. Capacity comes from two declared numbers, and the three prices that turn records into hours (cadence, delegation, abstention) are declared conventions that are printed beside every figure they produce.'),
          h('p', null, 'The workspace cannot prove how long a conversation took. It can prove which records exist and which decisions are waiting on whom. Where the first is needed, the module says so instead of pretending the second is the first.'),
          h('p', null, 'Nothing here ranks a person. Utilization, congruence, connectivity are properties of a POSITION DESIGN, and a reader who wants a performance score will find no rank, no percentile and no comparative roster.'),
          h('p', { class: 'muted' }, 'Local workspace, not an HRIS: no connector, no sync, no employment-law claim. Local seat selection is an auditable declaration, not authentication.')),
      }),
    );
  }

  function briefPanel() {
    const res = ctx.api.operatingModelBriefText();
    return h('div', { class: 'stack' },
      card({
        title: 'Identity-free brief',
        subtitle: 'Counts, rates, positions and gates — no person, name, title or individual figure survives this boundary',
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief }, 'Download brief'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportCsv }, 'Aggregate CSV'),
        ],
        body: h('pre', { class: 'om-brief', tabindex: '0', 'aria-label': 'Identity-free operating model brief' }, res.ok ? res.text : (res.error || 'Brief unavailable')),
      }),
      card({
        title: 'The disclosure ladder',
        body: h('div', { class: 'stack' },
          h('p', null, `Frontline and manager: ${'span detail — its own span’s design.'}`),
          h('p', null, OPERATING_MODEL_DISCLOSURE_LINES.unit),
          h('p', null, OPERATING_MODEL_DISCLOSURE_LINES.skip),
          h('p', null, `Executive and chief: ${'attributable labour cost, abstention flow out of large units, and first-design-decision risk. Individual position detail never climbs.'}`),
          h('p', { class: 'muted' }, 'A seat above director rank reads span and altitude aggregates on this screen; the position detail is replaced, and the replacement is stated rather than silently applied.')),
      }),
    );
  }

  const panels = {
    spans: spansPanel,
    load: loadPanel,
    coupling: couplingPanel,
    levers: leversPanel,
    norms: normsPanel,
    brief: briefPanel,
  };

  const LABELS = { spans: 'Spans', load: 'Load', coupling: 'Coupling', levers: 'Levers', norms: 'Norms', brief: 'Brief' };

  return h('div', { class: 'view view-operating-model' },
    pageHeader({
      eyebrow: 'Operating model',
      title: 'The shape of the seat, not the person in it',
      subtitle: `Every other terminal asks what a leader should do. This one measures the position they are doing it from: how much of the week sits below its own altitude, what a promised hand-up costs, and which structural change relieves the constraint cheapest.${report.seat ? ` Operating as ${report.seat.label}.` : ''}`,
      actions: [
        badge(`${report.measuredPositions}/${report.positions} measured`, report.measuredPositions ? 'neutral' : 'warn'),
        badge(`ceiling ${norms.omUtilizationCeilPct}%`, 'neutral'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => declareSplitModal() }, 'Declare a split'),
      ],
      meta: h('span', { class: 'muted' }, `Updated ${formatDate(report.updatedOn)} · ${report.totals.overCeilingN} over ceiling · ${report.totals.fragileN} fragile span(s) · design ${report.fingerprint}`),
    }),
    tabs({ items: OPERATING_MODEL_PANELS.map((key) => ({ key, label: LABELS[key] })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Operating model sections' }),
    panels[panel](),
  );
}

const OPERATING_MODEL_DISCLOSURE_LINES = {
  unit: 'Director: span rates and the bottleneck ranking — which span is the constraint, not what one person did this week.',
  skip: 'Every level above the reader’s span is represented by ONE aggregate row. A span three levels down is an amortised aggregate, not a hyperlink, so the reading cannot be used as a way of learning a distant team’s diary.',
};
