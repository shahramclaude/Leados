/**
 * app/core/domain/missionCaptureBriefBulk.js — register-backed, privacy-scoped
 * bulk briefing on an adopted Command Flow case (ADR-0119, Session 161).
 *
 * THE DUTY THIS SERVES
 * --------------------
 * A director who has just arbitrated a cross-team constraint does not brief one
 * sponsor. They brief four, in one sitting, each with a different stance: the
 * executive sponsor, the peer manager who owns half the handoff, the vendor who
 * keeps slipping, and the finance controller who will ask what it costs. The VP
 * doing the same across divisions briefs six.
 *
 * Session 158 shipped the single-recipient path: name a person, assess power ×
 * interest and stance, preview the exact case-sourced message, then one atomic
 * write. Doing that four times means retyping four names the register already
 * holds, re-deriving four assessments the register already carries a dated value
 * for, and — the part that actually bites — no way to see WHICH register people
 * are eligible for this case and which must not be reached at all. That last
 * question is a privacy question, and a UI that answers it by letting the leader
 * type any name has already answered it wrongly.
 *
 * WHAT THIS MODULE ADDS, AND NOTHING ELSE
 * ---------------------------------------
 * 1. CANDIDATES, DERIVED FROM THE REGISTER. Every active register record is read
 *    against the seat's own span and this case, and lands in exactly one of
 *    three states with a printed reason: `eligible`, `already-on-case`, or
 *    `refused`. Nothing is typed, so nothing is guessed. A register record whose
 *    linked person sits in a peer subtree is refused with the boundary named.
 *
 * 2. DISAMBIGUATION, NOT NAME MATCHING. Two register records may share a
 *    normalized name. Selection is by register ID only, so a leader picks the
 *    row they mean; a name collision is printed on both rows, and selecting both
 *    colliding rows at once is refused because it would produce two briefs to
 *    one apparent person.
 *
 * 3. ONE PREVIEW, ONE TRANSACTION, NO PARTIALS. The selected set is assessed as
 *    a whole. If any selected row does not qualify under Mendelow power ×
 *    interest, or would breach the case's 25-stakeholder storage limit, the
 *    WHOLE proposal is refused — the leader deselects it, reads the reason, and
 *    previews again. The write then attaches every recipient to the same case in
 *    one transaction, and the existing `RULE-STK-01` (exact-name register link)
 *    and `RULE-COMMS-01` (unsent brief per audience member) do the rest. This
 *    module creates no draft, no link and no message of its own.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No bulk approval, no bulk send, no bulk stance edit. Each created message is
 * still reviewed, edited and approved one at a time through the Session-158
 * path, because a brief is a sentence a human is willing to sign. Bulk is a
 * selection efficiency, never an approval one.
 */

import { fingerprint } from './actionBundles.js';
import { dayKey } from '../time.js';
import { buildCommsFacts, commsAudience, renderCommsDraft } from './comms.js';

const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
const nameKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const openStatuses = new Set(['open', 'mitigating', 'monitoring']);

/** The case's own storage ceiling (schema.js `normalizeCaseStakeholders`). */
export const BRIEF_BULK_LIMITS = Object.freeze({
  /** Mirrors the 25-entry `normalizeCaseStakeholders` ceiling in schema.js. */
  caseStakeholderCap: 25,
  /** One reviewed transaction may add at most this many recipients. */
  maxRecipients: 8,
});

/**
 * Turn one register record into the case-stakeholder stub the case engine
 * expects. The register's power/interest/stance ARE the assessment: they are
 * dated, human-maintained, and re-used here rather than retyped. Nothing is
 * defaulted into the stub — a register row that qualifies is copied as recorded.
 */
function stubFromRegister(record) {
  return {
    // No `registerId` is stored on the stub: `normalizeCaseStakeholders` (schema.js)
    // keeps a closed key set, so a field it would drop on reload is a receipt that
    // silently disappears. The durable edge is RULE-STK-01's exact-name `involves`
    // link from the case to the register record.
    id: null, // assigned by the caller's idFactory at write time
    name: record.name,
    role: record.role || '',
    power: record.power,
    interest: record.interest,
    stance: record.stance,
    commsCadence: record.commsCadence || '',
    lastCommsOn: null,
    nextCommsOn: null,
    // The register's agreed message, never invented text. `RULE-STK-01` links the
    // two records by exact name only; the wording stays what a human recorded.
    keyMessage: record.keyMessage || '',
  };
}

/**
 * Every active register record, judged against this seat and this case.
 *
 * The refusal reasons are the point of this function: a leader needs to know
 * that the CFO is not briefable because she sits in a peer division, not to
 * discover it as a silent absence from a list.
 */
export function briefCandidates(state, caseRecord, seat, { now = new Date() } = {}) {
  const today = dayKey(now);
  const record = caseRecord || null;
  if (!record) return fail('No adopted case is selected, so there is no audience to read.');

  const attached = new Set((record.stakeholders || []).map((s) => nameKey(s.name)));
  const register = (state.stakeholders || []).filter((r) => r && r.status !== 'archived' && String(r.name || '').trim());

  // Name collisions are printed, not resolved: two "Jordan Alvarez" rows in one
  // register are a data fact the leader must see before choosing an ID.
  const byName = new Map();
  for (const row of register) {
    const key = nameKey(row.name);
    byName.set(key, (byName.get(key) || 0) + 1);
  }

  const rows = register.map((row) => {
    const key = nameKey(row.name);
    const sharedNameWith = register.filter((r) => r.id !== row.id && nameKey(r.name) === key).map((r) => r.id);
    const base = {
      registerId: row.id,
      name: row.name,
      role: row.role || '',
      org: row.org || '',
      personId: row.personId || null,
      power: row.power,
      interest: row.interest,
      stance: row.stance,
      commsCadence: row.commsCadence || '',
      assessedOn: row.updatedAt || row.createdAt || null,
      nameCollision: (byName.get(key) || 0) > 1,
      collidesWith: sharedNameWith,
    };

    if (attached.has(key)) {
      return { ...base, state: 'already-on-case',
        reason: 'This register person is already a stakeholder on this case. The single-recipient path reviews and regenerates their existing brief; adding them again would duplicate the stub.' };
    }
    // The register is connected to the case by exact-name reconciliation, which
    // must never be used as a way through a peer boundary.
    if (row.personId && !seat.fullAccess && !seat.scope?.has?.(row.personId)) {
      return { ...base, state: 'refused',
        reason: 'This registered person sits outside your operating span. Briefing them is the common leader’s act — escalate rather than cross a peer boundary.' };
    }
    const stub = stubFromRegister(row);
    const audience = commsAudience({ ...record, stakeholders: [stub] }, today)[0];
    if (!audience) {
      const quadrant = row.power >= 3 && row.interest >= 3 ? 'manage-closely'
        : row.power >= 3 ? 'keep-satisfied'
          : row.interest >= 3 ? 'keep-informed' : 'monitor';
      return { ...base, state: 'refused', quadrant,
        reason: `Mendelow (1981) power ${row.power} × interest ${row.interest} puts this actor in “${quadrant}”, which does not qualify for an individual brief. Key players and skeptical/blocking stakeholders qualify; the rest stay on the digest cadence.` };
    }
    const preview = renderCommsDraft({ caseRecord: record, stakeholder: stub, classified: audience.classified,
      facts: buildCommsFacts(record, { people: state.people || [] }) });
    return { ...base, state: 'eligible', quadrant: audience.classified.quadrant,
      preview, stub };
  });

  return {
    ok: true,
    caseId: record.id,
    caseTitle: record.title,
    revision: state.meta?.revision || 0,
    atCap: (record.stakeholders || []).length >= BRIEF_BULK_LIMITS.caseStakeholderCap,
    headroom: Math.max(0, BRIEF_BULK_LIMITS.caseStakeholderCap - (record.stakeholders || []).length),
    cap: BRIEF_BULK_LIMITS.caseStakeholderCap,
    rows,
    counts: {
      total: rows.length,
      eligible: rows.filter((r) => r.state === 'eligible').length,
      attached: rows.filter((r) => r.state === 'already-on-case').length,
      refused: rows.filter((r) => r.state === 'refused').length,
    },
  };
}

/**
 * Assess a SELECTED set of register IDs as one proposal.
 *
 * Every refusal here is total: a selection is only reviewable if every member of
 * it can actually be briefed. Partial success would put recipients on a case the
 * human never saw approved as a set.
 */
export function briefBulkProposal(state, caseRecord, seat, input, { now = new Date() } = {}) {
  const today = dayKey(now);
  if (!caseRecord) return fail('Only the seat that adopted a case may prepare its stakeholder briefs.');
  if (!openStatuses.has(caseRecord.status) || caseRecord.autoPropagate === false) {
    return fail('Open the case and resume its automation before preparing new briefs. Existing message history remains readable.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Select recipients from the stakeholder register.');
  const ids = Array.isArray(input.recipientIds) ? input.recipientIds.filter((id) => typeof id === 'string' && id.trim()) : [];
  if (!ids.length) return fail('Select at least one register person to brief.');
  if (ids.length > BRIEF_BULK_LIMITS.maxRecipients) {
    return fail(`One reviewed transaction adds at most ${BRIEF_BULK_LIMITS.maxRecipients} recipients. Split the audience and review each batch.`);
  }
  if (new Set(ids).size !== ids.length) return fail('A recipient appears twice in the selection.');

  const reading = briefCandidates(state, caseRecord, seat, { now });
  if (!reading.ok) return reading;
  const byId = new Map(reading.rows.map((r) => [r.registerId, r]));
  const selected = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) return fail('A selected register person no longer exists in this workspace.', 'recipientIds');
    if (row.state !== 'eligible') return fail(`${row.name}: ${row.reason}`, 'recipientIds');
    selected.push(row);
  }

  // Two rows that read as the same person would produce two briefs to one
  // apparent recipient. Refuse the pair rather than pick one.
  const seenNames = new Map();
  for (const row of selected) {
    const key = nameKey(row.name);
    if (seenNames.has(key)) {
      return fail(`“${row.name}” appears twice in the selection (register ids ${seenNames.get(key)} and ${row.registerId}). Choose the row you mean; two briefs to one name is not a reviewed audience.`, 'recipientIds');
    }
    seenNames.set(key, row.registerId);
  }

  const existing = (caseRecord.stakeholders || []).length;
  if (existing + selected.length > BRIEF_BULK_LIMITS.caseStakeholderCap) {
    return fail(`This case holds ${existing} stakeholder(s); adding ${selected.length} would exceed its ${BRIEF_BULK_LIMITS.caseStakeholderCap}-entry ceiling (${existing} + ${selected.length} = ${existing + selected.length}). Deselect recipients or review the audience.`, 'recipientIds');
  }

  const recipients = selected.map((row) => {
    const stub = stubFromRegister(row);
    const audience = commsAudience({ ...caseRecord, stakeholders: [stub] }, today)[0];
    const preview = renderCommsDraft({ caseRecord, stakeholder: stub, classified: audience.classified,
      facts: buildCommsFacts(caseRecord, { people: state.people || [] }) });
    return {
      registerId: row.registerId, name: row.name, role: row.role, org: row.org,
      power: row.power, interest: row.interest, stance: row.stance,
      assessedOn: row.assessedOn, nameCollision: row.nameCollision,
      quadrant: audience.classified.quadrant, stub, preview,
    };
  });

  // The fingerprint covers every register assessment AND the rendered body, so a
  // stance edited in the register, a case fact changed by another module, or a
  // different selection all invalidate the preview the human actually read.
  return {
    ok: true,
    caseId: caseRecord.id,
    caseTitle: caseRecord.title,
    revision: state.meta?.revision || 0,
    recipients,
    count: recipients.length,
    missingUnion: [...new Set(recipients.flatMap((r) => r.preview.missing || []))],
    fingerprint: fingerprint({ version: 1, revision: state.meta?.revision, caseId: caseRecord.id,
      recipients: recipients.map((r) => ({ id: r.registerId, stub: r.stub, subject: r.preview.subject, body: r.preview.body, missing: r.preview.missing })) }),
  };
}

/** The register ids a proposal would write, in selection order (for receipts). */
export function bulkRegisterIds(proposal) {
  return (proposal?.recipients || []).map((r) => r.registerId);
}
