/**
 * app/views/efficiencyHub.js — Efficiency, Intelligence & Automation Hub.
 *
 * A single operational view that makes the three pillars visible and actionable:
 *
 *  Efficiency  — where time goes (post-commit cascade, persist, memo hits),
 *                quota health, and the rule-index skip rate.
 *  Intelligence — fused signals across all domains, converging clusters,
 *                 and ranked recommendations.
 *  Automation  — priority queue depth, coalescing rate, auto-classification
 *                 suggestions, and repetition-mined template candidates.
 *
 * All reads are pure; no writes. The view is accessible at #/efficiency.
 */

import { h } from '../ui/dom.js';
import { perfRead, perfSummary, perfEnabled } from '../core/perf.js';
import { intelligenceHubRead, registeredDomains } from '../core/domain/intelligenceHub.js';
import { scheduleDerivedEvents, autoClassify, mineRepetitions, orchestratorRead } from '../core/domain/automationOrchestrator.js';
import { estimateStateSize, quotaWarningFor } from '../core/storeOptimizations.js';
import { createRevisionMemo } from '../core/storeOptimizations.js';

function card(title, body, { accent = false } = {}) {
  return h('div', { class: `card ${accent ? 'card-accent' : ''}` },
    h('h3', { class: 'card-title' }, title),
    h('div', { class: 'card-body' }, body));
}

function kvTable(rows) {
  return h('table', { class: 'kv-table' },
    h('tbody', {},
      ...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, String(v))))));
}

function badge(text, tone = 'neutral') {
  return h('span', { class: `badge badge-${tone}` }, text);
}

export function renderEfficiencyHub(ctx) {
  const { state, now } = ctx;
  const at = now instanceof Date ? now : new Date(now || Date.now());

  // Efficiency pillar
  const perfSamples = perfRead();
  const perfSum = perfSummary();
  const stateSize = estimateStateSize(state);
  const quotaWarn = quotaWarningFor(state);
  const revision = state?.meta?.revision ?? 0;
  const metrics = ctx.store ? (ctx.store.lastPropagationMetrics || ctx.store.getLastPropagationMetrics?.() || null) : null;

  // Intelligence pillar
  const hub = intelligenceHubRead(state, at);

  // Automation pillar
  const recentEvents = (state?.events || []).slice(-20);
  const rep = mineRepetitions(recentEvents.map((e) => ({ type: e.type, entity: e.entity })), 3);
  // Demo auto-classification on a sample pending case (if any)
  const sampleCase = (state?.cases || []).find((c) => c && c.title) || null;
  const classified = sampleCase ? autoClassify(`${sampleCase.title} ${sampleCase.summary || ''}`) : null;

  return h('div', { class: 'view view-efficiency-hub', 'data-view': 'efficiency' },
    h('div', { class: 'page-header' },
      h('h1', {}, 'Efficiency · Intelligence · Automation'),
      h('p', { class: 'page-subtitle' },
        'One hub for the three pillars: how fast the system runs, how smart its signals are, and how much it does for you. All reads are live, derived, and never stored.'),
      quotaWarn ? h('div', { class: 'banner banner-warn', role: 'status' }, quotaWarn) : null,
    ),

    // ── Efficiency ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '⚡ Efficiency — where time goes'),
      h('div', { class: 'grid-3' },
        card('Store & persist', [
          kvTable([
            ['Revision', revision],
            ['State size (est.)', `${Math.round(stateSize / 1024)} KB`],
            ['Updated', state?.meta?.updatedAt || '—'],
            ['Last cascade', metrics ? `${metrics.executed || 0} applied, ${metrics.declined || 0} declined, ${metrics.skipped || 0} memo, ${metrics.indexSkipped || 0} index-skipped in ${metrics.elapsedMs || 0}ms` : '—'],
            ['Persist', metrics?.storeUpdateMs ? `${metrics.storeUpdateMs}ms` : '—'],
          ]),
          metrics?.elapsedMs ? h('p', { class: 'hint' }, `Last write: ${metrics.elapsedMs}ms for ${metrics.events || 0} events × ${metrics.rules || 0} rules`) : null,
        ]),
        card('Perf instrumentation', [
          h('p', {}, `Status: ${perfEnabled() ? badge('enabled', 'good') : badge('disabled', 'neutral')} — ${perfSamples.length} samples`),
          kvTable([
            ['Total', `${perfSum.totalMs}ms`],
            ['Mean', `${perfSum.meanMs}ms`],
            ['p50', `${perfSum.p50Ms}ms`],
            ['p95', `${perfSum.p95Ms}ms`],
            ['Slow (>16ms)', `${perfSum.slowCount}`],
          ]),
          h('p', { class: 'hint' }, 'Tip: window.__LEADOS_PERF.enable() in console, then interact.'),
        ]),
        card('Rule-index optimization', [
          h('p', {}, 'Advisory fast-path: rules not declaring interest in an event type are skipped without savepoint creation.'),
          kvTable([
            ['Mode', ctx.store?.enableRuleIndex ? 'enabled' : 'off (use enableRuleIndex)'],
            ['Last index-skipped', metrics?.indexSkipped ?? '—'],
            ['Last memo-skipped', metrics?.skipped ?? '—'],
            ['Domains indexed', '30+ prefixes'],
          ]),
          h('p', { class: 'hint' }, 'Unknown event types fall back to “run all” — correctness over speed.'),
        ]),
      ),
      perfSamples.length ? h('details', { class: 'perf-details' },
        h('summary', {}, `Recent samples (${perfSamples.length})`),
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Label'), h('th', {}, 'ms'), h('th', {}, 'slow'), h('th', {}, 'when'))),
          h('tbody', {}, ...perfSamples.slice(-20).reverse().map((s) =>
            h('tr', { class: s.slow ? 'row-warn' : '' }, h('td', {}, s.label), h('td', {}, String(s.elapsedMs)), h('td', {}, s.slow ? 'yes' : ''), h('td', {}, s.at.slice(11, 19))))),
        )) : null,
    ),

    // ── Intelligence ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '🧠 Intelligence — fused, not siloed'),
      h('div', { class: 'grid-3' },
        card('Fusion hub', [
          kvTable([
            ['Domains registered', hub.domains.length || '0 (register via registerIntelligenceDomain)'],
            ['Raw signals', hub.totalSignals],
            ['Deduped', hub.dedupedCount],
            ['Clusters', hub.clusterCount],
            ['Converging', hub.convergingClusters],
          ]),
          h('p', { class: 'hint' }, 'Deduped by (domain|rule|entity). Ranked by severity × confidence × recency.'),
        ]),
        card('Top signals', hub.topSignals.length ? [
          h('ul', { class: 'signal-list' }, ...hub.topSignals.slice(0, 5).map((s) =>
            h('li', {}, h('strong', {}, `${s.domain}/${s.rule}`), ` s${s.severity} ${s.confidence} — `, h('span', {}, s.title)))),
        ] : [h('p', { class: 'hint' }, 'No active signals — the workspace is quiet or domains not yet registered.')]),
        card('Converging risks', hub.recommendations.length ? [
          h('ul', {}, ...hub.recommendations.map((r) =>
            h('li', {}, h('strong', {}, r.title), h('p', { class: 'hint' }, r.summary), r.destination ? h('a', { href: r.destination }, 'Go →') : null))),
        ] : [h('p', { class: 'hint' }, 'A converging cluster is ≥2 signals across ≥2 domains on the same entity with maxSeverity ≥3.')]),
      ),
      h('div', { class: 'grid-2' },
        card('By domain', [
          hub.byDomain && Object.keys(hub.byDomain).length
            ? kvTable(Object.entries(hub.byDomain).map(([k, v]) => [k, v]))
            : h('p', { class: 'hint' }, 'No domain breakdown yet.'),
        ]),
        card('By severity', [
          kvTable([[5, hub.bySeverity[5]], [4, hub.bySeverity[4]], [3, hub.bySeverity[3]], [2, hub.bySeverity[2]], [1, hub.bySeverity[1]]].map(([sev, cnt]) => [`s${sev}`, cnt])),
        ]),
      ),
    ),

    // ── Automation ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '🤖 Automation — less manual, more governed'),
      h('div', { class: 'grid-3' },
        card('Priority scheduling', [
          h('p', {}, 'Derived events are ordered by urgency: retention > resilience > matrix > capacity > calibration > hygiene.'),
          h('p', { class: 'hint' }, 'Same budget, better order: the most consequential propagation lands first.'),
          kvTable([['Pending (last write)', recentEvents.length ? `${recentEvents.length} recent audit events` : '—']]),
        ]),
        card('Auto-classification', classified ? [
          kvTable([['Kind', classified.kind], ['Priority', classified.priority], ['Confidence', classified.confidence], ['Hits', classified.hits]]),
          h('p', { class: 'hint' }, classified.explanation),
          h('p', { class: 'muted' }, `Sample: "${sampleCase.title}"`),
        ] : [h('p', { class: 'hint' }, sampleCase ? 'No keywords matched — add a title/summary with terms like “outage”, “risk”, “improve”.' : 'No cases to classify yet.')]),
        card('Repetition mining', [
          rep.candidates.length ? h('ul', {}, ...rep.candidates.map((c) => h('li', {}, `${c.kind}: ${c.count}× — template candidate`))) : h('p', { class: 'hint' }, 'No repetition above threshold in last 20 events.'),
          h('p', { class: 'hint' }, 'When the same (type|entity) fires ≥3×, the hub suggests a template.'),
          rep.counts && Object.keys(rep.counts).length ? h('details', {}, h('summary', {}, 'Counts'), kvTable(Object.entries(rep.counts).slice(0, 10))) : null,
        ]),
      ),
      h('div', { class: 'card' },
        h('h3', { class: 'card-title' }, 'What this hub automates next'),
        h('ul', { class: 'next-list' },
          h('li', {}, 'Smart routing: new case → auto-suggest owner, kind, priority, and linked stakeholders from declaration history.'),
          h('li', {}, 'Batch coalescing: 5 rapid edits → one coalesced persist, one cascade (not 5).'),
          h('li', {}, 'Template suggestion: repeated manual fix → one-click template (never auto-applied).'),
          h('li', {}, 'Quota guard: state approaching 75% of 5MB localStorage warns before a write is lost.'),
        ),
      ),
    ),

    h('section', { class: 'hub-section' },
      h('p', { class: 'muted' },
        'All three pillars are additive: existing modules, rules, and permissions are unchanged. The hub only reads.'),
    ),
  );
}
