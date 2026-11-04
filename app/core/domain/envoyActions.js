/**
 * app/core/domain/envoyActions.js — API mixin for the Federated Envoy
 * (`#/envoy`, ADR-0085). Mounted with `Object.assign(api, …)` like every other
 * module mixin: one command bus, one transaction boundary, one spine.
 *
 * The write path is deliberately small and fail-closed:
 *
 *   compose  → build a packet from THIS span's records, projected at the
 *              receiving altitude's disclosure class, sign it if the vault is
 *              unlocked, and record why each withheld item was withheld.
 *   verify   → recompute every hash the receiver can recompute; a refusal
 *              writes a ledger row and NO artefact.
 *   ingest   → verify, gate on the receiving altitude, then import attested
 *              copies idempotently. A divergence is recorded and handed to
 *              RULE-ENV-02; the local record is never edited by a packet.
 *   scan     → run the three rules explicitly (always available, even paused).
 *
 * Nothing here writes into a foreign record, decides a dispute, or accepts an
 * unverified packet "to look at later".
 */

import { dayKey } from '../time.js';
import { activeSealKey } from './sealCrypto.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import {
  attestationOf,
  buildPacket,
  collectCandidates,
  envoyAttentionCount,
  envoyBriefText,
  envoyCsvRows,
  envoyReport,
  failureText,
  packetText,
  planIngest,
  recipientVerdict,
  verifyPacket,
  workspaceIdentity,
} from './envoy.js';
import {
  envoyConventions,
  normalizeEnvoySettings,
  normalizeExchangeArtefact,
  normalizeExchangePacket,
} from './envoySchema.js';
import {
  ENVOY_EVENTS,
  ENVOY_FORMAT,
  ENVOY_LIMITS,
  ENVOY_VERSION,
} from './envoyRegistry.js';

function ancestorsOf(built, seatId) {
  const out = [];
  if (!built || !seatId) return out;
  let cursor = built.chain?.nodes?.get(seatId)?.parentId || null;
  const visited = new Set([seatId]);
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
  }
  return out;
}

export function createEnvoyActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const packets = () => (Array.isArray(store.state.exchangePackets) ? store.state.exchangePackets : []);
  const artefacts = () => (Array.isArray(store.state.exchangeArtefacts) ? store.state.exchangeArtefacts : []);

  function seatContext() {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    return { built, seat };
  }

  function gate() {
    const { built, seat } = seatContext();
    if (seat.fullAccess) return { built, seat, error: null };
    const right = canAct('exchange-packets', seat);
    if (!right.allow) return { built, seat, error: fail(right.reason, 'scope') };
    return { built, seat, error: null };
  }

  /** Insert or replace one ledger row by id (stable, ordered newest first). */
  function upsertPacket(draft, record) {
    if (!Array.isArray(draft.exchangePackets)) draft.exchangePackets = [];
    const at = draft.exchangePackets.findIndex((row) => row && row.id === record.id);
    if (at >= 0) draft.exchangePackets[at] = record;
    else draft.exchangePackets.unshift(record);
    if (draft.exchangePackets.length > ENVOY_LIMITS.packets) {
      draft.exchangePackets.length = ENVOY_LIMITS.packets;
    }
  }

  function ledgerRow(packet, { direction, status, verification = null, receivedAt = null }) {
    return {
      id: idFactory('envp'),
      packetId: packet.packetId,
      direction,
      status,
      format: packet.format || ENVOY_FORMAT,
      version: packet.version || ENVOY_VERSION,
      schemaVersion: packet.schemaVersion ?? null,
      originWorkspaceId: packet.originWorkspaceId,
      originLabel: packet.originLabel,
      recipientSeatId: packet.recipientSeatId || null,
      recipientAltitudeKey: packet.recipientAltitudeKey || 'chief',
      recipientClass: packet.recipientClass || 'aggregate',
      purpose: packet.purpose || '',
      items: Array.isArray(packet.items) ? packet.items : [],
      withheld: Array.isArray(packet.withheld) ? packet.withheld : [],
      omittedCount: packet.omittedCount || 0,
      attestation: packet.attestation || attestationOf([], clock()),
      merkleRoot: packet.merkleRoot || null,
      signatureKeyed: Boolean(packet.signature && packet.signature.keyed),
      signatureAlg: (packet.signature && packet.signature.alg) || 'sha256',
      verification: verification || { ok: false, failures: [] },
      createdAt: packet.createdAt || clock().toISOString(),
      receivedAt,
      sealedRevision: Number.isFinite(Number(store.state.meta?.revision)) ? store.state.meta.revision : null,
    };
  }

  return {
    /* ----------------------------------------------------------------- reads */

    envoyRead(seatId = null) {
      const { built, seat } = seatContext();
      const viewing = seatId && built.byId.get(seatId) ? built.byId.get(seatId) : seat;
      return envoyReport(store.state, { now: clock(), settings: settings(), seat: viewing });
    },

    envoyBriefText() {
      const report = envoyReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, text: envoyBriefText(report, clock()) };
    },

    envoyCsvRows() {
      return { ok: true, rows: envoyCsvRows(store.state, { now: clock(), settings: settings() }) };
    },

    envoyAttentionCount() {
      return envoyAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    envoyPacketText(packetId) {
      const row = packets().find((packet) => packet && (packet.id === packetId || packet.packetId === packetId));
      if (!row) return fail('Choose a packet this workspace holds.', 'packetId');
      return { ok: true, text: packetText(row), packetId: row.packetId };
    },

    /** What would travel, at what class, for a given recipient — before sending. */
    envoyPreview(input = {}) {
      const gateResult = gate();
      if (gateResult.error) return gateResult.error;
      const { built, seat } = gateResult;
      const conventions = envoyConventions(settings());
      const sendingSeatId = seat.fullAccess ? null : seat.id;
      const spanIds = seat.fullAccess ? null : seat.scope;
      const recipientSeatId = String(input.recipientSeatId || '') || (seat.fullAccess ? LEADER_ID : (ancestorsOf(built, seat.id)[0] || LEADER_ID));
      const recipientNode = built.byId.get(recipientSeatId);
      // The root of the reporting tree is the chief's seat by definition: the
      // workspace leader holds the year, whatever altitude a roster heuristic
      // derived for the pseudo-node that stands for them.
      const recipientAltitudeKey = recipientSeatId === LEADER_ID ? 'chief' : (recipientNode?.altitudeKey || 'chief');
      const packet = buildPacket(store.state, {
        now: clock(),
        settings: settings(),
        recipientSeatId: recipientSeatId === LEADER_ID ? null : recipientSeatId,
        recipientAltitudeKey,
        purpose: input.purpose || '',
        spanIds,
        schemaVersion: store.state.schemaVersion ?? null,
        key: activeSealKey(),
        limit: conventions.envoyMaxItems,
      });
      return {
        ok: true,
        sendingSeatId,
        recipientSeatId: recipientSeatId === LEADER_ID ? null : recipientSeatId,
        recipientAltitudeKey,
        recipientClass: packet.recipientClass,
        itemCount: packet.items.length,
        withheld: packet.withheld,
        attestation: packet.attestation,
        keyed: packet.signature.keyed,
        candidates: collectCandidates(store.state, { spanIds, now: clock(), limit: conventions.envoyMaxItems }).length,
      };
    },

    /* --------------------------------------------------------------- compose */

    envoyCompose(input = {}) {
      const gateResult = gate();
      if (gateResult.error) return gateResult.error;
      const { built, seat } = gateResult;
      const conventions = envoyConventions(settings());
      const stamp = clock();
      const spanIds = seat.fullAccess ? null : seat.scope;
      const explicitRecipient = String(input.recipientSeatId || '');
      const recipientSeatId = explicitRecipient || (seat.fullAccess ? LEADER_ID : (ancestorsOf(built, seat.id)[0] || LEADER_ID));
      const recipientNode = built.byId.get(recipientSeatId);
      if (explicitRecipient && recipientSeatId !== LEADER_ID && !recipientNode) {
        return fail('Choose a leadership seat that exists in this reporting tree.', 'recipientSeatId');
      }
      if (!seat.fullAccess && recipientSeatId !== LEADER_ID && !seat.scope.has(recipientSeatId)) {
        return fail('A packet may only be addressed inside your own span or to the leader above it. A peer span is not reachable from here.', 'recipientSeatId');
      }
      const packet = buildPacket(store.state, {
        now: stamp,
        settings: settings(),
        recipientSeatId: recipientSeatId === LEADER_ID ? null : recipientSeatId,
        recipientAltitudeKey: recipientSeatId === LEADER_ID ? 'chief' : (recipientNode?.altitudeKey || 'chief'),
        purpose: input.purpose || '',
        spanIds,
        schemaVersion: store.state.schemaVersion ?? null,
        key: activeSealKey(),
        limit: conventions.envoyMaxItems,
      });
      if (!packet.items.length && !packet.attestation.items) {
        return fail('There is nothing in this span worth attesting yet: no case, decision, authority contract or pact carries a field the receiving altitude may hold.', 'items');
      }
      const warnings = [];
      const record = normalizeExchangePacket(ledgerRow(packet, {
        direction: 'outbound',
        status: 'built',
        verification: { ok: false, failures: [] },
      }), warnings);
      if (!record) return fail(warnings[0] || 'The packet ledger row could not be validated.');
      store.update((draft) => { upsertPacket(draft, record); }, {
        type: ENVOY_EVENTS.COMPOSED,
        entity: 'envoy',
        entityId: record.id,
        summary: `Composed a ${packet.items.length}-item ${packet.recipientClass} packet for ${packet.recipientAltitudeKey} (${packet.signature.keyed ? 'keyed' : 'plain'} signature).`,
      });
      return saved({
        packet,
        text: packetText(packet),
        recordId: record.id,
        packetId: packet.packetId,
        itemCount: packet.items.length,
        withheldCount: packet.withheld.length,
        keyed: packet.signature.keyed,
        warnings,
      });
    },

    /* ---------------------------------------------------------------- verify */

    envoyVerify(input = {}) {
      const gateResult = gate();
      if (gateResult.error) return gateResult.error;
      const raw = typeof input === 'string' ? input : (input.packet ?? input.text ?? input);
      const verdict = verifyPacket(raw, {
        settings: settings(),
        key: activeSealKey(),
        localSchemaVersion: store.state.schemaVersion ?? null,
      });
      if (!verdict.packet) return fail(verdict.failures[0]?.detail || 'That packet could not be read.');
      const existing = packets().find((row) => row && row.packetId === verdict.packet.packetId && row.direction === 'inbound');
      const record = normalizeExchangePacket(
        { ...(existing || ledgerRow(verdict.packet, { direction: 'inbound', status: 'verified', receivedAt: clock().toISOString() })),
          verification: { ok: verdict.ok, failures: verdict.failures } },
        [],
      );
      store.update((draft) => { if (record) upsertPacket(draft, record); }, {
        type: verdict.ok ? ENVOY_EVENTS.VERIFIED : ENVOY_EVENTS.REFUSED,
        entity: 'envoy',
        entityId: record ? record.id : verdict.packet.packetId,
        summary: verdict.ok
          ? `Verified packet ${verdict.packet.packetId} (${verdict.counts.items} item(s))`
          : `Refused packet ${verdict.packet.packetId}: ${failureText(verdict.failures)}`,
      });
      return {
        ok: verdict.ok,
        error: verdict.ok ? null : failureText(verdict.failures),
        failures: verdict.failures,
        counts: verdict.counts,
        packet: verdict.packet,
        keyed: Boolean(verdict.packet.signature && verdict.packet.signature.keyed),
      };
    },

    /* ---------------------------------------------------------------- ingest */

    envoyIngest(input = {}) {
      const gateResult = gate();
      if (gateResult.error) return gateResult.error;
      const { built, seat } = gateResult;
      const raw = typeof input === 'string' ? input : (input.packet ?? input.text ?? input);
      const stamp = clock();
      const verdict = verifyPacket(raw, {
        settings: settings(),
        key: activeSealKey(),
        localSchemaVersion: store.state.schemaVersion ?? null,
      });
      if (!verdict.packet) return fail(verdict.failures[0]?.detail || 'That packet could not be read.');

      const refusalRecord = (failures) => {
        const record = normalizeExchangePacket(
          { ...ledgerRow(verdict.packet, { direction: 'inbound', status: 'refused', receivedAt: stamp.toISOString() }),
            verification: { ok: false, failures } },
          [],
        );
        store.update((draft) => { if (record) upsertPacket(draft, record); }, {
          type: ENVOY_EVENTS.REFUSED,
          entity: 'envoy',
          entityId: record ? record.id : verdict.packet.packetId,
          summary: `Refused to ingest packet ${verdict.packet.packetId}: ${failureText(failures)}`,
        });
        return { ok: false, error: failureText(failures), failures, counts: verdict.counts, wroteNothing: true };
      };

      if (!verdict.ok) return refusalRecord(verdict.failures);

      const receiverRank = seat.fullAccess ? null : seat.rank;
      const altitude = recipientVerdict(verdict.packet, { receiverRank });
      if (!altitude.ok) return refusalRecord([{ code: 'altitude-mismatch', itemId: null, detail: altitude.reason }]);

      const prior = packets().find((row) => row && row.packetId === verdict.packet.packetId && row.direction === 'inbound' && row.status === 'ingested');
      const plan = planIngest(store.state, verdict.packet, { now: stamp });
      const fresh = plan.filter((row) => row.status === 'imported' || row.status === 'diverged');
      const duplicates = plan.filter((row) => row.status === 'duplicate');

      if (prior && !fresh.length) {
        return saved({
          ingested: false,
          duplicatePacket: true,
          message: 'This workspace already holds this packet: every item is identical to an attested copy it keeps. Nothing was written twice.',
          counts: { imported: 0, duplicates: duplicates.length, diverged: 0 },
        });
      }

      const artefactRows = plan.map((row) => ({
        id: idFactory('envx'),
        packetId: verdict.packet.packetId,
        kind: row.kind,
        originWorkspaceId: verdict.packet.originWorkspaceId,
        originId: row.originId,
        contentHash: row.contentHash,
        cls: row.cls,
        status: row.status,
        fields: row.fields,
        ingestedOn: dayKey(stamp),
        reviewedOn: null,
      }));

      const record = normalizeExchangePacket(
        { ...ledgerRow(verdict.packet, { direction: 'inbound', status: 'ingested', receivedAt: stamp.toISOString() }),
          verification: { ok: true, failures: [] } },
        [],
      );
      if (!record) return fail('The packet verified but its ledger row could not be normalised. Nothing was written.');

      const warnings = [];
      const normalisedArtefacts = [];
      for (const row of artefactRows) {
        const artefact = normalizeExchangeArtefact(row, warnings);
        if (artefact) normalisedArtefacts.push(artefact);
      }

      store.update((draft) => {
        upsertPacket(draft, record);
        if (!Array.isArray(draft.exchangeArtefacts)) draft.exchangeArtefacts = [];
        for (const artefact of normalisedArtefacts) {
          const existing = draft.exchangeArtefacts.find((row) => row && row.id === artefact.id);
          if (existing) Object.assign(existing, artefact);
          else draft.exchangeArtefacts.unshift(artefact);
        }
        if (draft.exchangeArtefacts.length > ENVOY_LIMITS.artefacts) draft.exchangeArtefacts.length = ENVOY_LIMITS.artefacts;
      }, {
        type: ENVOY_EVENTS.INGESTED,
        entity: 'envoy',
        entityId: record.id,
        summary: `Ingested packet ${verdict.packet.packetId}: ${normalisedArtefacts.filter((row) => row.status === 'imported').length} imported, ${normalisedArtefacts.filter((row) => row.status === 'diverged').length} divergent.`,
      });

      const imported = normalisedArtefacts.filter((row) => row.status === 'imported').length;
      const diverged = normalisedArtefacts.filter((row) => row.status === 'diverged').length;
      return saved({
        ingested: true,
        packetId: verdict.packet.packetId,
        counts: { imported, duplicates: duplicates.length, diverged },
        divergences: normalisedArtefacts.filter((row) => row.status === 'diverged'),
        warnings,
        keyed: Boolean(verdict.packet.signature && verdict.packet.signature.keyed),
      });
    },

    /* ------------------------------------------------------------------ scan */

    envoyScan() {
      store.update(() => {}, {
        type: ENVOY_EVENTS.SCAN,
        entity: 'workspace',
        entityId: '',
        summary: 'Envoy reconciliation: carriage, divergence and attested exposure re-checked',
      });
      return saved({ report: envoyReport(store.state, { now: clock(), settings: settings() }) });
    },

    envoySetConventions(values = {}) {
      const gateResult = gate();
      if (gateResult.error) return gateResult.error;
      const merged = normalizeEnvoySettings({ ...settings(), ...(values && typeof values === 'object' ? values : {}) });
      store.update((draft) => { Object.assign(draft.settings, merged); }, {
        type: ENVOY_EVENTS.CONVENTIONS,
        entity: 'workspace',
        entityId: '',
        summary: `Envoy conventions: item cap ${merged.envoyMaxItems}, keyed signature ${merged.envoyRequireKeyedSignature ? 'required' : 'optional'}, divergence review ${merged.envoyDivergenceReviewDays}d, attested floor ${merged.envoyAttestationRiskFloorPct}%, auto ${merged.envoyAutoPropagate}`,
      });
      return saved({ conventions: envoyConventions(store.state.settings) });
    },

    /** The identity a peer would see — printed so a receiver can compare it. */
    envoyIdentity() {
      return {
        ok: true,
        workspaceId: workspaceIdentity(store.state),
        schemaVersion: store.state.schemaVersion ?? null,
        revisions: store.state.meta?.revision ?? null,
        artefacts: artefacts().length,
        keyed: Boolean(activeSealKey()),
      };
    },
  };
}
