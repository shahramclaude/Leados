/**
 * app/core/domain/intelligenceHub.js — unified intelligence fusion hub.
 *
 * LeadOS has 40+ signal domains (earlyWarning, resilience, retention,
 * capacity, finance, etc.), each producing its own findings. A leader sees
 * them as separate lists; the cross-domain pattern — e.g. retention risk
 * + overdue 1:1 + unassigned delegation pointing at the same person — is
 * invisible.
 *
 * This hub fuses those silos:
 *  1. Collects every domain's signals through a single pure function.
 *  2. Deduplicates matching domain, rule, typed entity and title; it does
 *     not claim that different domains represent independent evidence.
 *  3. Ranks by a composite urgency score (severity × confidence × recency).
 *  4. Clusters by entity to surface "this person/team has 3 converging risks".
 *  5. Generates one-line proactive recommendations with a destination.
 *  6. Exports a compact roll-up for the Today view and the Signals feed.
 *
 * Pure, read-side, no storage, no side effects, deterministic.
 */

import { daysBetween } from '../time.js';

/**
 * Two kinds of input reach the hub.
 *
 * 1. `insights` — the canonical recommendation engine (`domain/insights.js`).
 *    It already evaluates every signal family the workspace ships and returns
 *    one merged, severity-scored finding list. The hub reads that list instead
 *    of re-running 60 engines of its own: one computation, two readings. This
 *    is registered by the shell once per app instance.
 *
 * 2. `domains` — an explicit escape hatch for a module that wants to contribute
 *    signals the insight engine does not carry. Tests use it, and a future
 *    domain can use it without editing insights.js.
 *
 * Before this split the hub had a registry that the shell filled with three
 * hand-picked modules and no canonical source, so in a real workspace it fused
 * 3 signals of the ~63 families the product ships. The fusion surface existed
 * and reported almost nothing.
 */
const sources = new Map();
const registry = new Map();

export function registerInsightsSource(name, findingsFn) {
  if (!name || typeof name !== 'string') throw new TypeError('source name required');
  if (typeof findingsFn !== 'function') throw new TypeError('findingsFn must be a function');
  sources.set(name, findingsFn);
}

export function registeredSources() {
  return Array.from(sources.keys()).sort();
}

export function registerIntelligenceDomain(domain, signalFn) {
  if (!domain || typeof domain !== 'string') throw new TypeError('domain name required');
  if (typeof signalFn !== 'function') throw new TypeError('signalFn must be a function');
  registry.set(domain, signalFn);
}

export function registeredDomains() {
  return Array.from(registry.keys()).sort();
}

export function clearIntelligenceRegistry() {
  registry.clear();
  sources.clear();
}

const MAX_SIGNALS = 2000;

function safeSignals(fn, state, now, name, failures) {
  try {
    const out = fn(state, now);
    if (Array.isArray(out)) return out;
  } catch { /* Report the failed source without exposing exception details. */ }
  failures.push(name);
  return [];
}

/**
 * Resolve the record a finding is about, so findings from different families
 * can be clustered on the same person/record.
 *
 * The insight engine's own identity field is `personId`. Everything else is
 * carried by the destination route (`#/cases/case-12`), which is a typed
 * resolver route; the segment pair is the entity. A finding with neither is
 * workspace-level and is deliberately NOT clustered with other unrelated
 * workspace-level findings — a false cluster would invent convergence.
 */
export function entityOfFinding(finding) {
  if (finding?.personId) return { entityId: finding.personId, entityType: 'person' };
  const route = finding?.action?.route || finding?.destination || '';
  const match = /^#\/([a-z0-9-]+)\/([A-Za-z0-9._:-]+)/.exec(String(route));
  if (match) return { entityId: match[2], entityType: match[1] };
  return { entityId: null, entityType: null };
}

/** Map one insight finding onto the hub's signal shape. */
function signalFromFinding(source, finding, index) {
  const entity = entityOfFinding(finding);
  const rule = finding.ruleId || finding.rule || finding.id || `f${index}`;
  return {
    domain: finding.domain || source,
    id: `${source}:${rule}:${entity.entityId || ''}:${index}`,
    rule,
    severity: Number.isFinite(finding.severity) ? finding.severity : 2,
    confidence: finding.confidence || 'medium',
    title: finding.title || 'Signal',
    summary: finding.detail || finding.summary || '',
    entityId: entity.entityId,
    entityType: entity.entityType,
    createdAt: finding.createdAt || null,
    destination: finding.action?.route || finding.destination || null,
    evidence: Array.isArray(finding.evidence) ? finding.evidence : [],
    action: finding.action || null,
    personId: finding.personId || null,
    source,
    raw: finding,
  };
}

/**
 * Collect raw signals from the canonical insight source(s) and any explicitly
 * registered domain. Bounded, and the bound is reported rather than hidden.
 */
export function collectRawSignals(state, now = new Date(), { limit = MAX_SIGNALS } = {}) {
  const all = [];
  let truncated = 0;
  const failures = [];
  for (const [source, fn] of sources.entries()) {
    const findings = safeSignals(fn, state, now, source, failures);
    for (let i = 0; i < findings.length; i += 1) {
      if (all.length >= limit) { truncated += 1; continue; }
      all.push(signalFromFinding(source, findings[i], i));
    }
  }
  for (const [domain, fn] of registry.entries()) {
    const signals = safeSignals(fn, state, now, domain, failures);
    for (const sig of signals) {
      if (all.length >= limit) { truncated += 1; continue; }
      all.push({
        domain,
        id: sig.id || `${domain}:${sig.rule || 'unknown'}:${sig.entityId || ''}`,
        rule: sig.rule || sig.id || 'unknown',
        severity: Number.isFinite(sig.severity) ? sig.severity : 2,
        confidence: sig.confidence || 'medium',
        title: sig.title || sig.summary || sig.label || 'Signal',
        summary: sig.summary || sig.detail || '',
        entityId: sig.entityId || null,
        entityType: sig.entityType || null,
        createdAt: sig.createdAt || sig.at || null,
        destination: sig.destination || sig.href || null,
        evidence: Array.isArray(sig.evidence) ? sig.evidence : [],
        action: sig.action || null,
        personId: sig.personId || null,
        source: domain,
        raw: sig,
      });
    }
  }
  if (truncated) Object.defineProperty(all, 'truncated', { value: truncated, enumerable: false });
  Object.defineProperty(all, 'failedSources', { value: failures, enumerable: false });
  return all;
}


/**
 * Deduplicate a signal that arrived twice.
 *
 * Two signals are the same fact when they share domain, rule, entity **and
 * title**. The title matters: a rule that fires once per record without an
 * entity id (a workspace-level check, or a grouped "N people have…" finding)
 * produces several genuinely different facts, and collapsing them on
 * (domain, rule) alone silently deleted 18 of the demo workspace's 213
 * findings. Keeping the highest severity when two signals really do collide
 * means a duplicate can never downgrade the reading.
 */
export function deduplicateSignals(signals) {
  const byKey = new Map();
  for (const sig of signals) {
    const key = JSON.stringify([sig.domain, sig.rule, sig.entityType || null, sig.entityId || null, sig.title || '']);
    const existing = byKey.get(key);
    if (!existing || sig.severity > existing.severity) byKey.set(key, sig);
  }
  return Array.from(byKey.values());
}

/**
 * Cluster by entityId: surfaces converging risks on the same person/team.
 */
export function clusterByEntity(signals) {
  const clusters = new Map();
  for (const sig of signals) {
    const key = sig.entityId ? `${sig.entityType || 'entity'}:${sig.entityId}` : '__global';
    if (!clusters.has(key)) clusters.set(key, { entityId: sig.entityId, entityType: sig.entityType, key, signals: [] });
    clusters.get(key).signals.push(sig);
  }
  const out = Array.from(clusters.values());
  for (const c of out) {
    c.maxSeverity = Math.max(...c.signals.map((s) => s.severity));
    c.domains = Array.from(new Set(c.signals.map((s) => s.domain)));
    c.converging = Boolean(c.entityId && c.entityType) && c.signals.length >= 2 && c.domains.length >= 2;
  }
  out.sort((a, b) => b.maxSeverity - a.maxSeverity || b.signals.length - a.signals.length);
  return out;
}

const CONF_WEIGHT = { high: 3, medium: 2, low: 1 };

/**
 * Convergence boost.
 *
 * A single domain flagging a person is a silo. Two independent domains
 * flagging the same person is the thing this hub exists to find — retention
 * risk plus an overdue 1:1 plus an overloaded queue is not three findings, it
 * is one situation. Ranking those above a lone finding of equal severity is
 * the whole point of fusion, so the ranking must express it.
 *
 * The boost is bounded, monotone in the number of distinct domains, and never
 * changes severity itself: `severity` is still the domain's own claim and is
 * still printed as such. Only the ordering carries the fusion.
 */
export const MAX_CLUSTER_BOOST = 1.6;
export const CLUSTER_BOOST_PER_DOMAIN = 0.15;

export function clusterBoostFor(domains) {
  const n = Array.isArray(domains) ? new Set(domains).size : 0;
  if (n < 2) return 1;
  return Math.min(MAX_CLUSTER_BOOST, 1 + CLUSTER_BOOST_PER_DOMAIN * (n - 1));
}

export function clusterKeyOf(sig) {
  return sig.entityId ? `${sig.entityType || 'entity'}:${sig.entityId}` : '__global';
}

function urgencyScore(sig, now, boost = 1) {
  const sev = sig.severity || 1;
  const conf = CONF_WEIGHT[sig.confidence] || 1;
  let recency = 1;
  if (sig.createdAt) {
    try {
      const days = daysBetween(new Date(sig.createdAt), now instanceof Date ? now : new Date(now));
      recency = days !== null && days >= 0 ? (days <= 7 ? 1.3 : days <= 30 ? 1.1 : 1) : 1;
    } catch { recency = 1; }
  }
  return sev * conf * recency * boost;
}

/**
 * Rank signals by composite urgency.
 *
 * Pass the clusters when you have them: convergence on one entity then raises
 * the whole cluster's ordering weight. Without clusters the ranking is the
 * plain severity × confidence × recency product, which is what a single-domain
 * reading can honestly claim.
 */
export function rankSignals(signals, now = new Date(), clusters = null) {
  const boostByKey = new Map();
  if (Array.isArray(clusters)) {
    for (const cluster of clusters) {
      if (!cluster?.converging) continue;
      boostByKey.set(cluster.key, clusterBoostFor(cluster.domains));
    }
  }
  const scored = signals.map((s) => {
    const boost = boostByKey.get(clusterKeyOf(s)) || 1;
    return { ...s, _clusterBoost: boost, _urgency: urgencyScore(s, now, boost) };
  });
  scored.sort((a, b) => b._urgency - a._urgency || b.severity - a.severity);
  return scored;
}

/**
 * Generate one-line proactive recommendations from clusters.
 * A typed entity cluster with >=2 domains and maxSeverity >=3 is flagged as actionable.
 */
export function recommendationsFor(clusters) {
  const recs = [];
  for (const c of clusters) {
    if (!c.converging || c.maxSeverity < 3) continue;
    const top = c.signals.slice().sort((a, b) => b.severity - a.severity)[0];
    recs.push({
      clusterKey: c.key,
      entityId: c.entityId,
      entityType: c.entityType,
      severity: c.maxSeverity,
      domains: c.domains,
      count: c.signals.length,
      title: `Converging risks on ${c.entityId ? c.entityType + ' ' + c.entityId : 'workspace'}`,
      summary: `${c.signals.length} signals across ${c.domains.join(', ')} — highest: ${top.title}`,
      destination: top.destination,
      signals: c.signals,
    });
  }
  return recs.sort((a, b) => b.severity - a.severity);
}

/**
 * Full hub read: collect, dedupe, cluster, rank, recommend.
 * This is the main entry point for views.
 */
export function intelligenceHubRead(state, now = new Date()) {
  const raw = collectRawSignals(state, now);
  const deduped = deduplicateSignals(raw);
  const clusters = clusterByEntity(deduped);
  const ranked = rankSignals(deduped, now, clusters);
  const recs = recommendationsFor(clusters);

  const byDomain = {};
  for (const s of deduped) {
    byDomain[s.domain] = (byDomain[s.domain] || 0) + 1;
  }

  const bySeverity = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of deduped) bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;

  return {
    at: now instanceof Date ? now.toISOString() : String(now),
    totalSignals: raw.length,
    dedupedCount: deduped.length,
    truncated: raw.truncated || 0,
    failedSources: raw.failedSources,
    clusterCount: clusters.length,
    convergingClusters: clusters.filter((c) => c.converging).length,
    topSignals: ranked.slice(0, 10),
    ranked,
    clusters: clusters.slice(0, 20),
    recommendations: recs.slice(0, 5),
    byDomain,
    bySeverity,
    domains: registeredDomains(),
    sources: registeredSources(),
    domainCount: Object.keys(byDomain).length,
  };
}

/**
 * Coverage telemetry: how much of the engine the hub is actually reading.
 *
 * The hub cannot claim to fuse what it was never handed. Printing this beside
 * the fused signals is what stops the surface from looking busy while reading
 * three domains.
 */
export function intelligenceCoverage(state, now = new Date(), read = intelligenceHubRead(state, now)) {
  return {
    sources: read.sources,
    explicitlyRegistered: read.domains,
    domainsSeen: read.domainCount,
    signals: read.dedupedCount,
    truncated: read.truncated,
    failedSources: read.failedSources,
    wired: read.sources.length > 0 || read.domains.length > 0,
  };
}

/**
 * Lightweight health check for the hub itself.
 */
export function hubHealth(state, now = new Date()) {
  const read = intelligenceHubRead(state, now);
  return {
    ok: (read.sources.length > 0 || read.domains.length > 0) && read.failedSources.length === 0 && !read.truncated,
    sources: read.sources.length,
    domains: read.domains.length,
    families: read.domainCount,
    signals: read.dedupedCount,
    converging: read.convergingClusters,
    topSeverity: read.ranked[0]?.severity || 0,
  };
}

/**
 * Brief text for the download packet / upward roll-up.
 */
export function intelligenceHubBriefText(state, now = new Date()) {
  const read = intelligenceHubRead(state, now);
  if (read.dedupedCount === 0) return 'Intelligence hub: no active signals.';
  const top3 = read.topSignals.slice(0, 3).map((s) => `${s.domain}/${s.rule} s${s.severity}`).join(', ');
  return `Intelligence hub: ${read.dedupedCount} signals across ${read.domainCount} families; ${read.convergingClusters} converging clusters. Top: ${top3}.`;
}
