/**
 * app/core/domain/identity.js — the Attested Commit's pure engine
 * (Schema v95, ADR-0089).
 *
 * One question the Sealed Spine could not answer: WHO wrote this? Every seat
 * was a declared label. This module binds each transaction to a seat
 * credential (a passphrase-derived HMAC key that exists only in memory while
 * the session is unlocked) and makes authorship RECOMPUTABLE on demand:
 *
 *   attested event:  entityId = MAC = HMAC(seatKey,
 *                    "leados-seat-attest-v1|seat|keyId|rev|digest")
 *   summary:         seat=<seatId> key=<keyId> rev=<n> ev=<count>
 *                    digest=<txDigest> mode=hmac
 *
 * where `digest` is the SHA-256 digest of every event the transaction had
 * appended before the attestation (the same positional construction as the
 * seal's block digest). The seal runs last and covers the attestation event
 * itself, so the two layers compose: the seal says the log is intact, the
 * attestation says which credential wrote it.
 *
 * Verification is three-valued and honest:
 *   - "verified"        the MAC recomputes under the unlocked seat key;
 *   - "FAILED"          the MAC does NOT recompute — forged or tampered;
 *   - "digest-verified · key unavailable"  structure and digest recompute, but
 *     no key for that seat is unlocked in this session. This is NEVER reported
 *     as verified, and never as failed.
 *   - "CONTENT MISMATCH" / "EVICTED"  structural failures, key or no key.
 *
 * Pure module: no storage, no DOM, no network, injected clock.
 */

import { sha256Hex, hmacSha256Hex } from './sealCrypto.js';
import { txDigest, lastSealEvent, verifySealChain } from './sealChain.js';
import {
  IDENTITY_ATTEST_DOMAIN, IDENTITY_CHECKPOINT_DOMAIN, IDENTITY_ENGINE_VERSION,
  IDENTITY_EVENTS, IDENTITY_LIMITS, IDENTITY_TRIGGER_PREFIX,
} from './identityRegistry.js';
import { activeIdentitySession } from './identitySession.js';
import { buildChain } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { isOperationalCommit } from './seatRules.js';
import { altitudeByKey, altitudeRank } from './chainRegistry.js';

/* ------------------------------------------------------------ attestation */

/** The exact string a seat credential signs. */
export function attestationInput(seatId, keyId, revision, digest) {
  return `${IDENTITY_ATTEST_DOMAIN}|${seatId}|${keyId}|${revision}|${digest}`;
}

/** MAC over the attestation input under the seat key. */
export function computeAttestation(keyBytes, { seatId, keyId, revision, digest }) {
  return hmacSha256Hex(keyBytes, attestationInput(seatId, keyId, revision, digest));
}

const ATTEST_SUMMARY_RE = /^seat=(\S+) key=([0-9a-f]{16}) rev=(\d+) ev=(\d+) digest=([0-9a-f]{16,64}) mode=(\w+)/;

/** Parse an `identity.attested` event back into its fields. */
export function parseAttestationEvent(event) {
  if (!event || event.type !== IDENTITY_EVENTS.ATTESTED) return null;
  const mac = String(event.entityId || '');
  const m = ATTEST_SUMMARY_RE.exec(String(event.summary || ''));
  if (!m || !/^[0-9a-f]{64}$/.test(mac)) return null;
  return {
    mac,
    seatId: m[1],
    keyId: m[2],
    rev: Number(m[3]),
    evCount: Number(m[4]),
    digest: m[5].padEnd(64, '0'),
    mode: m[6],
    ts: event.ts || null,
  };
}

/** The last attestation event in the log with its parsed fields and index. */
export function lastAttestationEvent(state) {
  const events = Array.isArray(state?.events) ? state.events : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const parsed = parseAttestationEvent(events[i]);
    if (parsed) return { event: events[i], parsed, index: i };
  }
  return null;
}

/**
 * Should this transaction be attested at all?
 *  - explicit pass: any `identity.*` transaction attests its own commit (the
 *    first act under a credential is signed by it);
 *  - automatic pass: identity enabled + an OPERATIONAL commit (the same
 *    inertness contract as the seal — a workspace that never opts in is
 *    byte-for-byte unchanged);
 *  - always requires an unlocked session at rule time. There is no
 *    "declared" fallback: an attestation without a key would be a lie.
 */
export function shouldAttest(event, settings) {
  const type = String(event?.type || '');
  if (type.startsWith(IDENTITY_TRIGGER_PREFIX)) return true;
  if (!settings || settings.identityEnabled !== true) return false;
  return isOperationalCommit(event);
}

/**
 * The events this transaction has appended since the previous attestation —
 * the same positional construction the seal uses, so verification can replay
 * it from the log alone.
 */
export function freshEventsForAttestation(events, lastIndex) {
  return (events || []).slice(lastIndex + 1).slice(-IDENTITY_LIMITS.txEventCap);
}

/* ----------------------------------------------------------- verification */

/**
 * Replay every attestation. Structural checks need no key; MAC checks use the
 * provided per-seat keys (typically just the active session). Verdicts are
 * three-valued per the module header — a missing key is "unverifiable", never
 * "verified". `rows` is the display-capped tail; `counts` and `bySeat` cover
 * the whole log.
 */
export function verifyAttestations(state, { keys = new Map(), now = new Date() } = {}) {
  const events = Array.isArray(state?.events) ? state.events : [];
  const rows = [];
  const bySeat = new Map();
  const counts = {
    total: 0, verified: 0, failed: 0, digestOnly: 0, evicted: 0, mismatch: 0, malformed: 0,
  };
  const seatCounts = (seatId) => {
    if (!bySeat.has(seatId)) {
      bySeat.set(seatId, { seatId, attested: 0, verified: 0, failed: 0, digestOnly: 0, evicted: 0, mismatch: 0, lastAttestAt: null });
    }
    return bySeat.get(seatId);
  };
  let prevIndex = -1;
  let lastSeen = null;
  for (let i = 0; i < events.length; i += 1) {
    const raw = events[i];
    const parsed = parseAttestationEvent(raw);
    if (!parsed) {
      if (raw && raw.type === IDENTITY_EVENTS.ATTESTED) {
        counts.total += 1; counts.malformed += 1;
        rows.push({ index: i, rev: null, seatId: null, keyId: null, evCount: 0, structure: 'malformed', mac: 'unknown', verdict: 'malformed', ts: raw.ts || null });
      }
      continue;
    }
    counts.total += 1;
    // The signed window is the LAST evCount events before the attestation
    // (the rule signs slice(lastPos).slice(-txEventCap)). A gap larger than
    // evCount is either a front-trimmed >512-event transaction or an
    // insertion before the window: the signed tail still recomputes, and the
    // uncovered prefix is COUNTED, never hidden. A gap smaller than evCount
    // means events vanished (retention or deletion) — reported as evicted.
    const between = events.slice(prevIndex + 1, i);
    let structure;
    let uncoveredPrefix = 0;
    if (between.length < parsed.evCount) {
      structure = 'evicted';
    } else {
      uncoveredPrefix = between.length - parsed.evCount;
      const window = between.slice(-parsed.evCount);
      structure = txDigest(window) === parsed.digest ? 'ok' : 'mismatch';
    }
    const key = keys.get(parsed.seatId) || null;
    let mac = 'unknown';
    if (key) {
      const expected = computeAttestation(key, {
        seatId: parsed.seatId, keyId: parsed.keyId, revision: parsed.rev, digest: parsed.digest,
      });
      mac = expected === parsed.mac ? 'verified' : 'failed';
    }
    let verdict;
    if (mac === 'failed' || structure === 'mismatch') verdict = 'FAILED';
    else if (structure === 'evicted') verdict = 'EVICTED';
    else if (mac === 'verified') verdict = 'verified';
    else verdict = 'digest-verified · key unavailable';
    const bucket = verdict === 'verified' ? 'verified'
      : verdict === 'FAILED' ? (structure === 'mismatch' ? 'mismatch' : 'failed')
        : verdict === 'EVICTED' ? 'evicted' : 'digestOnly';
    // A MAC failure is a failed attestation even when structure drifted.
    counts[bucket] += 1;
    const s = seatCounts(parsed.seatId);
    s.attested += 1;
    if (bucket === 'verified') s.verified += 1;
    else if (bucket === 'failed' || bucket === 'mismatch') s.failed += 1;
    else if (bucket === 'evicted') s.evicted += 1;
    else s.digestOnly += 1;
    if (parsed.ts && (!s.lastAttestAt || parsed.ts > s.lastAttestAt)) s.lastAttestAt = parsed.ts;
    rows.push({
      index: i, rev: parsed.rev, seatId: parsed.seatId, keyId: parsed.keyId,
      evCount: parsed.evCount, structure, mac, verdict, ts: parsed.ts, uncoveredPrefix,
    });
    prevIndex = i;
    lastSeen = parsed;
  }
  return {
    engineVersion: IDENTITY_ENGINE_VERSION,
    counts,
    bySeat: [...bySeat.values()],
    rows: rows.slice(-IDENTITY_LIMITS.blockListCap),
    lastAttestation: lastSeen,
    verifiedAt: now.toISOString(),
  };
}

/* ---------------------------------------------------- span posture roll-up */

function ancestorsOfNode(chain, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < 16) {
    out.push(cursor);
    const node = chain.nodes.get(cursor);
    const parent = node?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

function emptySeatRow(built, chain, seatId) {
  const seat = built.byId.get(seatId);
  const node = chain.nodes.get(seatId);
  const altitude = altitudeByKey(node?.altitude || (seatId === 'leader' ? 'chief' : null));
  return {
    seatId,
    label: seat?.label || node?.name || (seatId === 'leader' ? 'Workspace leader' : (seatId === '__operator__' ? 'Workspace operator' : seatId)),
    altitudeKey: altitude?.key || null,
    altitudeLabel: altitude?.label || 'Enterprise',
    rank: altitudeRank(node?.altitude || 'chief'),
    enrolled: false,
    keyId: null,
    attestedTx: 0,
    unattributedN: 0,
    verifiedN: 0,
    failedN: 0,
    lastAttestAt: null,
  };
}

function rawSeatCounts(state) {
  const attested = new Map();
  const unattr = new Map();
  const events = Array.isArray(state?.events) ? state.events : [];
  for (const event of events) {
    if (!event) continue;
    if (event.type === IDENTITY_EVENTS.ATTESTED) {
      const parsed = parseAttestationEvent(event);
      if (parsed) attested.set(parsed.seatId, (attested.get(parsed.seatId) || 0) + 1);
    } else if (event.type === 'identity.unattributed') {
      const seatId = String(event.summary || '').match(/seat=(\S+)/)?.[1] || 'unknown';
      unattr.set(seatId, (unattr.get(seatId) || 0) + 1);
    }
  }
  return { attested, unattr };
}

/**
 * Per-span integrity posture, rolled up the command chain exactly like the
 * seal's span attestations: a seat's counts also count at every leadership
 * ancestor, so a frontline credential gap surfaces on the director's, VP's
 * and chief's view with zero re-entry (§0.3 vertical roll-up).
 */
export function identitySpanPosture(state, { now = new Date(), settings = null, keys = new Map() } = {}) {
  const effective = settings || state?.settings || {};
  const chain = buildChain(state, { now, settings: effective });
  const built = buildSeats(state, { now, settings: effective });
  const rows = new Map();
  const rowFor = (seatId) => {
    if (!rows.has(seatId)) rows.set(seatId, emptySeatRow(built, chain, seatId));
    return rows.get(seatId);
  };

  for (const enrollment of (Array.isArray(state?.seatIdentities) ? state.seatIdentities : [])) {
    const row = rowFor(enrollment.seatId);
    row.enrolled = true;
    row.keyId = enrollment.keyId;
  }
  const { attested, unattr } = rawSeatCounts(state);
  for (const [seatId, n] of attested) rowFor(seatId).attestedTx = n;
  for (const [seatId, n] of unattr) rowFor(seatId).unattributedN = n;
  const verification = verifyAttestations(state, { keys, now });
  for (const s of verification.bySeat) {
    const row = rowFor(s.seatId);
    row.verifiedN = s.verified;
    row.failedN = s.failed;
    row.lastAttestAt = s.lastAttestAt;
  }

  // Vertical roll-up: each seat's own posture counts at every leadership
  // ancestor (including itself). Snapshot first so iteration is stable.
  const sources = [...rows.values()];
  const rolled = new Map();
  for (const row of sources) {
    for (const ancestorId of ancestorsOfNode(chain, row.seatId)) {
      if (!rolled.has(ancestorId)) {
        const base = rowFor(ancestorId);
        rolled.set(ancestorId, {
          ...base,
          ownAttestedTx: base.attestedTx,
          ownUnattributedN: base.unattributedN,
          enrolledSubtree: 0,
          attestedTx: 0, unattributedN: 0, verifiedN: 0, failedN: 0, lastAttestAt: null,
        });
      }
      const target = rolled.get(ancestorId);
      target.attestedTx += row.attestedTx;
      target.unattributedN += row.unattributedN;
      target.verifiedN += row.verifiedN;
      target.failedN += row.failedN;
      if (row.enrolled) target.enrolledSubtree += ancestorId === row.seatId ? 1 : 1;
      if (row.lastAttestAt && (!target.lastAttestAt || row.lastAttestAt > target.lastAttestAt)) {
        target.lastAttestAt = row.lastAttestAt;
      }
    }
  }
  const list = [...rolled.values()].sort((a, b) => (a.rank - b.rank) || String(a.label).localeCompare(String(b.label)));
  return list.slice(0, IDENTITY_LIMITS.spanRowCap);
}

/**
 * Seat scoping for the posture table: under a declared seat, spans outside the
 * seat's own subtree collapse into one aggregate row — no sideways names, no
 * peer detail, counts survive upward. The undeclared operator sees all.
 */
export function scopeIdentitySpans(spans, state, { settings = null } = {}) {
  const effective = settings || state?.settings || {};
  if (!effective.activeSeatId) return { scoped: false, spans };
  const built = buildSeats(state, { settings: effective });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { scoped: false, spans };
  const detailed = [];
  let outSeats = 0; let outAttested = 0; let outUnattr = 0;
  for (const row of spans) {
    if (seat.scope.has(row.seatId) || row.seatId === seat.id) detailed.push(row);
    else {
      outSeats += 1; outAttested += row.attestedTx; outUnattr += row.unattributedN;
    }
  }
  if (outSeats) {
    detailed.push({
      seatId: '__out-of-scope__', label: `${outSeats} span(s) outside this seat's subtree`,
      altitudeKey: null, altitudeLabel: 'aggregate only', rank: null,
      enrolled: false, keyId: null, attestedTx: outAttested, unattributedN: outUnattr,
      verifiedN: 0, failedN: 0, lastAttestAt: null, aggregate: true,
    });
  }
  return { scoped: true, seatLabel: seat.label, seatRank: seat.rank, spans: detailed };
}

/* ----------------------------------------------------------------- report */

/**
 * The Identity Ledger read model. When a session is active, MAC verification
 * runs for that seat; everything else is structural. The report never
 * contains key material — public fingerprints only.
 */
export function identityReport(state, { now = new Date(), settings = null, session = null } = {}) {
  const effective = settings || state?.settings || {};
  const active = session || activeIdentitySession(now.getTime());
  const keys = new Map();
  if (active) keys.set(active.seatId, active.key);
  const verification = verifyAttestations(state, { keys, now });
  const spans = identitySpanPosture(state, { now, settings: effective, keys });
  const enrollments = (Array.isArray(state?.seatIdentities) ? state.seatIdentities : []).map((row) => ({
    seatId: row.seatId,
    keyId: row.keyId,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
  }));
  const unattributed = (Array.isArray(state?.events) ? state.events : [])
    .filter((e) => e && e.type === 'identity.unattributed').length;
  const seal = lastSealEvent(state);
  return {
    engineVersion: IDENTITY_ENGINE_VERSION,
    enabled: effective.identityEnabled === true,
    enforced: effective.identityEnforced === true,
    autoPropagate: effective.identityAutoPropagate !== false,
    idleMins: effective.identityIdleMins || 30,
    session: active
      ? { active: true, seatId: active.seatId, keyId: active.keyId, expiresAt: active.expiresAt }
      : { active: false },
    enrollments,
    attestedTx: verification.counts.total,
    unattributed,
    verification,
    spans,
    sealHead: seal ? seal.parsed.seal : null,
    sealMode: seal ? verifySealChain(state).mode : 'none',
  };
}

/** Nav badge: a failed attestation or an unattributed write is attention. */
export function identityAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = identityReport(state, { now, settings });
  return report.verification.counts.failed + report.verification.counts.mismatch + report.unattributed;
}

/* --------------------------------------------------------------- exports */

/**
 * Identity-free brief (Markdown). No person ids, no seat labels — only
 * counts, verdicts and the honest limits of the rung this workspace stands
 * on.
 */
export function identityBriefText(report) {
  const v = report.verification;
  const lines = [
    '# LeadOS Attestation Certificate',
    '',
    `- Engine: ${report.engineVersion}`,
    `- Generated at: ${v.verifiedAt || 'unknown'}`,
    `- Identity enabled: ${report.enabled ? 'yes' : 'no'} · Enforcement: ${report.enforced ? 'ON — unattributed writes are refused and escalated' : 'off — advisory'}`,
    `- Session: ${report.session.active ? `unlocked (credential ${report.session.keyId})` : 'locked — MAC verification unavailable in this session'}`,
    `- Enrolled credentials: ${report.enrollments.length}`,
    `- Attested transactions: ${report.attestedTx}`,
    `- Unattributed writes on record: ${report.unattributed}`,
    `- Verification: ${v.counts.verified} verified · ${v.counts.digestOnly} digest-verified (key unavailable) · ${v.counts.failed} failed · ${v.counts.mismatch} content-mismatch · ${v.counts.evicted} evicted · ${v.counts.malformed} malformed`,
    `- Sealed chain head: ${report.sealHead ? `${report.sealHead.slice(0, 16)}…` : 'no seal on record (enable the Sealed Spine for rung 1)'}`,
    '',
    '## Assurance ladder',
    '',
    '- Rung 1 — hash chain (Sealed Spine): detects edits, reordering and deletion of events.',
    '- Rung 2 — per-seat HMAC attestation (this certificate): binds each transaction to a passphrase-derived credential held only in memory. Tamper-evident against anyone without that credential.',
    '- Rung 3 — signed checkpoint: export a checkpoint document and keep it OUTSIDE the workspace to detect truncation of the tail.',
    '- Not claimed: third-party non-repudiation (a MAC is symmetric; enrollment and verification happen in the same workspace), authentication of a human being, or any security boundary against an attacker who controls this browser while it is unlocked.',
    '',
    '## Limitations',
    '',
    '- A row reading “digest-verified, key unavailable” is NOT verified authorship: the structure recomputes, but no unlocked credential could confirm who wrote it.',
    '- Importing a backup replaces the workspace wholesale and is never attested; attestations cover commits made in this workspace after enrollment.',
    '- The workspace owner sets every passphrase. This is accountable authorship inside one organization, not a multi-tenant security boundary.',
    '',
  ];
  return lines.join('\n');
}

/**
 * Aggregate-only CSV rows: one workspace row + one row per leadership
 * altitude. NO seat id, NO label, NO key fingerprint. A rate below the
 * 5-transaction cell floor is BLANK, never 0.
 */
export function identityCsvRows(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const keys = new Map();
  const active = activeIdentitySession(now.getTime());
  if (active) keys.set(active.seatId, active.key);
  const chain = buildChain(state, { now, settings: effective });
  const verification = verifyAttestations(state, { keys, now });
  const events = Array.isArray(state?.events) ? state.events : [];

  const altOfSeat = (seatId) => {
    const node = chain.nodes.get(seatId);
    const alt = altitudeByKey(node?.altitude || (seatId === 'leader' ? 'chief' : null));
    return { key: alt?.key || 'enterprise', label: alt?.label || 'Enterprise' };
  };
  const attestedByAlt = new Map();
  for (const s of verification.bySeat) {
    const alt = altOfSeat(s.seatId);
    attestedByAlt.set(alt.key, { label: alt.label, attested_tx: (attestedByAlt.get(alt.key)?.attested_tx || 0) + s.attested });
  }
  const enrolledByAlt = new Map();
  for (const enrollment of (Array.isArray(state?.seatIdentities) ? state.seatIdentities : [])) {
    const alt = altOfSeat(enrollment.seatId);
    enrolledByAlt.set(alt.key, (enrolledByAlt.get(alt.key) || 0) + 1);
  }
  const unattrByAlt = new Map();
  for (const event of events) {
    if (event && event.type === 'identity.unattributed') {
      const seatId = String(event.summary || '').match(/seat=(\S+)/)?.[1] || 'unknown';
      const alt = altOfSeat(seatId);
      unattrByAlt.set(alt.key, (unattrByAlt.get(alt.key) || 0) + 1);
    }
  }

  const totalUnattr = events.filter((e) => e && e.type === 'identity.unattributed').length;
  const rate = (a, b) => (b >= 5 ? Math.round((a / b) * 1000) / 10 : '');
  const rows = [];
  rows.push({
    scope: 'workspace', altitude: 'all',
    enrolled_seats: (Array.isArray(state?.seatIdentities) ? state.seatIdentities : []).length,
    attested_tx: verification.counts.total,
    unattributed_n: totalUnattr,
    verified_n: verification.counts.verified,
    failed_n: verification.counts.failed + verification.counts.mismatch,
    digest_only_n: verification.counts.digestOnly,
    evicted_n: verification.counts.evicted,
    verified_rate_pct: rate(verification.counts.verified, verification.counts.total),
    verdict: (verification.counts.failed + verification.counts.mismatch) > 0 ? 'FAILED ATTESTATIONS ON RECORD'
      : totalUnattr > 0 ? 'unattributed writes on record'
        : verification.counts.total > 0 ? 'no failed attestation on record' : 'no attestation on record yet',
  });
  const altKeys = [...new Set([...attestedByAlt.keys(), ...enrolledByAlt.keys(), ...unattrByAlt.keys()])];
  for (const key of altKeys) {
    rows.push({
      scope: 'altitude', altitude: attestedByAlt.get(key)?.label || (key === 'chief' ? 'Chief' : key),
      enrolled_seats: enrolledByAlt.get(key) || 0,
      attested_tx: attestedByAlt.get(key)?.attested_tx || 0,
      unattributed_n: unattrByAlt.get(key) || 0,
      verified_n: '',
      failed_n: '',
      digest_only_n: '',
      evicted_n: '',
      verified_rate_pct: '',
      verdict: 'verification verdicts are workspace-level; a per-altitude verdict is refused below the evidence floor',
    });
  }
  return rows;
}

/* ------------------------------------------------- rung 3: checkpoints */

/**
 * A signed checkpoint document. Kept OUTSIDE the workspace it anchors, it
 * detects TRUNCATION of the tail — the one attack a self-referential hash
 * chain cannot see (assurance rung 3; see ADR-0089).
 */
export function buildIdentityCheckpoint(state, { now = new Date(), session = null } = {}) {
  const active = session || activeIdentitySession(now.getTime());
  const keys = new Map();
  if (active) keys.set(active.seatId, active.key);
  const verification = verifyAttestations(state, { keys, now });
  const seal = lastSealEvent(state);
  const events = Array.isArray(state?.events) ? state.events : [];
  const revision = Number(state?.meta?.revision || 0);
  const enrollments = Array.isArray(state?.seatIdentities) ? state.seatIdentities : [];
  const lines = [
    '# LeadOS Attested Checkpoint',
    '',
    `- Engine: ${IDENTITY_ENGINE_VERSION}`,
    `- Generated at: ${now.toISOString()}`,
    `- Credential: ${active ? `seat=${active.seatId} key=${active.keyId} (signed)` : 'no session — UNSIGNED checkpoint (structure only)'}`,
    `- Workspace revision: ${revision}`,
    `- Events in log: ${events.length}`,
    `- Attested transactions: ${verification.counts.total} (verified ${verification.counts.verified}, failed ${verification.counts.failed}, digest-only ${verification.counts.digestOnly}, evicted ${verification.counts.evicted})`,
    `- Sealed blocks: ${verifySealChain(state).blocks} · Chain head: ${seal ? seal.parsed.seal : 'none'}`,
    `- Enrolled credentials: ${enrollments.length} (fingerprints)`,
    '',
    '## Credential fingerprints',
    '',
    ...enrollments.map((row) => `- seat=${row.seatId} key=${row.keyId}${row.rotatedAt ? ' (rotated)' : ''}${row.revokedAt ? ' (revoked)' : ''}`),
    '',
    '## How to use this document',
    '',
    'Keep it OUTSIDE the workspace (a printed page, another device, an email to yourself). Later, open Identity Ledger → Compare checkpoint. If the workspace shows FEWER events or a LOWER revision than this document, the tail was truncated. A hash chain cannot see that; this anchor can.',
    '',
    '## Limitations',
    '',
    '- A checkpoint detects truncation only up to what it recorded. Work added after it is unprotected until you export a newer checkpoint.',
    '- The MAC (below) proves this document was produced under a seat credential; an UNSIGNED checkpoint still anchors counts honestly but anyone can write one.',
    '',
  ];
  const body = lines.join('\n');
  const mac = active
    ? hmacSha256Hex(active.key, `${IDENTITY_CHECKPOINT_DOMAIN}|${active.seatId}|${active.keyId}|${sha256Hex(body)}`)
    : '';
  const text = `${body}checkpoint-mac=${mac || 'UNSIGNED'}\n`;
  return {
    ok: true,
    text: text.slice(0, IDENTITY_LIMITS.checkpointMaxChars),
    signed: Boolean(active),
    seatId: active?.seatId || null,
    keyId: active?.keyId || null,
    revision,
    eventCount: events.length,
    chainHead: seal ? seal.parsed.seal : null,
    mac,
  };
}

/**
 * Compare a checkpoint document against the CURRENT workspace. The verdict is
 * a direction, not a mood: chain-advanced (normal), TRUNCATED (fewer events or
 * a lower revision than the anchor — the attack rung 3 exists for), REWRITTEN
 * (same counts but a different chain head), REWOUND, or malformed.
 */
export function verifyIdentityCheckpoint(state, certText, { now = new Date(), session = null } = {}) {
  const text = String(certText || '');
  const rev = Number(text.match(/Workspace revision: (\d+)/)?.[1]);
  const evCount = Number(text.match(/Events in log: (\d+)/)?.[1]);
  const head = text.match(/Chain head: ([0-9a-f]{64}|none)/)?.[1] || '';
  const macLine = text.match(/checkpoint-mac=([0-9a-f]{64}|UNSIGNED)/)?.[1] || '';
  if (!Number.isFinite(rev) || !Number.isFinite(evCount)) {
    return { ok: false, verdict: 'malformed', detail: 'This document does not carry a revision and event count.' };
  }
  const body = text.slice(0, text.lastIndexOf('checkpoint-mac='));
  const active = session || activeIdentitySession(now.getTime());
  let macVerdict = 'unsigned';
  if (macLine && macLine !== 'UNSIGNED' && active) {
    const seatId = text.match(/Credential: seat=(\S+) key=/)?.[1] || active.seatId;
    const keyId = text.match(/Credential: seat=\S+ key=([0-9a-f]{16})/)?.[1] || active.keyId;
    const expected = hmacSha256Hex(active.key, `${IDENTITY_CHECKPOINT_DOMAIN}|${seatId}|${keyId}|${sha256Hex(body)}`);
    macVerdict = expected === macLine ? 'verified' : 'FAILED';
  } else if (macLine && macLine !== 'UNSIGNED' && !active) {
    macVerdict = 'key unavailable';
  }
  const events = Array.isArray(state?.events) ? state.events : [];
  const currentRev = Number(state?.meta?.revision || 0);
  const currentHead = lastSealEvent(state)?.parsed?.seal || 'none';
  let verdict;
  let detail;
  if (events.length < evCount) {
    verdict = 'TRUNCATED';
    detail = `The log holds ${events.length} event(s) but this checkpoint anchored ${evCount}. The tail was truncated (or this is an older, smaller workspace).`;
  } else if (currentRev < rev) {
    verdict = 'REWOUND';
    detail = `The workspace is at revision ${currentRev} but this checkpoint anchored ${rev}.`;
  } else if (events.length === evCount && head && head !== 'none' && currentHead !== head) {
    verdict = 'REWRITTEN';
    detail = 'Same event count as the checkpoint, but the chain head no longer matches — the sealed blocks were replaced.';
  } else {
    verdict = 'chain-advanced';
    detail = `Workspace has advanced since the checkpoint (${events.length} events, revision ${currentRev}); nothing below the anchor moved.`;
  }
  return {
    ok: true,
    verdict,
    detail,
    macVerdict,
    anchored: { revision: rev, eventCount: evCount, chainHead: head },
    current: { revision: currentRev, eventCount: events.length, chainHead: currentHead },
  };
}
