/**
 * ADR-0116 — Cross-Span Capture Merge.
 *
 * Pure domain module: no DOM, no storage, no network, no wall-clock globals.
 *
 * Named frameworks applied explicitly:
 *  - Broder (1997) resemblance (weighted Jaccard over canonical shingle sets)
 *    to measure structural constraint overlap across sibling captures.
 *  - Schnell, Bachteler & Reiher (2009) privacy-preserving record linkage
 *    (PPRL): content stems are stripped of all roster person-name tokens and
 *    hashed through a keyed one-way digest before comparison; raw notes and
 *    sentences never leave `ownerSeatId`.
 *  - Fellegi & Sunter (1969) composite blocking & decision rule: captures
 *    block on `primaryCategoryId` and link only on an exact graph/ADR-0113
 *    lineage anchor OR weighted shingle resemblance >= `MERGE_LIMITS.minJaccard`
 *    with at least `MERGE_LIMITS.minSharedShingles` shared shingles.
 *  - Jaques (1956) / Aghion & Tirole (1997) subsidiarity: consolidation is
 *    proposed exclusively at the true N-way Lowest Common Ancestor (LCA) of
 *    the participating spans — never sideways to a peer and never higher than
 *    the smallest span containing every affected branch.
 */
import { addDays, dayKey } from '../time.js';
import { LEADER_ID, lowestCommonAncestor } from './chain.js';
import { buildSeats } from './seat.js';
import { fingerprint } from './actionBundles.js';
import { INTAKE_CATEGORIES } from './intake.js';
import { MERGE_DISCLOSURE, MERGE_LIMITS, missionProfile } from './missionRegistry.js';

const STOPWORDS = new Set([
  'about', 'above', 'across', 'after', 'again', 'against', 'also', 'another',
  'around', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'cannot', 'could', 'current', 'currently', 'does', 'doing', 'down', 'during',
  'each', 'either', 'every', 'from', 'further', 'have', 'having', 'here',
  'into', 'issue', 'just', 'keep', 'keeps', 'leader', 'leadership', 'like',
  'made', 'make', 'makes', 'many', 'more', 'most', 'much', 'must', 'need',
  'needed', 'needs', 'next', 'note', 'notes', 'only', 'open', 'other', 'over',
  'part', 'plan', 'problem', 'report', 'reported', 'reports', 'response',
  'review', 'said', 'same', 'says', 'several', 'shift', 'should', 'since',
  'situation', 'some', 'still', 'such', 'take', 'team', 'teams', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'time', 'today', 'under', 'until', 'upon', 'very', 'want', 'week',
  'weeks', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'within',
  'work', 'would', 'year',
]);

const NEGATION_CUE = /\b(?:not|no|never|neither|without|resolved|cleared)\b/i;

function ancestorsOf(chain, id) {
  const out = [];
  let cursor = chain?.nodes?.has(id) ? id : LEADER_ID;
  const guard = new Set();
  while (cursor && !guard.has(cursor) && guard.size < 64) {
    guard.add(cursor);
    out.push(cursor);
    if (cursor === LEADER_ID) break;
    cursor = chain.nodes.get(cursor)?.parentId || LEADER_ID;
  }
  if (out[out.length - 1] !== LEADER_ID) out.push(LEADER_ID);
  return out;
}

/**
 * Compatibility name for ADR-0116 callers. ADR-0120 moved the associative
 * N-way meet into chain.js so capture consolidation and ordinary work ownership
 * cannot disagree. This is the same function, not a second implementation.
 */
export { lowestCommonAncestor as multiSpanLowestCommonAncestor };

/** True iff two seats sit on distinct, non-nested branches of the reporting tree. */
export function disjointBranches(chain, seatA, seatB) {
  if (!seatA || !seatB || seatA === seatB) return false;
  if (!chain?.nodes?.has(seatA) || !chain?.nodes?.has(seatB)) return false;
  return !ancestorsOf(chain, seatA).includes(seatB) && !ancestorsOf(chain, seatB).includes(seatA);
}

/** Immediate child of `ancestorId` along the path down to `nodeId`. */
export function directBranchRootUnder(chain, ancestorId, nodeId) {
  const path = ancestorsOf(chain, nodeId);
  const idx = path.indexOf(ancestorId);
  return idx > 0 ? path[idx - 1] : nodeId;
}

function stemToken(raw) {
  let w = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length < 4 || /^\d+$/.test(w) || STOPWORDS.has(w)) return '';
  for (const [suf, minLen] of [['tion', 6], ['ment', 6], ['ness', 6], ['ing', 6], ['ies', 5], ['ed', 5], ['es', 5], ['ly', 6], ['s', 5]]) {
    if (w.length >= minLen && w.endsWith(suf)) {
      w = suf === 'ies' ? `${w.slice(0, -3)}y` : w.slice(0, -suf.length);
      break;
    }
  }
  return w.length >= 4 && !STOPWORDS.has(w) ? w : '';
}

function personNameTokens(state) {
  const out = new Set();
  for (const p of state?.people || []) {
    for (const part of String(p?.name || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (part.length >= 2) {
        out.add(part);
        const stemmed = stemToken(part);
        if (stemmed) out.add(stemmed);
      }
    }
  }
  return out;
}

function extractContentStems(capture, blockedNames) {
  const stems = new Set();
  const pushWords = (clause) => {
    for (const raw of String(clause || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (!raw || blockedNames.has(raw)) continue;
      const s = stemToken(raw);
      if (s && !blockedNames.has(s)) stems.add(s);
      if (stems.size >= MERGE_LIMITS.maxShingles) return;
    }
  };
  pushWords(capture?.title || capture?.caseInput?.title || '');
  for (const sentence of String(capture?.sourceText || '').split(/[.!?\n]+/)) {
    if (!sentence.trim() || NEGATION_CUE.test(sentence)) continue;
    pushWords(sentence);
    if (stems.size >= MERGE_LIMITS.maxShingles) break;
  }
  return [...stems];
}

function extractSpanLineage(capture, state, seatScope, captureStems, blockedNames) {
  const anchors = new Map();
  const put = (key, weight, exact) => {
    const prev = anchors.get(key);
    if (!prev || weight > prev.weight || (exact && !prev.exact)) anchors.set(key, { key, weight, exact });
  };
  if (capture?.caseInput?.linkedGoalId) {
    put(`lin:${fingerprint({ v: 1, ns: 'goal', id: capture.caseInput.linkedGoalId })}`, 4, true);
  }
  // ADR-0113: `prepares-for` edges bind filed 1:1 agenda commitments to people
  // in the seat's span. When two spans file prompts carrying the same upstream
  // record marker (`[RULE-...:id]` or `; ref id)`) or an engine constraint
  // family overlapping the capture's stems, the lineage edge anchors the merge
  // without exposing either person's prompt or 1:1 record.
  const entriesById = new Map((state?.agendaEntries || []).filter((e) => e && e.status !== 'withdrawn').map((e) => [e.id, e]));
  const stemSet = new Set(captureStems);
  for (const link of state?.links || []) {
    if (!link || link.relation !== 'prepares-for' || link.sourceType !== 'agendaentry' || link.targetType !== 'person') continue;
    if (!seatScope.has(link.targetId)) continue;
    const entry = entriesById.get(link.sourceId);
    if (!entry) continue;
    const prompt = String(entry.prompt || '');
    const ruleRef = prompt.match(/\[[A-Z][A-Z0-9-]{1,24}:([a-z0-9_-]+)\]/i);
    const tailRef = prompt.match(/;\s*ref\s+([a-z0-9_-]+)\)/i);
    const refId = (ruleRef?.[1] || tailRef?.[1] || '').toLowerCase();
    if (refId) {
      put(`lin:${fingerprint({ v: 1, ns: 'agd-ref', ref: refId })}`, 4, true);
    }
    if (entry.family && !['person-raised', 'empty', 'unknown-marker'].includes(entry.family)) {
      const promptStems = prompt.toLowerCase().split(/[^a-z0-9]+/).map(stemToken).filter((s) => s && !blockedNames.has(s));
      if (entry.owedTo === 'above' || entry.owedTo === 'both' || promptStems.some((s) => stemSet.has(s))) {
        put(`lin:${fingerprint({ v: 1, ns: 'agd-fam', fam: entry.family })}`, 2, false);
      }
    }
  }
  return anchors;
}

/**
 * Derive a privacy-preserving constraint signature for one capture.
 * Raw words and person names are never retained in the returned signature.
 */
export function buildConstraintSignature(capture, state, built = null) {
  const seats = built || buildSeats(state, { settings: state?.settings });
  const categoryId = String(capture?.classification?.primaryCategoryId || '').trim();
  const primaryLabel = String(capture?.classification?.primaryLabel || 'Operational constraint').trim();
  const blockedNames = personNameTokens(state);
  const weights = new Map();
  const kinds = new Map();
  const exactKeys = new Set();

  for (const ev of capture?.classification?.evidence || []) {
    if (!ev || ev.negated || !ev.term) continue;
    const key = `lex:${fingerprint({ v: 1, ns: 'lex', cat: categoryId, term: String(ev.term).toLowerCase() })}`;
    const w = Math.max(1, Math.min(6, Number(ev.weight) || 1));
    if (w > (weights.get(key) || 0)) { weights.set(key, w); kinds.set(key, 'lex'); }
  }

  const stems = extractContentStems(capture, blockedNames);
  for (const stem of stems) {
    const key = `stem:${fingerprint({ v: 1, ns: 'stem', stem })}`;
    if (!weights.has(key)) { weights.set(key, 1.5); kinds.set(key, 'stem'); }
  }

  const seat = capture?.ownerSeatId === LEADER_ID ? seats.operatorSeat : seats.byId.get(capture?.ownerSeatId);
  const scope = seat?.scope || new Set([capture?.ownerSeatId].filter(Boolean));
  const lineage = extractSpanLineage(capture, state, scope, stems, blockedNames);
  for (const [key, info] of lineage.entries()) {
    weights.set(key, info.weight);
    kinds.set(key, 'lin');
    if (info.exact) exactKeys.add(key);
  }

  return {
    captureId: capture?.id || '',
    ownerSeatId: capture?.ownerSeatId || '',
    categoryId,
    primaryLabel,
    weights,
    kinds,
    exactKeys,
    constraintFingerprint: fingerprint({ v: 1, cat: categoryId, keys: [...weights.keys()].sort() }),
  };
}

/** Pairwise Fellegi-Sunter / Broder weighted Jaccard linkage check. */
export function matchConstraintSignatures(sigA, sigB, chain) {
  if (!sigA || !sigB || !disjointBranches(chain, sigA.ownerSeatId, sigB.ownerSeatId)) {
    return { matched: false, resemblance: 0, sharedShingleCount: 0, sharedLexiconCount: 0, sharedLineageCount: 0, exactLineageMatch: false, reason: 'not-cross-span' };
  }
  if (!sigA.categoryId || sigA.categoryId !== sigB.categoryId) {
    return { matched: false, resemblance: 0, sharedShingleCount: 0, sharedLexiconCount: 0, sharedLineageCount: 0, exactLineageMatch: false, reason: 'category-mismatch' };
  }
  const union = new Set([...sigA.weights.keys(), ...sigB.weights.keys()]);
  let num = 0; let den = 0;
  let sharedShingleCount = 0; let sharedLexiconCount = 0; let sharedLineageCount = 0;
  let exactLineageMatch = false;
  for (const key of union) {
    const a = sigA.weights.get(key) || 0;
    const b = sigB.weights.get(key) || 0;
    num += Math.min(a, b);
    den += Math.max(a, b);
    if (a > 0 && b > 0) {
      const kind = sigA.kinds.get(key) || sigB.kinds.get(key);
      if (kind === 'lin') {
        sharedLineageCount += 1;
        if (sigA.exactKeys.has(key) && sigB.exactKeys.has(key)) exactLineageMatch = true;
      } else {
        sharedShingleCount += 1;
        if (kind === 'lex') sharedLexiconCount += 1;
      }
    }
  }
  const resemblance = den > 0 ? num / den : 0;
  const matched = exactLineageMatch || (
    sharedShingleCount >= MERGE_LIMITS.minSharedShingles
    && (sharedLexiconCount >= 1 || sharedLineageCount >= 1)
    && resemblance >= MERGE_LIMITS.minJaccard
  );
  return {
    matched,
    resemblance,
    sharedShingleCount,
    sharedLexiconCount,
    sharedLineageCount,
    exactLineageMatch,
    reason: matched ? (exactLineageMatch ? 'shared-lineage-anchor' : 'weighted-shingle-resemblance') : 'below-resemblance-floor',
  };
}

export function openConstituentCaptures(state, { now = new Date() } = {}) {
  const today = dayKey(now);
  return (state?.missionCaptures || []).filter((c) => c
    && ['draft', 'rehearsed'].includes(c.status)
    && !(Array.isArray(c.mergeFromIds) && c.mergeFromIds.length > 0)
    && !c.mergedIntoCaptureId
    && c.caseInput?.reviewOn >= today);
}

function combinedFinancial(members) {
  const currencies = [...new Set(members.map((m) => m.caseInput?.financial?.currency || 'USD'))];
  const zero = { currency: currencies[0] || 'USD', optimistic: 0, mostLikely: 0, pessimistic: 0, mitigationCost: 0, capacityDaysOptimistic: 0, capacityDaysMostLikely: 0, capacityDaysPessimistic: 0, opportunityCost: '' };
  if (currencies.length > 1) return zero; // Never invent an exchange rate across spans.
  const keys = ['optimistic', 'mostLikely', 'pessimistic', 'mitigationCost', 'capacityDaysOptimistic', 'capacityDaysMostLikely', 'capacityDaysPessimistic'];
  const out = { ...zero };
  for (const key of keys) {
    out[key] = Math.max(0, ...members.map((m) => Number(m.caseInput?.financial?.[key]) || 0));
  }
  return out;
}

/**
 * Validate an explicit set of 2..8 constituent captures and compute their exact
 * LCA routing, dedupe fingerprint and consolidated case defaults.
 */
export function evaluateMergeCluster(state, memberCaptureIds, { now = new Date(), built = null } = {}) {
  const ids = [...new Set((Array.isArray(memberCaptureIds) ? memberCaptureIds : []).map((v) => String(v || '').trim()).filter(Boolean))].sort();
  if (ids.length < MERGE_LIMITS.minMembers || ids.length > MERGE_LIMITS.maxMembers) {
    return { ok: false, error: `A cross-span consolidation requires ${MERGE_LIMITS.minMembers}–${MERGE_LIMITS.maxMembers} open captures.` };
  }
  const seats = built || buildSeats(state, { now, settings: state?.settings });
  const openById = new Map(openConstituentCaptures(state, { now }).map((c) => [c.id, c]));
  const members = ids.map((id) => openById.get(id)).filter(Boolean);
  if (members.length !== ids.length) {
    return { ok: false, error: 'A constituent span capture changed, expired or was already settled. Refresh and review current captures.' };
  }
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      if (!disjointBranches(seats.chain, members[i].ownerSeatId, members[j].ownerSeatId)) {
        return { ok: false, error: 'Every constituent capture must come from a distinct, non-nested reporting branch.' };
      }
    }
  }
  const sigs = members.map((m) => buildConstraintSignature(m, state, seats));
  const categoryId = sigs[0].categoryId;
  if (!categoryId || sigs.some((s) => s.categoryId !== categoryId)) {
    return { ok: false, error: 'Constituent captures no longer share the same primary constraint class.' };
  }
  // Verify the cluster is connected under the pairwise Fellegi-Sunter rule.
  const adj = Array.from({ length: sigs.length }, () => []);
  const pairScores = [];
  const sharedShingles = new Set();
  const sharedLineage = new Set();
  let exactLineageMatch = false;
  for (let i = 0; i < sigs.length; i += 1) {
    for (let j = i + 1; j < sigs.length; j += 1) {
      const match = matchConstraintSignatures(sigs[i], sigs[j], seats.chain);
      if (match.matched) {
        adj[i].push(j); adj[j].push(i);
        pairScores.push(match.resemblance);
        if (match.exactLineageMatch) exactLineageMatch = true;
        for (const key of sigs[i].weights.keys()) {
          if (sigs[j].weights.has(key)) {
            if (sigs[i].kinds.get(key) === 'lin') sharedLineage.add(key);
            else sharedShingles.add(key);
          }
        }
      }
    }
  }
  const visited = new Set([0]); const queue = [0];
  while (queue.length) {
    const cur = queue.shift();
    for (const nxt of adj[cur]) if (!visited.has(nxt)) { visited.add(nxt); queue.push(nxt); }
  }
  if (visited.size !== sigs.length || !pairScores.length) {
    return { ok: false, error: 'These captures do not meet the cross-span constraint resemblance or lineage threshold.' };
  }

  const lcaSeatId = lowestCommonAncestor(seats.chain, members.map((m) => m.ownerSeatId));
  const lcaSeat = lcaSeatId === LEADER_ID ? seats.operatorSeat : seats.byId.get(lcaSeatId);
  const lcaNode = seats.chain.nodes.get(lcaSeatId);
  const lcaRank = lcaSeat?.rank || 5;
  const lcaLabel = lcaSeatId === LEADER_ID ? (lcaNode?.name || 'Enterprise') : (lcaSeat?.label || lcaNode?.name || 'Common leader');
  const lcaAltitudeKey = lcaSeat?.altitudeKey || lcaNode?.altitude || 'chief';
  const directBranchIds = [...new Set(members.map((m) => directBranchRootUnder(seats.chain, lcaSeatId, m.ownerSeatId)))]
    .filter((id) => id && id !== LEADER_ID && seats.chain.byId.has(id));
  const defaultOwnerId = directBranchIds[0] || (lcaSeatId !== LEADER_ID ? lcaSeatId : '');
  const category = INTAKE_CATEGORIES.find((c) => c.id === categoryId);
  const primaryLabel = category?.label || sigs[0].primaryLabel || 'Operational constraint';
  const caseKind = category?.caseKinds?.[0] || members[0].caseInput?.kind || 'risk';
  const maxSeverity = Math.min(10, Math.max(1, ...members.map((m) => Number(m.caseInput?.fmea?.severity) || 5)));
  const profile = missionProfile(lcaRank);
  const earliestMemberReview = members.map((m) => m.reviewOn).filter(Boolean).sort()[0];
  const suggestedReviewOn = earliestMemberReview || addDays(dayKey(now), profile.reviewDays);
  const resemblancePct = Math.round((pairScores.reduce((a, b) => a + b, 0) / pairScores.length) * 1000) / 10;
  const dedupeFingerprint = fingerprint({
    version: 1,
    lcaSeatId,
    categoryId,
    members: members.map((m) => [m.id, m.ownerSeatId, m.inputFingerprint]).sort(([a], [b]) => a[0].localeCompare(b[0])),
  });

  return {
    ok: true,
    lcaSeatId,
    lcaLabel,
    lcaRank,
    lcaAltitudeKey,
    categoryId,
    primaryLabel,
    caseKind,
    dedupeFingerprint,
    memberCaptureIds: ids,
    directBranchIds,
    defaultOwnerId,
    maxSeverity,
    suggestedReviewOn,
    resemblancePct,
    sharedShingleCount: sharedShingles.size,
    sharedLineageCount: sharedLineage.size,
    exactLineageMatch,
    stakesReviewRequired: Boolean(category?.stakes || members.some((m) => m.classification?.stakesReviewRequired)),
    confidenceBand: resemblancePct >= 50 || exactLineageMatch ? 'high' : resemblancePct >= 35 ? 'medium' : 'low',
    financial: combinedFinancial(members),
    members,
  };
}

function discoverRawClusters(state, built, { now = new Date() } = {}) {
  const open = openConstituentCaptures(state, { now })
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));
  if (open.length < MERGE_LIMITS.minMembers) return [];
  const sigs = open.map((c) => ({ capture: c, sig: buildConstraintSignature(c, state, built) }));
  const n = sigs.length;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (matchConstraintSignatures(sigs[i].sig, sigs[j].sig, built.chain).matched) {
        adj[i].push(j); adj[j].push(i);
      }
    }
  }
  const seen = new Set();
  const clusters = [];
  for (let i = 0; i < n; i += 1) {
    if (seen.has(i) || !adj[i].length) continue;
    const comp = []; const q = [i]; seen.add(i);
    while (q.length) {
      const cur = q.shift(); comp.push(cur);
      for (const nxt of adj[cur]) if (!seen.has(nxt)) { seen.add(nxt); q.push(nxt); }
    }
    // Keep at most one capture per disjoint reporting branch (open is newest-first).
    const chosen = [];
    for (const idx of comp) {
      const cand = sigs[idx].capture;
      if (chosen.every((keep) => disjointBranches(built.chain, keep.ownerSeatId, cand.ownerSeatId))) {
        chosen.push(cand);
      }
      if (chosen.length >= MERGE_LIMITS.maxMembers) break;
    }
    if (chosen.length < MERGE_LIMITS.minMembers) continue;
    const evaluated = evaluateMergeCluster(state, chosen.map((c) => c.id), { now, built });
    if (evaluated.ok) clusters.push(evaluated);
  }
  return clusters.sort((a, b) => b.maxSeverity - a.maxSeverity || b.resemblancePct - a.resemblancePct || a.dedupeFingerprint.localeCompare(b.dedupeFingerprint));
}

function formatCandidateForSeat(cluster, seat, built, state) {
  const unitDetail = Boolean(seat?.fullAccess) || (seat?.rank || 5) <= 3;
  const members = cluster.members.map((m) => {
    const mSeat = m.ownerSeatId === LEADER_ID ? built.operatorSeat : built.byId.get(m.ownerSeatId);
    const mNode = built.chain.nodes.get(m.ownerSeatId);
    const spanLabel = `${mSeat?.label || mNode?.name || 'Subordinate'} span`;
    return {
      captureId: m.id,
      ownerSeatId: m.ownerSeatId,
      spanLabel,
      disclosedTitle: unitDetail ? m.title : `${cluster.primaryLabel} · ${spanLabel} proposal`,
      titleWithheld: !unitDetail,
      severity: m.caseInput?.fmea?.severity || 5,
      reviewOn: m.reviewOn,
    };
  });
  const openMerge = (state?.missionCaptures || []).find((c) => c.ownerSeatId === cluster.lcaSeatId
    && c.dedupeFingerprint === cluster.dedupeFingerprint && ['draft', 'rehearsed'].includes(c.status));
  return {
    dedupeFingerprint: cluster.dedupeFingerprint,
    lcaSeatId: cluster.lcaSeatId,
    lcaLabel: cluster.lcaLabel,
    lcaRank: cluster.lcaRank,
    lcaAltitudeKey: cluster.lcaAltitudeKey,
    categoryId: cluster.categoryId,
    primaryLabel: cluster.primaryLabel,
    memberCaptureIds: cluster.memberCaptureIds,
    directBranchIds: cluster.directBranchIds,
    defaultOwnerId: cluster.defaultOwnerId,
    suggestedTitle: `${cluster.primaryLabel} · consolidated (${members.length} spans)`.slice(0, 180),
    maxSeverity: cluster.maxSeverity,
    suggestedReviewOn: cluster.suggestedReviewOn,
    resemblancePct: cluster.resemblancePct,
    sharedShingleCount: cluster.sharedShingleCount,
    sharedLineageCount: cluster.sharedLineageCount,
    exactLineageMatch: cluster.exactLineageMatch,
    stakesReviewRequired: cluster.stakesReviewRequired,
    openMergeCaptureId: openMerge?.id || null,
    members,
    disclosure: MERGE_DISCLOSURE,
  };
}

/**
 * Discover non-dismissed cross-span merge candidates owned by `seat` (the LCA).
 * Raw notes, evidence sentences and IC names are excluded by construction.
 */
export function discoverMergeCandidates(state, seat, built = null, { now = new Date() } = {}) {
  if (!seat || seat.readOnly) return [];
  const seats = built || buildSeats(state, { now, settings: state?.settings });
  const dismissed = new Set((state?.missionCaptures || [])
    .filter((c) => c.status === 'dismissed' && c.ownerSeatId === seat.id && c.dedupeFingerprint)
    .map((c) => c.dedupeFingerprint));
  return discoverRawClusters(state, seats, { now })
    .filter((cluster) => cluster.lcaSeatId === seat.id && !dismissed.has(cluster.dedupeFingerprint))
    .map((cluster) => formatCandidateForSeat(cluster, seat, seats, state));
}

/**
 * Identity-free collision advisories for a preparing seat's own open captures.
 * Never names the sibling seat, sibling person or sibling title (no sideways leak).
 */
export function captureMergeAdvisoriesForSeat(state, seatId, { now = new Date(), built = null } = {}) {
  const out = new Map();
  if (!seatId) return out;
  const seats = built || buildSeats(state, { now, settings: state?.settings });
  const clusters = discoverRawClusters(state, seats, { now });
  for (const cluster of clusters) {
    const dismissed = (state?.missionCaptures || []).some((c) => c.status === 'dismissed'
      && c.ownerSeatId === cluster.lcaSeatId && c.dedupeFingerprint === cluster.dedupeFingerprint);
    if (dismissed) continue;
    const mine = cluster.members.find((m) => m.ownerSeatId === seatId);
    if (!mine) continue;
    const openMerge = (state?.missionCaptures || []).find((c) => c.ownerSeatId === cluster.lcaSeatId
      && c.dedupeFingerprint === cluster.dedupeFingerprint && ['draft', 'rehearsed'].includes(c.status));
    out.set(mine.id, {
      dedupeFingerprint: cluster.dedupeFingerprint,
      lcaSeatId: cluster.lcaSeatId,
      lcaLabel: cluster.lcaLabel,
      lcaRank: cluster.lcaRank,
      lcaAltitudeKey: cluster.lcaAltitudeKey,
      peerSpanCount: cluster.members.length - 1,
      primaryLabel: cluster.primaryLabel,
      resemblancePct: cluster.resemblancePct,
      sharedLineageCount: cluster.sharedLineageCount,
      openMergePrepared: Boolean(openMerge),
    });
  }
  return out;
}
