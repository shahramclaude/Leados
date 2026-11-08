/**
 * app/views/seat.js — the Altitude Lens (`#/seat`, ADR-0076, Session 116).
 *
 * ONE surface, five genuinely different operating pictures. ADR-0075 rejected
 * five duplicated dashboards ("it makes the hierarchy a theme rather than a
 * model"); this view honours that rejection: altitude is a PARAMETER, not five
 * apps. But §0.3 still requires that a frontline lead is not buried in CEO
 * portfolio analytics and a CEO is not digging through shift-coaching notes —
 * so the panel content, the disclosure ladder, the duties and the one-click
 * routes are all derived from the seat's rank, and the nav itself is filtered
 * by the same permission engine in main.js.
 *
 * Five panels:
 *   This seat     the acting position, its altitude, its duties and the exact
 *                 routes it may open — minimal clicks, no dead ends.
 *   Roll-up       drill UP through every ancestor span and drill DOWN into the
 *                 child spans, with pooled vs mean-of-unit rates printed side
 *                 by side and composition sensitivity refused as a false story.
 *   Boundary      the transparent enforcement ledger: every withheld or denied
 *                 record, with the printed reason. An access control that
 *                 cannot explain its own refusal is a broken one.
 *   Work          the altitude's own disclosure ladder for open items.
 *   Method        the frameworks, conventions and refusals, stated once.
 *
 * Pure rendering from `ctx.api.seatRead()`; every write goes through actions.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { dayKey, formatDate } from '../core/time.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { ALTITUDES, RECORD_CLASSES, SEAT_PREMISE, altitudeByKey } from '../core/domain/seatRegistry.js';

const PANELS = [
  { key: 'overview', label: 'This seat' },
  { key: 'rollup', label: 'Roll-up & drill-down' },
  { key: 'boundary', label: 'Access boundary' },
  { key: 'work', label: 'Work in this span' },
  { key: 'method', label: 'Method' },
];
const PANEL_ALIAS = {
  seat: 'overview', altitude: 'overview', duties: 'overview', home: 'overview',
  rollup: 'rollup', 'roll-up': 'rollup', drill: 'rollup', 'drill-down': 'rollup',
  heat: 'rollup', heatmap: 'rollup', rates: 'rollup',
  boundary: 'boundary', access: 'boundary', permissions: 'boundary',
  ledger: 'boundary', withheld: 'boundary', denied: 'boundary',
  work: 'work', items: 'work', disclosure: 'work',
  method: 'method', about: 'method', refusals: 'method',
};
const ALTITUDE_TONE = { frontline: 'info', manager: 'neutral', director: 'caution', exec: 'warn', chief: 'bad' };

function resolvePanel(query) {
  const requested = query?.get?.('panel');
  if (!requested) return 'overview';
  const key = PANEL_ALIAS[requested] || requested;
  return PANELS.some((p) => p.key === key) ? key : 'overview';
}
function navigate(ctx, panel) {
  ctx.navigate(`#/seat?panel=${encodeURIComponent(panel)}`);
}
function pct(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)}%`;
}
function num(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : String(value);
}

/** The seat switcher: an explicit, auditable handover, keyboard-usable. */
function seatSwitcher(ctx, r) {
  const options = [
    h('option', { value: '' }, 'Undeclared operator view — whole workspace (no enforcement)'),
    ...r.allSeats.map((s) => h('option', {
      value: s.id, selected: r.seat.id === s.id ? true : null,
    }, `${s.name} · ${s.label} (rank ${s.rank}, ${s.horizonDays}d) · ${s.scopeN} in span`)),
  ];
  return h('div', { class: 'seat-switcher' },
    h('label', { class: 'field-label', for: 'seat-select' }, 'Operating from'),
    h('select', {
      id: 'seat-select', class: 'input',
      onChange: (event) => {
        const value = event.target.value || null;
        const result = ctx.api.setActiveSeat(value, { reason: 'declared from the Altitude Lens' });
        if (result && result.ok) {
          toast(value === null ? 'Returned to the undeclared operator view.' : `Seat handed over — access and roll-up now enforced at this altitude.`, 'good');
          ctx.refresh();
        } else {
          toast((result && result.error) || 'Could not declare that seat.', 'bad');
        }
      },
    }, ...options),
    h('p', { class: 'muted small' }, 'Declaring a seat is an append-only handover. It changes what this workspace shows and what it allows; it never edits a record.'),
  );
}

function overviewPanel(ctx, r) {
  const d = r.digest;
  const altitude = altitudeByKey(d.altitudeKey);
  const dutyCards = (d.duties || []).map((duty) => {
    const links = duty.routes.filter((route) => route.allowed);
    const blocked = duty.routes.filter((route) => !route.allowed);
    return card({
      title: duty.label,
      subtitle: duty.question,
      body: h('div', null,
        links.length
          ? h('div', { class: 'row-gap wrap' }, ...links.map((route) => h('a', {
              class: 'btn btn-tiny btn-ghost', href: route.route,
            }, `Open ${route.label}`)))
          : h('p', { class: 'muted small' }, 'Every route for this duty is above or below this altitude’s permission window.'),
        blocked.length ? h('p', { class: 'muted small' }, `${blocked.length} route(s) withheld: ${blocked[0].reason}`) : null,
      ),
    });
  });
  return h('div', { class: 'stack' },
    r.warnings?.length ? banner({ tone: 'warn', title: 'The declared seat could not be honoured', body: r.warnings.join(' ') }) : null,
    d.fullAccess
      ? banner({
          tone: 'info',
          title: 'Undeclared operator view — the whole workspace, as before',
          body: 'No seat is declared, so nothing is filtered and no permission is enforced. This is the single-operator behaviour the product had before ADR-0076, kept deliberately as the no-regression default. Choose a seat above to turn on real, altitude-aware access control and automatic vertical roll-up.',
        })
      : banner({
          tone: 'info',
          title: `Enforced: ${d.label} · rank ${d.rank} · ${d.horizonDays}-day time span of discretion`,
          body: d.stance,
        }),
    h('div', { class: 'grid-2' },
      card({ title: 'Declare the operating seat', subtitle: 'The position this workspace is being operated from', body: seatSwitcher(ctx, r) }),
      card({
        title: 'This altitude decides',
        subtitle: altitude ? altitude.decisionForm : 'unassigned',
        body: h('div', { class: 'stack-tight' },
          kv('Decision question', d.decisionQuestion || '—'),
          kv('Unit of discretion', altitude?.unitLabel || '—'),
          kv('People in this span', String(d.scopeN)),
          // ADR-0141: the matrix reading of the same span. Absent (not zero)
          // when the workspace declares no additional reporting line.
          d.lineScopeN > 0
            ? kv('People on a declared line', `${d.lineScopeN} across ${d.lineCount} line(s) — ${d.lineKinds.join(', ')}`)
            : null,
          d.lineScopeN > 0
            ? kv('Span under the matrix', `${d.matrixScopeN} people (${d.matrixScopeN - d.scopeN} the reporting tree does not reach)`)
            : null,
          kv('Direct child spans', String(d.spanN)),
          kv('Evidence floor', `${d.floorN} observations`),
          kv('Disclosure', d.disclosure.reason),
        ),
      }),
    ),
    d.boardLine ? banner({ tone: 'caution', title: 'Board-ready line (generated, unverified figures marked)', body: d.boardLine }) : null,
    h('div', { class: 'stat-grid' },
      stat({ label: 'Open work in span', value: String(d.counts.openN), hint: `${d.counts.byType.length} module source(s)` }),
      stat({ label: 'Past a promised date', value: String(d.counts.overdueN), tone: d.counts.overdueN ? 'warn' : '', hint: 'exact count' }),
      stat({ label: 'Past owner’s horizon', value: String(d.counts.debtN), tone: d.counts.debtN ? 'warn' : '', hint: 'escalation debt' }),
      stat({ label: 'Severity load', value: String(d.counts.severityLoad), hint: 'weighted units, not people' }),
      stat({ label: 'Oldest item', value: d.counts.oldestAgeDays === null ? '—' : `${d.counts.oldestAgeDays}d`, hint: 'age of the work' }),
      stat({ label: 'Detail withheld', value: String(d.counts.withheldDetailN), hint: 'counts only above the ceiling' }),
      d.lineScopeN > 0
        ? stat({
          label: 'Only via a declared line',
          value: String(d.counts.viaLineN),
          hint: `of ${d.counts.openN} — hidden by a single-chain seat`,
          tone: d.counts.viaLineN ? 'warn' : '',
        })
        : null,
    ),
    h('h2', { class: 'section-title' }, `The ${d.label}’s duties — routes filtered by the permission engine`),
    dutyCards.length ? h('div', { class: 'grid-2' }, ...dutyCards)
      : emptyState({ title: 'No duties at this altitude', body: 'The undeclared operator view has no altitude-specific duties; declare a seat to see the questions this level owes.', icon: '◇' }),
    h('div', { class: 'grid-2' },
      card({ title: 'What this level must NOT be handed', body: d.forbidden.length
        ? h('ul', { class: 'list' }, ...d.forbidden.map((f) => h('li', null, f)))
        : h('p', { class: 'muted' }, 'Nothing is forbidden from the undeclared operator view.') }),
      card({ title: 'What this level owes upward', body: d.handUp.length
        ? h('ul', { class: 'list' }, ...d.handUp.map((f) => h('li', null, f)))
        : h('p', { class: 'muted' }, 'The operator view owes no hand-up; it is not a rung in the chain.') }),
    ),
  );
}

function rollupPanel(ctx, r) {
  const d = r.digest;
  const upRows = r.rollUp.map((step, index) => ({
    seat: `${step.digest.label} · ${step.seat.name}`,
    rank: step.digest.rank,
    horizon: step.digest.horizonDays,
    open: step.digest.counts.openN,
    overdue: step.digest.counts.overdueN,
    debt: step.digest.counts.debtN,
    rate: step.digest.horizonDebt.pooledPct,
    detail: step.digest.disclosure.mode,
    index,
  }));
  const downRows = r.children.map((c) => ({
    seat: `${c.digest.label} · ${c.seat.name}`,
    rank: c.digest.rank,
    open: c.digest.counts.openN,
    load: c.digest.counts.severityLoad,
    overdue: c.digest.counts.overdueN,
    oldest: c.digest.counts.oldestAgeDays,
    band: c.digest.riskHeat.reduce((a, x) => a + x.severityLoad, 0) >= 12 ? 'critical' : 'watch',
  }));
  const rate = d.horizonDebt;
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'The number the top sees is the record, read through a scope — not a copy',
      body: 'Every digests below is derived live from the same dated records and the same reporting tree. Nothing was re-typed, re-formatted or frozen into a status update. Each open item has exactly one owning node, so an altitude’s count is the sum of the spans beneath it, with no double counting.',
    }),
    card({
      title: 'Drill UP — this seat to the enterprise',
      subtitle: 'Each row is the same work, re-read at the altitude above. Detail is dropped as the rank rises; counts are not.',
      body: table({
        caption: 'Vertical roll-up by altitude',
        emptyMessage: 'No ancestor spans.',
        columns: [
          { label: 'Altitude / holder', render: (row) => h('strong', null, row.seat) },
          { label: 'Rank', render: (row) => badge(String(row.rank), ALTITUDE_TONE[r.rollUp[row.index]?.digest.altitudeKey] || 'neutral') },
          { label: 'Horizon', render: (row) => `${row.horizon}d` },
          { label: 'Open', render: (row) => String(row.open) },
          { label: 'Overdue', render: (row) => String(row.overdue) },
          { label: 'Past horizon', render: (row) => String(row.debt) },
          { label: 'Pooled rate', render: (row) => pct(row.rate) },
          { label: 'Disclosure', render: (row) => row.detail },
        ],
        rows: upRows,
      }),
    }),
    card({
      title: 'Composition-safe rate — pooled beside the mean of unit rates',
      subtitle: rate.compositionSensitive ? 'Flagged: the two readings disagree materially. A roll-up that silently averages averages is Simpson’s paradox wearing a dashboard.' : 'Pooled and mean-of-unit readings agree within the declared materiality bar.',
      body: h('div', { class: 'stack-tight' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Pooled (Σnum / Σden)', value: pct(rate.pooledPct), hint: `${rate.num} / ${rate.den}` }),
          stat({ label: 'Mean of unit rates', value: pct(rate.unitMeanPct), hint: `${rate.units.length} child spans` }),
          stat({ label: 'Spread', value: rate.spreadPp === null ? '—' : `${rate.spreadPp}pp`, tone: rate.compositionSensitive ? 'warn' : '', hint: `bar ${rate.materialityPp}pp` }),
          stat({ label: 'Directly standardised', value: pct(rate.standardisedPct), hint: 'enterprise type mix as the standard' }),
        ),
        rate.refused ? banner({ tone: 'warn', title: 'Rate withheld', body: rate.refused }) : null,
        rate.units.length ? table({
          caption: 'Child span contributions',
          columns: [
            { label: 'Child span', render: (row) => row.label },
            { label: 'Rank', render: (row) => String(row.rank) },
            { label: 'Past horizon', render: (row) => String(row.num) },
            { label: 'Open', render: (row) => String(row.den) },
            { label: 'Unit rate', render: (row) => pct(row.pct) },
          ],
          rows: rate.units,
        }) : h('p', { class: 'muted' }, 'No direct child spans in this roster. The pooled rate is withheld until a span exists to pool.'),
      ),
    }),
    card({
      title: 'Drill DOWN — org-risk heatmap over the child spans',
      subtitle: 'Severity load × age over spans, never a score for a person. This is the VP/CEO view of where work is accumulating.',
      body: downRows.length ? table({
        caption: 'Risk heat by direct child span',
        columns: [
          { label: 'Child span', render: (row) => h('strong', null, row.seat) },
          { label: 'Rank', render: (row) => String(row.rank) },
          { label: 'Open', render: (row) => String(row.open) },
          { label: 'Severity load', render: (row) => String(row.load) },
          { label: 'Overdue', render: (row) => String(row.overdue) },
          { label: 'Oldest', render: (row) => row.oldest === null ? '—' : `${row.oldest}d` },
        ],
        rows: downRows,
      }) : emptyState({ title: 'No child spans to drill into', body: 'Declare a seat with direct reports, or load a multi-level roster, to see the heatmap.', icon: '⛬' }),
    }),
    card({
      title: 'Arrival trend over the declared window',
      subtitle: `${d.windowDays}-day window · ${d.trendVerdict.verdict}`,
      body: h('div', { class: 'stack-tight' },
        h('p', { class: 'muted small' }, d.trendVerdict.reason),
        d.trend.length ? table({
          caption: 'New open work per ISO week',
          columns: [
            { label: 'Week starting', render: (row) => row.week },
            { label: 'New items', render: (row) => String(row.opened) },
          ],
          rows: d.trend.slice(-12),
        }) : h('p', { class: 'muted' }, 'No dated open work in this span.'),
      ),
    }),
  );
}

function boundaryPanel(ctx, r) {
  const p = r.projection;
  const d = r.digest;
  const rows = p.ledger.slice(0, 80).map((entry) => ({
    ...entry,
    tone: entry.allow === 'denied' ? 'bad' : 'caution',
  }));
  return h('div', { class: 'stack' },
    banner({
      tone: p.enforced ? 'caution' : 'info',
      title: p.enforced ? 'Access is enforced at this seat' : 'The undeclared operator view enforces nothing',
      body: p.enforced
        ? `${p.counts.full} record(s) readable in full, ${p.counts.aggregate} disclosed as counts only, ${p.counts.denied} denied. Every refusal below prints its reason — this is the transparency the 2026 category does not ship: no platform tells the person being denied WHY a record is withheld.`
        : 'Declaring a seat turns this ledger on. Until then the workspace behaves exactly as it always has: one operator, one keyboard, no filtering.',
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Readable in full', value: String(p.counts.full), tone: 'good', hint: 'passed scope + class window' }),
      stat({ label: 'Aggregate only', value: String(p.counts.aggregate), tone: 'warn', hint: 'upward leak refused' }),
      stat({ label: 'Denied', value: String(p.counts.denied), tone: 'bad', hint: 'sideways or downward leak refused' }),
      stat({ label: 'Governed collections', value: String(Object.keys(p.visible).length), hint: 'one policy row each' }),
    ),
    card({
      title: 'Withheld by this seat, with the reason',
      subtitle: 'Grouped reasons from the live digest — the same text the enforcement engine used.',
      body: d.withheld.length
        ? h('ul', { class: 'list' }, ...d.withheld.map((w) => h('li', null, h('strong', null, `${w.n} record(s) · `), w.reason)))
        : h('p', { class: 'muted' }, 'Nothing is withheld from this seat.'),
    }),
    card({
      title: 'Enforcement ledger',
      subtitle: p.ledgerTruncated ? `Showing the first ${rows.length}; ${p.ledgerTruncated} further entry/entries omitted from the view, not from the decision.` : 'Every non-full decision, one row.',
      body: rows.length ? table({
        caption: 'Records withheld or denied by the operating seat',
        columns: [
          { label: 'Record class', render: (row) => row.policyLabel },
          { label: 'Sensitivity', render: (row) => row.classLabel },
          { label: 'Decision', render: (row) => badge(row.allow, row.tone) },
          { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.reason) },
        ],
        rows,
      }) : emptyState({ title: 'No record was withheld', body: 'Either the workspace is empty, or the undeclared operator view is active.', icon: '⊘' }),
    }),
    card({
      title: 'The four sensitivity classes',
      subtitle: 'One declared rank window per class; an unlisted collection is treated as unit work with detail withheld above rank 3.',
      body: table({
        caption: 'Sensitivity classes and rank windows',
        columns: [
          { label: 'Class', render: (row) => row.label },
          { label: 'Full read', render: (row) => `rank ${row.min}–${row.max}` },
          { label: 'Detail ceiling', render: (row) => `rank ${row.ceiling}` },
          { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.reason) },
        ],
        rows: Object.values(RECORD_CLASSES).map((c) => ({ label: c.label, min: c.minRank, max: c.maxRank, ceiling: c.detailCeiling, reason: c.reason })),
      }),
    }),
  );
}

function workPanel(ctx, r) {
  const d = r.digest;
  const disc = d.disclosure;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: `Disclosure ladder at ${d.label}: ${disc.mode}`, body: disc.reason }),
    card({
      title: `Open work disclosed to this altitude (${disc.shownN} of ${disc.shownN + disc.hiddenN})`,
      subtitle: disc.detail ? 'Item detail and names are shown because the work at this altitude is the person.' : 'Names and item titles are withheld; the reading is counts by source and span.',
      body: disc.rows.length ? table({
        caption: 'Open work through the seat disclosure ladder',
        columns: [
          { label: 'Source', render: (row) => row.typeLabel },
          { label: disc.detail ? 'Item' : 'Unit', render: (row) => disc.detail ? (row.title || row.unit) : row.unit },
          { label: 'Who', render: (row) => row.who || '—' },
          { label: 'Age', render: (row) => `${row.ageDays}d` },
          { label: 'Now at', render: (row) => row.requiredAltitudeLabel },
          { label: 'Severity', render: (row) => String(row.severity) },
        ],
        rows: disc.rows,
      }) : emptyState({ title: 'No open work in this span', body: 'The roll-up is derived from dated records; there is nothing to disclose yet.', icon: '◇' }),
    }),
    card({
      title: 'Hand-up owed to the level above',
      subtitle: 'Printed from the altitude registry, not re-typed by a person.',
      body: h('div', { class: 'grid-2' },
        h('div', null, h('h3', null, 'Owes upward'), d.handUp.length
          ? h('ul', { class: 'list' }, ...d.handUp.map((x) => h('li', null, x)))
          : h('p', { class: 'muted' }, '—')),
        h('div', null, h('h3', null, 'Must NOT be handed'), d.forbidden.length
          ? h('ul', { class: 'list' }, ...d.forbidden.map((x) => h('li', null, x)))
          : h('p', { class: 'muted' }, '—')),
      ),
    }),
  );
}

function methodPanel(ctx, r) {
  const d = r.digest;
  return h('div', { class: 'stack' },
    card({
      title: 'What this surface is',
      body: h('div', { class: 'stack-tight' },
        h('p', null, SEAT_PREMISE),
        h('p', null, 'ADR-0075 built the reporting tree as a MODEL — altitudes defined by Jaques’ time span of discretion (7/30/90/180/365 days), lowest-common-ancestor ownership, and a disclosure ladder it explicitly refused to enforce. ADR-0076 turns that ladder into an enforced permission boundary and adds the missing primitive: the SEAT, the position in the tree from which the workspace is being operated.'),
        h('p', null, 'The roll-up does not duplicate the cross-module propagation engine: it is registered on the same post-commit spine (RULE-SEAT-01..03). Altitude is another dimension of that one event-driven architecture. Adding a module is one row in SIGNAL_SOURCES; adding a permission is one row in RECORD_POLICIES.'),
      ),
    }),
    card({
      title: 'Frameworks and named methods used',
      body: h('ul', { class: 'list' },
        h('li', null, h('strong', null, 'Jaques (1956), time-span of discretion: '), 'five altitudes by the longest period their work may run without review; the clock is per altitude.'),
        h('li', null, h('strong', null, 'Policy model (not enforced row-level security): '), 'decisions over subject (seat rank + subtree), resource (record class), action and environment, deny-by-default on undeclared actions, need-to-know scope from the reporting tree rather than WHERE manager_id = me.'),
        h('li', null, h('strong', null, 'Tarjan offline LCA: '), 'responsibility for cross-unit work rises to the smallest span containing everyone it touches (from the Command Chain, reused).'),
        h('li', null, h('strong', null, 'Simpson’s paradox / direct standardisation: '), 'a pooled rate is printed beside the mean of unit rates; a material disagreement is flagged and a directly standardised rate is added rather than letting an average of averages stand.'),
        h('li', null, h('strong', null, 'Evidence floor (k-anonymity convention): '), 'a rate below the declared floor is withheld with its reason; a cell of one identifies a person.'),
        h('li', null, h('strong', null, 'Theory of Constraints / Little’s Law lineage: '), 'risk heat is severity load × age over spans, never a score for a person.'),
      ),
    }),
    card({
      title: 'Refusals, stated once',
      body: h('ul', { class: 'list' },
        h('li', null, 'No authentication is claimed. One browser, one local store, no server: a seat is an explicit, append-only DECLARATION, not an identity proof. The app says so rather than implying a login it cannot enforce.'),
        h('li', null, 'The undeclared operator view is the no-regression default: full access, no filtering, no new events, no new links. A declared seat at the root is a chief seat WITH enforcement; an undeclared seat is the operator view WITHOUT it.'),
        h('li', null, 'No new stored entity, no schema bump, no migration. Digests are derived live, so the number the top sees cannot drift from the record it reports.'),
        h('li', null, 'No individual is rated, ranked or named as a subject of judgement. Above the detail ceiling, individuals are counts.'),
        h('li', null, 'No sideways disclosure: a record about people outside the seat’s subtree is denied, even when its class would otherwise be permitted.'),
        h('li', null, 'Undeclared actions and unlisted collections fail closed; a policy nobody wrote is not a permission.'),
        h('li', null, 'The automatic post-commit pass is inert until a seat is declared, so an existing workspace’s transaction is unchanged.'),
      ),
    }),
    card({
      title: 'Conventions in force',
      body: h('div', { class: 'stack-tight' },
        kv('Engine version', r.engineVersion),
        kv('Active seat', `${r.seat.label} · ${r.seat.name}`),
        kv('Evidence floor', `${d.floorN} observations`),
        kv('Materiality bar', `${r.conventions.seatMaterialityPp}pp`),
        kv('Automatic roll-up', r.conventions.seatAutoPropagate ? 'on' : 'paused (explicit scan still runs)'),
        kv('Max typed edges per pass', String(r.conventions.seatMaxLinks)),
        kv('Arrival window', `${r.conventions.seatWindowDays} days`),
        kv('Wired rule engine', 'DEFAULT_POST_COMMIT_RULES · RULE-SEAT-01..03'),
      ),
    }),
    card({
      title: 'Altitudes represented in this roster',
      subtitle: 'An empty rung is drawn empty rather than given an invented incumbent.',
      body: table({
        caption: 'Altitudes and held seats',
        columns: [
          { label: 'Altitude', render: (row) => h('strong', null, row.label) },
          { label: 'Rank', render: (row) => String(row.rank) },
          { label: 'Horizon', render: (row) => `${row.horizonDays}d` },
          { label: 'Seats held', render: (row) => row.held ? badge(String(row.held), ALTITUDE_TONE[row.key] || 'neutral') : h('span', { class: 'muted' }, 'empty rung') },
        ],
        rows: r.seatsByAltitude,
      }),
    }),
  );
}

export function renderSeat(ctx) {
  const { state, now } = ctx;
  const r = ctx.api.seatRead();
  const d = r.digest;
  const panel = resolvePanel(ctx.query);
  const header = pageHeader({
    eyebrow: 'Operating seat · Altitude Lens',
    title: 'Who is operating this workspace — and what are they allowed to see?',
    subtitle: 'A local hierarchy lens, not a security boundary. Other screens, actions and exports can still expose the full workspace. Do not use seats to protect confidential data.',
    meta: h('span', { class: 'muted small' }, `Derived live · ${formatDate(now)} · no stored copy`),
    actions: [
      stat({ label: 'Acting altitude', value: d.shortLabel, hint: `${d.horizonDays ?? '—'}d horizon`, tone: d.enforced ? 'info' : '' }),
      stat({ label: 'Rank', value: String(d.rank), hint: 'local lens only' }),
      stat({ label: 'Open in span', value: String(d.counts.openN), hint: `${d.spanN} child spans` }),
      stat({ label: 'Withheld', value: String(r.projection.counts.aggregate + r.projection.counts.denied), tone: d.enforced ? 'warn' : '', hint: 'with printed reasons' }),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        const result = ctx.api.scanSeats();
        if (result && result.ok) { toast('Seat scan complete — vertical roll-up and boundary reconciled.', 'good'); ctx.refresh(); }
        else toast((result && result.error) || 'Could not scan the seat.', 'bad');
      } }, 'Scan now'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        const text = ctx.api.seatBriefText();
        if (!downloadText({ filename: `leados-operating-seat-${dayKey(now)}.txt`, text, mime: 'text/plain' })) {
          toast('Could not start the download. Use Settings & data instead.', 'bad');
        }
      } }, 'Export brief'),
      d.fullAccess ? null : h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
        const result = ctx.api.setActiveSeat(null, { reason: 'returned to the operator view from the lens' });
        if (result && result.ok) { toast('Returned to the undeclared operator view.', 'good'); ctx.refresh(); }
        else toast((result && result.error) || 'Could not return.', 'bad');
      } }, 'Return to operator view'),
    ].filter(Boolean),
  });

  const panels = {
    overview: () => overviewPanel(ctx, r),
    rollup: () => rollupPanel(ctx, r),
    boundary: () => boundaryPanel(ctx, r),
    work: () => workPanel(ctx, r),
    method: () => methodPanel(ctx, r),
  };

  // ADR-0076: the shell carries the acting altitude as a class, so the five
  // operating pictures are visually distinct without duplicating a layout.
  // The tone is decorative only; every difference in CONTENT comes from the
  // permission engine, never from the stylesheet.
  return h('div', { class: `page seat-view seat-rank-${d.rank} seat-alt-${d.altitudeKey || 'operator'}` },
    header,
    h('p', { class: 'notice', role: 'note' }, 'Privacy warning: seats are self-declared and do not authenticate users. Other screens and exports are not isolated by this lens. Use a trusted single-operator workspace only.'),
    tabs({ items: PANELS, active: panel, onSelect: (key) => navigate(ctx, key), ariaLabel: 'Operating seat sections' }),
    h('div', { class: 'page-body', id: `seat-panel-${panel}` }, panels[panel]()),
    h('p', { class: 'muted small' }, `LeadOS · ${r.engineVersion} · ${Object.keys(state).length} state keys · schema v${state.schemaVersion}. No new stored collection. No person rated, ranked or named above the detail ceiling.`),
  );
}

export { PANELS, resolvePanel };
