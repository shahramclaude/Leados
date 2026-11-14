/**
 * app/views/efficiencyHub.js — Efficiency, Intelligence & Automation.
 *
 * A single operational view over the three pillars, with one rule: every
 * number printed here must be one the system actually produced. Where a claim
 * cannot be measured, the screen says so instead of printing a plausible
 * figure (the repository's bulletproof-reliability mandate).
 *
 *  Efficiency  — real wall-clock samples from the on-device instrumentation,
 *                workspace size, quota posture and the last cascade's cost.
 *  Intelligence — what the fusion hub is reading, how many families it fused,
 *                 and which entities have independent domains converging.
 *  Automation  — the post-commit spine's own ledger: rules evaluated, work
 *                applied, duplicates suppressed, failures retained.
 *
 * All reads are pure; no writes. The view is accessible at #/efficiency.
 */

import { h } from '../ui/dom.js';
import { perfRead, perfEnabled } from '../core/perf.js';
import { intelligenceHubRead, intelligenceCoverage } from '../core/domain/intelligenceHub.js';
import { automationHealth, openReceipts } from '../core/domain/automationOrchestrator.js';
import { estimateStateSize, quotaWarningFor } from '../core/storeOptimizations.js';

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

  // ── Efficiency ────────────────────────────────────────────────────────────
  const perfSamples = perfRead();
  const stateSize = estimateStateSize(state);
  const quotaWarn = quotaWarningFor(state);
  const revision = state?.meta?.revision ?? 0;
  const metrics = ctx.propagationMetrics || ctx.store?.lastPropagationMetrics || null;
  const navSamples = perfSamples.filter((s) => s.label === 'nav.counters');
  const navSum = summarize(navSamples);

  // ── Intelligence ──────────────────────────────────────────────────────────
  const hub = intelligenceHubRead(state, at);
  const coverage = intelligenceCoverage(state, at, hub);

  // ── Automation ────────────────────────────────────────────────────────────
  const health = automationHealth(metrics);
  const receipts = openReceipts(state);

  return h('div', { class: 'view view-efficiency-hub', 'data-view': 'efficiency' },
    h('div', { class: 'page-header' },
      h('h1', {}, 'Efficiency · Intelligence · Automation'),
      h('p', { class: 'page-subtitle' },
        'How fast the system runs, how widely its signals are fused, and what the automation spine actually did on the last write. Live readings only — nothing on this screen is stored or simulated.'),
      quotaWarn ? h('div', { class: 'banner banner-warn', role: 'status' }, quotaWarn) : null,
    ),

    // ── Efficiency ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '⚡ Efficiency — where time goes'),
      h('div', { class: 'grid-3' },
        card('Store & persist', [
          kvTable([
            ['Revision', revision],
            ['Workspace size (est.)', `${Math.round(stateSize / 1024)} KB`],
            ['Updated', state?.meta?.updatedAt || '—'],
            ['Last cascade', metrics ? `${metrics.executed || 0} applied · ${metrics.declined || 0} declined · ${metrics.skipped || 0} memo-skipped · ${metrics.indexSkipped || 0} index-skipped` : '—'],
            ['Cascade wall clock', metrics?.elapsedMs != null ? `${metrics.elapsedMs}ms over ${metrics.events || 0} events × ${metrics.rules || 0} rules` : '—'],
          ]),
          h('p', { class: 'hint' }, 'The cascade runs inside the write, so this is the honest cost of a save.'),
        ]),
        card('Navigation badge cache', [
          h('p', {}, navSamples.length
            ? `${navSum.count} computation${navSum.count === 1 ? '' : 's'} · p50 ${navSum.p50Ms}ms · max ${navSum.maxMs}ms`
            : 'No badge-chain computation recorded in this session yet.'),
          h('p', { class: 'hint' },
            'The sidebar badge strip runs ~110 domain reads (retention hazard curves, capacity PERT, the deferral option lattice). They are pure over the workspace snapshot and the calendar day, so they are memoised on exactly those keys: a route change reuses the previous read, and a write, midnight or seat change recomputes it.'),
          h('p', { class: 'hint' }, 'Instrumentation: window.__LEADOS_PERF.read() / .summary().'),
        ]),
        card('Automation guard efficiency', [
          h('p', {}, 'Every rule receives each event; lazy savepoints and the proven decline memo reduce guard costs.'),
          kvTable([
            ['Trigger index', 'disabled — incomplete trigger coverage'],
            ['Decline memo hits (last write)', metrics?.skipped ?? '—'],
          ]),
          h('p', { class: 'hint' }, 'Correct automation takes priority over skipping unverified rules.'),
        ]),
      ),
      perfSamples.length ? h('details', { class: 'perf-details' },
        h('summary', {}, `Recent samples (${perfSamples.length})`),
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Label'), h('th', {}, 'ms'), h('th', {}, 'slow'), h('th', {}, 'when'))),
          h('tbody', {}, ...perfSamples.slice(-20).reverse().map((s) =>
            h('tr', { class: s.slow ? 'row-warn' : '' }, h('td', {}, s.label), h('td', {}, String(s.elapsedMs)), h('td', {}, s.slow ? 'yes' : ''), h('td', {}, s.at.slice(11, 19)))))),
      ) : null,
    ),

    // ── Intelligence ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '🧠 Intelligence — fused, not siloed'),
      h('div', { class: 'grid-3' },
        card('Fusion hub', [
          kvTable([
            ['Sources', coverage.sources.length ? coverage.sources.join(', ') : badge('none registered', 'warn')],
            ['Signal families fused', hub.domainCount],
            ['Raw signals', hub.totalSignals],
            ['Deduped', hub.dedupedCount],
            ['Clusters', hub.clusterCount],
            ['Converging', hub.convergingClusters],
          ]),
          coverage.failedSources.length ? h('p', { class: 'banner banner-warn', role: 'status' }, `Incomplete intelligence: ${coverage.failedSources.join(', ')} could not be read.`) : null,
          h('p', { class: 'hint' },
            'The hub reads the canonical insight engine\'s merged findings — one computation, two readings — plus any explicitly registered domain. It used to be handed three modules and reported almost nothing.'),
        ]),
        card('Top signals', hub.topSignals.length ? [
          h('ul', { class: 'signal-list' }, ...hub.topSignals.slice(0, 5).map((s) =>
            h('li', {}, h('strong', {}, `${s.domain}/${s.rule}`), ` s${s.severity} ${s.confidence}`, s._clusterBoost > 1 ? ` ×${s._clusterBoost.toFixed(2)} convergence` : '', ' — ', h('span', {}, s.title)))),
        ] : [h('p', { class: 'hint' }, 'No active signals: the workspace is quiet, or no source is registered.')]),
        card('Converging risks', hub.recommendations.length ? [
          h('ul', {}, ...hub.recommendations.map((r) =>
            h('li', {}, h('strong', {}, r.title), h('p', { class: 'hint' }, r.summary), r.destination ? h('a', { href: r.destination }, 'Go →') : null))),
        ] : [h('p', { class: 'hint' }, 'A converging cluster is ≥2 signals across ≥2 domains on the same typed entity with maximum severity ≥3.')]),
      ),
      h('div', { class: 'grid-2' },
        card('Ranking model', [
          h('p', {}, 'urgency = severity × confidence weight × recency × convergence boost'),
          kvTable([
            ['Confidence weights', 'high 3 · medium 2 · low 1'],
            ['Recency', '≤7 days ×1.3 · ≤30 days ×1.1 · older ×1.0'],
            ['Convergence boost', '1 + 0.15 × (distinct domains − 1), capped at 1.6'],
          ]),
          h('p', { class: 'hint' },
            'Severity is never rewritten by convergence — it stays the domain\'s own claim and is printed as such. Only the ordering carries the fusion.'),
        ]),
        card('By severity', [
          kvTable([[5, hub.bySeverity[5]], [4, hub.bySeverity[4]], [3, hub.bySeverity[3]], [2, hub.bySeverity[2]], [1, hub.bySeverity[1]]].map(([sev, cnt]) => [`s${sev}`, cnt])),
          hub.truncated ? h('p', { class: 'banner banner-warn' }, `${hub.truncated} signals were withheld by the 2,000-signal fusion cap.`) : null,
        ]),
      ),
    ),

    // ── Automation ──
    h('section', { class: 'hub-section' },
      h('h2', {}, '🤖 Automation — what the spine actually did'),
      h('div', { class: 'grid-3' },
        card('Last cascade', metrics ? [
          kvTable([
            ['Rules evaluated', health.rules],
            ['Events delivered', health.events],
            ['Effects applied', health.executed],
            ['Declined (guarded)', health.declined],
            ['Duplicates suppressed', health.duplicates],
            ['Rolled back', health.rolledBack],
            ['Wall clock', `${health.elapsedMs}ms`],
          ]),
          h('p', { class: 'hint' }, 'A duplicate is the same (type, entity, id) tuple arriving twice in one transaction. It is delivered once — that is the coalescing the spine really performs.'),
        ] : [h('p', { class: 'hint' }, 'No write has run a cascade in this session yet.')]),
        card('Spine integrity', [
          kvTable([
            ['Rollbacks (last write)', health.ok ? badge('none', 'good') : badge(String(health.rolledBack), 'warn')],
            ['Open failure receipts', receipts.length],
            ['Event budget', health.budget ?? 'ceiling in postCommit'],
          ]),
          receipts.length
            ? h('a', { href: '#/assurance' }, 'Open the automation control room →')
            : h('p', { class: 'hint' }, 'A failed rule leaves a retained receipt; none are open.'),
        ]),
        card('Evidence', [
          h('p', {}, 'Every figure on this screen comes from the propagation reporter, the perf ring buffer or the workspace record itself.'),
          h('p', { class: 'hint' }, `Perf instrumentation is ${perfEnabled() ? 'on' : 'off'}; samples are in-memory only and never exported.`),
        ]),
      ),
      h('div', { class: 'card' },
        h('h3', { class: 'card-title' }, 'Not built (stated, not implied)'),
        h('ul', { class: 'next-list' },
          h('li', {}, 'Priority ordering of derived events. The spine is breadth-first and budgeted; ordering by urgency would change audit order, so it is a deliberate opening, not a shipped behaviour.'),
          h('li', {}, 'Automatic template suggestion from repeated manual work. Repetition is not distinguishable from the spine\'s own emissions in the retained event log, so no suggestion is printed from it.'),
          h('li', {}, 'Write coalescing for rapid successive edits. The plaintext save is already synchronous and ordered; batching it would change what a reload mid-edit sees, which needs its own contract.'),
        ),
      ),
    ),

    h('section', { class: 'hub-section' },
      h('p', { class: 'muted' },
        'All three pillars are additive: existing modules, rules and permissions are unchanged. The hub only reads.'),
    ),
  );
}

/** p50/max over a sample list, in ms, rounded for print. */
function summarize(samples) {
  if (!samples.length) return { count: 0, p50Ms: 0, maxMs: 0 };
  const values = samples.map((s) => s.elapsedMs).sort((a, b) => a - b);
  return {
    count: values.length,
    p50Ms: Math.round(values[Math.floor(values.length / 2)]),
    maxMs: Math.round(values[values.length - 1]),
  };
}
