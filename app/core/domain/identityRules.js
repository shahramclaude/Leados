/**
 * app/core/domain/identityRules.js — post-commit rules for the Attested Commit
 * (Schema v93, ADR-0087).
 *
 * RULE-IDN-01 ATTEST. When a seat credential session is unlocked and the
 * commit qualifies, append ONE `identity.attested` event whose entityId is the
 * HMAC the seat key computes over (seatId | keyId | revision | digest of every
 * event this transaction appended before it). Idempotent by revision — a
 * re-run never double-attests. There is NO declared fallback: without a key
 * the rule writes nothing, because an attestation without a key is a lie.
 * This pass is deliberately NOT pausable: pausing attestation while claiming
 * enforcement would be a lie too. Only the breach work below is pausable.
 *
 * RULE-IDN-02 UNATTRIBUTED. Under enforcement, a commit with no unlocked
 * credential logs one `identity.unattributed` event (revision-idempotent) and
 * opens ONE governed DACI decision per acting seat per ISO week — asking the
 * span what to do about writes nobody would sign for — with typed
 * `rolls-up-to` edges from that decision to EVERY leadership ancestor of the
 * acting seat in the SAME transaction. A frontline unattributed write reaches
 * the manager, director, VP and chief spans with zero re-entry (§0.3).
 * Session-lifecycle events (enroll/unlock/lock/…) are never "unattributed":
 * they ARE the identity boundary. Pausable via `identityAutoPropagate`.
 *
 * RULE-IDN-03 VERIFY. An explicit `identity.scan` recomputes every attestation
 * verdict and appends ONE `identity.verified` event carrying the counts, so a
 * human-requested check is traceable in the same log it verifies — including
 * honest counts for "digest-verified, key unavailable", which is never
 * silently upgraded to verified.
 *
 * All three live on the same generalized spine as ADR-0008/0026/0075/0082:
 * marker-idempotent, savepoint-atomic, and sealed by sealRule which runs
 * ABSOLUTELY LAST — so one seal covers the attestation itself.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { txDigest } from './sealChain.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { UNDECLARED_SEAT } from './seatRegistry.js';
import { isOperationalCommit } from './seatRules.js';
import {
  IDENTITY_EVENTS, IDENTITY_RULE_IDS, IDENTITY_SESSION_EVENTS,
} from './identityRegistry.js';
import {
  computeAttestation, freshEventsForAttestation,
  lastAttestationEvent, shouldAttest, verifyAttestations,
} from './identity.js';
import { activeIdentitySession } from './identitySession.js';

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function markerStore(draft) {
  if (!Array.isArray(draft.identityMarkers)) draft.identityMarkers = [];
  return draft.identityMarkers;
}

function seen(draft, tag) {
  return markerStore(draft).includes(tag);
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > 400) markers.splice(0, markers.length - 400);
  return true;
}

/** Leadership ancestors of a seat (including the seat itself, never the
 * synthetic root): the same walk RULE-ACL-01 and the seat roll-up use. */
function ancestorsOf(built, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < 16) {
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    const parent = built.chain.nodes.get(cursor)?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

function ownerName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const person = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (person && person.name) || (draft.settings && draft.settings.leaderName) || 'The workspace owner';
}

function newUnattributedDecision(ctx, draft, seatId, seatLabel, week, now) {
  return {
    id: ctx.idFactory('dec'),
    title: `What do we do about writes nobody would sign for (week of ${week})?`,
    question: `Under attestation enforcement, ${seatLabel} logged write(s) in this ISO week with no unlocked seat credential. Enforcement is a claim the workspace makes about itself; this decision asks the span that owns the claim what to do about the gap — enroll the missing credentials, pause enforcement while the span migrates, or accept the risk in writing. No person is the subject of this decision; the subject is the workspace’s authorship boundary.`,
    date: dayKey(now),
    reversibility: 'reversible',
    driver: ownerName(draft),
    approver: ownerName(draft),
    contributors: '',
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: 'Enroll the missing credentials: every seat that writes here signs here',
        pros: 'Closes the gap at the source; attestation becomes complete within a day.',
        cons: 'Each seat holder must set and remember a passphrase; there is no recovery.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Pause enforcement while the span migrates, with a dated re-enable check',
        pros: 'Honest interim state: the workspace stops claiming a boundary it does not have.',
        cons: 'Until re-enabled, writes are advisory-only and the gap is not escalated.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Accept the gap in writing: record who may write unattributed and why',
        pros: 'Sometimes a shared station or a break-glass path is legitimate.',
        cons: 'A standing exception becomes invisible unless someone re-reads it.',
      },
    ],
    chosen: '',
    rationale: `Opened by RULE-IDN-02: unattributed write(s) under attestation enforcement for ${seatLabel} in ISO week ${week}. The rule names no person and changes no record; it opens the question for the span that owns the boundary, and rolls the question up every leadership ancestor above it.`,
    reviewOn: dayKey(addDays(now, 14)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: now.toISOString(),
  };
}

/* --------------------------------------------------------- RULE-IDN-02 */

function unattributedRule(draft, ctx, built, seatId, viaScan = false) {
  const effects = [];
  const now = ctx.now;
  const revision = Number(draft?.meta?.revision || 0);
  const events = Array.isArray(draft.events) ? draft.events : [];
  const alreadyLogged = events.some((e) => e && e.type === 'identity.unattributed'
    && String(e.summary || '').includes(`rev=${revision}`));
  const seatLabel = seatId === UNDECLARED_SEAT
    ? 'the undeclared operator view'
    : (built.byId.get(seatId)?.label || seatId);

  if (!alreadyLogged) {
    ctx.logEvent({
      type: 'identity.unattributed',
      entity: 'seat',
      entityId: seatId === UNDECLARED_SEAT ? '' : seatId,
      summary: (viaScan
        ? `seat=${seatId} rev=${revision} — an explicit identity scan surfaced this authorship gap: writes land under attestation enforcement with no unlocked seat credential.`
        : `seat=${seatId} rev=${revision} — a write landed under attestation enforcement with no unlocked seat credential.`).slice(0, 300),
    });
    effects.push(effect(IDENTITY_RULE_IDS.UNATTRIBUTED, 'logged', 'seat', seatId,
      viaScan
        ? `Explicit scan recorded one unattributed-write gap at revision ${revision} (${seatLabel}).`
        : `Recorded one unattributed write at revision ${revision} (${seatLabel}).`));
  }

  const week = weekKey(now) || dayKey(now);
  const tag = `${IDENTITY_RULE_IDS.UNATTRIBUTED}:week:${week}:${seatId}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);

  const decision = newUnattributedDecision(ctx, draft, seatId, seatLabel, week, now);
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
  effects.push(effect(IDENTITY_RULE_IDS.UNATTRIBUTED, 'created', 'decision', decision.id,
    `Opened one governed authorship-boundary decision for ${seatLabel} (ISO week ${week}).`));

  // Cross-altitude roll-up: the decision climbs EVERY leadership ancestor of
  // the acting seat in this same transaction — the generalized graph, not a
  // second system. The synthetic root is excluded; a single-operator
  // workspace has no one above it to notify, by definition.
  for (const targetId of ancestorsOf(built, seatId === UNDECLARED_SEAT ? LEADER_ID : seatId)) {
    if (link(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to',
      IDENTITY_RULE_IDS.UNATTRIBUTED,
      `An unattributed-write decision for ${seatLabel} rolls up to this leadership span.`)) {
      effects.push(effect(IDENTITY_RULE_IDS.UNATTRIBUTED, 'linked', 'person', targetId,
        `Rolled the authorship-boundary decision up to ${built.byId.get(targetId)?.label || 'a span'}.`));
    }
  }
  return effects;
}

/* --------------------------------------------------------- RULE-IDN-01 */

function attestRule(draft, ctx, session) {
  const effects = [];
  const revision = Number(draft?.meta?.revision || 0);
  const last = lastAttestationEvent(draft);
  if (last && last.parsed.rev === revision) return effects; // idempotent by revision
  const events = Array.isArray(draft.events) ? draft.events : [];
  const fresh = freshEventsForAttestation(events, last ? last.index : -1);
  const digest = txDigest(fresh);
  const mac = computeAttestation(session.key, {
    seatId: session.seatId, keyId: session.keyId, revision, digest,
  });
  const root = ctx.event ? `${ctx.event.entity || 'workspace'}:${ctx.event.entityId || ''}` : '';
  ctx.logEvent({
    type: IDENTITY_EVENTS.ATTESTED,
    entity: 'seat',
    entityId: mac,
    summary: `seat=${session.seatId} key=${session.keyId} rev=${revision} ev=${fresh.length} digest=${digest} mode=hmac root=${root}`.slice(0, 300),
  });
  effects.push(effect(IDENTITY_RULE_IDS.ATTEST, 'attested', 'seat', session.seatId,
    `Revision ${revision} attested by credential ${session.keyId}: ${fresh.length} event(s) in the signed digest.`));
  return effects;
}

/* --------------------------------------------------------- RULE-IDN-03 */

function verifyRule(draft, ctx, now) {
  const effects = [];
  const session = activeIdentitySession(now.getTime());
  const keys = new Map();
  if (session) keys.set(session.seatId, session.key);
  const v = verifyAttestations(draft, { keys, now });
  const verdict = `${v.counts.verified} verified, ${v.counts.digestOnly} digest-verified (key unavailable), ${v.counts.failed} failed, ${v.counts.mismatch} content-mismatch, ${v.counts.evicted} evicted, ${v.counts.malformed} malformed`;
  ctx.logEvent({
    type: IDENTITY_EVENTS.VERIFIED,
    entity: 'workspace',
    entityId: '',
    summary: `Attestation verification: ${verdict}`.slice(0, 300),
  });
  effects.push(effect(IDENTITY_RULE_IDS.VERIFY, 'verified', 'workspace', '',
    `Attestation verification recorded: ${verdict}.`));
  return effects;
}

/* ------------------------------------------------------------- the rule */

export function identityRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const settings = draft.settings || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const type = String(ctx.event.type || '');
  const explicit = type === IDENTITY_EVENTS.SCAN;
  const effects = [];

  // RULE-IDN-02 first: its decision and roll-up edges belong to the content
  // this transaction commits, so RULE-IDN-01's digest covers them.
  const enforcementLive = settings.identityEnforced === true
    && !activeIdentitySession(now.getTime());
  const unattributedWrite = enforcementLive
    && isOperationalCommit(ctx.event)
    && !IDENTITY_SESSION_EVENTS.has(type);
  const scanSurfacesGap = enforcementLive && explicit;
  if ((unattributedWrite && settings.identityAutoPropagate !== false) || scanSurfacesGap) {
    const built = buildSeats(draft, { now, settings: draft.settings });
    if (built) {
      const seatId = settings.activeSeatId || UNDECLARED_SEAT;
      effects.push(...unattributedRule(draft, scoped, built, seatId, explicit));
    }
  }

  // RULE-IDN-01: attestation is not automation — it is the identity of the
  // write itself, so it is gated on a session and the enable flag only.
  const session = activeIdentitySession(now.getTime());
  if (session && shouldAttest(ctx.event, settings)) {
    effects.push(...attestRule(draft, scoped, session));
  }

  // RULE-IDN-03: an explicit scan always verifies and records the verdict.
  if (explicit) {
    effects.push(...verifyRule(draft, scoped, now));
  }

  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}

// The spine's order contract is asserted by stable id (attention-market.test):
// this rule runs BEFORE attentionMarketRule so the integrity decision it opens
// is priced by the market like any other work, and the market keeps its
// "last work-producing rule" invariant.
identityRule.id = 'identityRule';
identityRule.label = 'Attested Commit — per-seat authorship attestation (RULE-IDN-01..03)';
