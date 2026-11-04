/**
 * app/core/domain/sealRules.js — the Sealed Spine's post-commit rule (ADR-0082).
 *
 * Registered LAST on the shared spine (after seatRule), so the seal of a
 * transaction covers everything every other module's rules wrote in that same
 * atomic commit: case propagation, DACI decisions, delegations, roll-up edges,
 * comms drafts — one seal per transaction across all modules, by construction
 * rather than by per-module glue.
 *
 * RULE-SEAL-01 SEAL. Append one `audit.seal` event committing to
 * (previous seal, digest of the events appended in this transaction, revision).
 * Automatic pass gated on `sealEnabled` + `sealAutoPropagate` + an operational
 * commit — inert on every workspace that has not opted in, exactly like the
 * seat rule's inertness contract. Explicit pass: any `seal.*` event always
 * seals its own transaction. Idempotent by revision: a re-run on the same
 * revision never double-seals.
 *
 * RULE-SEAL-02 VERIFY. An explicit `seal.scan` also appends one `seal.verified`
 * event carrying the verification verdict, so a human-requested check is
 * traceable in the same log it verifies.
 *
 * The seal event reuses the fixed event shape (entityId = 64-hex seal,
 * summary = chain fields), so schema v87 needs no migration and no new
 * collection: the chain lives in the append-only log it protects.
 */

import {
  SEAL_EVENTS, SEAL_GENESIS, SEAL_LIMITS, SEAL_RULE_IDS,
} from './sealRegistry.js';
import {
  computeSeal, lastSealEvent, parseSealEvent, sealModeFor, shouldSeal,
  txDigest, verifySealChain,
} from './sealChain.js';

export function sealRule(draft, ctx) {
  const settings = draft?.settings || {};
  const event = ctx?.event || null;
  if (!shouldSeal(event, settings)) return [];

  // Idempotence: this revision is already sealed (rule retry, re-run).
  const last = lastSealEvent(draft);
  const revision = Number(draft?.meta?.revision || 0);
  if (last && last.parsed.rev === revision) return [];

  // Freshness is positional, not diff-based: the engine deletes
  // `previousState` from rule contexts, but sealRule runs LAST on the spine, so
  // every event after the previous `audit.seal` is exactly what this
  // transaction has appended so far. Events appended after the seal (later
  // derived passes of the same transaction) are covered by the NEXT block.
  const events = Array.isArray(draft?.events) ? draft.events : [];
  const lastPos = last ? events.indexOf(last.event) + 1 : 0;
  const fresh = events.slice(lastPos).slice(-SEAL_LIMITS.txEventCap);

  const digest = txDigest(fresh);
  const prevSeal = last ? last.parsed.seal : SEAL_GENESIS;
  const { mode, key } = sealModeFor(settings);
  const seal = computeSeal({ prevSeal, digest, revision, mode, key });

  const root = event ? `${event.entity || 'workspace'}:${event.entityId || ''}` : '';
  // Full prev/digest travel in the summary (root is last so the 300-char event
  // cap can only truncate the root, never the chain fields): verification must
  // be able to recompute from the log alone.
  const summary = `prev=${prevSeal} digest=${digest} rev=${revision} ev=${fresh.length} mode=${mode} root=${root}`.slice(0, 300);

  if (typeof ctx?.logEvent === 'function') {
    ctx.logEvent({
      type: SEAL_EVENTS.SEAL,
      entity: 'seal',
      entityId: seal,
      summary,
    });
  }

  const effects = [{
    ruleId: SEAL_RULE_IDS.SEAL,
    action: 'sealed',
    targetType: 'workspace',
    targetId: seal.slice(0, 12),
    summary: `Sealed revision ${revision}: ${fresh.length} event(s) in this transaction, mode ${mode}.`,
  }];

  // RULE-SEAL-02: an explicit scan also records the verification verdict.
  if (event && event.type === SEAL_EVENTS.SCAN && typeof ctx?.logEvent === 'function') {
    const v = verifySealChain(draft);
    const verdict = v.chainValid && v.contentValid
      ? `VALID — ${v.blocks} block(s), ${v.sealedEvents} event(s), mode ${v.mode}`
      : `BROKEN — first break: ${v.breaks[0]?.reason || 'unknown'} at block ${v.breaks[0]?.index ?? '?'} (${v.breaks[0]?.detail || ''})`;
    ctx.logEvent({
      type: SEAL_EVENTS.VERIFIED,
      entity: 'seal',
      entityId: '',
      summary: `Chain verification: ${verdict}`.slice(0, 300),
    });
    effects.push({
      ruleId: SEAL_RULE_IDS.VERIFY,
      action: 'verified',
      targetType: 'workspace',
      targetId: '',
      summary: verdict,
    });
  }

  return effects;
}

// Mirrors `seatRule.id` / `seatRule.label` (seatRules.js): the spine's order
// contract is asserted by stable id — sealRule is ABSOLUTELY LAST, seatRule
// immediately before it — so both ends of that pair expose the same shape.
sealRule.id = 'sealRule';
sealRule.label = 'Sealed Spine one-seal-per-commit (RULE-SEAL-01..02)';

export { parseSealEvent };
