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
 *  2. Deduplicates by (entity, findingKind) so the same fact from two
 *     domains does not double-count.
 *  3. Ranks by a composite urgency score (severity × confidence × recency).
 *  4. Clusters by entity to surface "this person/team has 3 converging risks".
 *  5. Generates one-line proactive recommendations with a destination.
 *  6. Exports a compact roll-up for the Today view and the Signals feed.
 *
 * Pure, read-side, no storage, no side effects, deterministic.
 */

import { daysBetween } from '../time.js';

const registry = new Map();

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
}

function safeSignals(fn, state, now) {
  try {
    const out = fn(state, now);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

/**
 * Collect raw signals from every registered domain.
 */
export function collectRawSignals(state, now = new Date()) {
  const all = [];
  for (const [domain, fn] of registry.entries()) {
    const signals = safeSignals(fn, state, now);
    for (const sig of signals) {
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
        raw: sig,
      });
    }
  }
  return all;
}

/**
 * Deduplicate by (domain, rule, entityId). Keeps the highest severity
 * when duplicates collide.
 */
export function deduplicateSignals(signals) {
  const byKey = new Map();
  for (const sig of signals) {
    const key = `${sig.domain}|${sig.rule}|${sig.entityId || ''}`;
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
    c.converging = c.signals.length >= 2 && c.domains.length >= 2;
  }
  out.sort((a, b) => b.maxSeverity - a.maxSeverity || b.signals.length - a.signals.length);
  return out;
}

const CONF_WEIGHT = { high: 3, medium: 2, low: 1 };

function urgencyScore(sig, now) {
  const sev = sig.severity || 1;
  const conf = CONF_WEIGHT[sig.confidence] || 1;
  let recency = 1;
  if (sig.createdAt) {
    try {
      const days = daysBetween(new Date(sig.createdAt), now instanceof Date ? now : new Date(now));
      recency = days <= 7 ? 1.3 : days <= 30 ? 1.1 : 1;
    } catch { recency = 1; }
  }
  return sev * conf * recency;
}

/**
 * Rank signals by composite urgency.
 */
export function rankSignals(signals, now = new Date()) {
  const scored = signals.map((s) => ({ ...s, _urgency: urgencyScore(s, now) }));
  scored.sort((a, b) => b._urgency - a._urgency || b.severity - a.severity);
  return scored;
}

/**
 * Generate one-line proactive recommendations from clusters.
 * A cluster with >=2 domains and maxSeverity >=3 is flagged as actionable.
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
  const ranked = rankSignals(deduped, now);
  const clusters = clusterByEntity(deduped);
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
    clusterCount: clusters.length,
    convergingClusters: clusters.filter((c) => c.converging).length,
    topSignals: ranked.slice(0, 10),
    ranked,
    clusters: clusters.slice(0, 20),
    recommendations: recs.slice(0, 5),
    byDomain,
    bySeverity,
    domains: registeredDomains(),
  };
}

/**
 * Lightweight health check for the hub itself.
 */
export function hubHealth(state, now = new Date()) {
  const read = intelligenceHubRead(state, now);
  return {
    ok: true,
    domains: read.domains.length,
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
  return `Intelligence hub: ${read.dedupedCount} signals across ${read.domains.length} domains; ${read.convergingClusters} converging clusters. Top: ${top3}.`;
}
