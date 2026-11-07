/**
 * Post-adoption stakeholder briefing for Command Flow. A capture is the scoped
 * authority to work on its own case; the case remains the source of truth and
 * RULE-COMMS-01 writes the actual draft. Nothing here sends a message.
 */
import { dayKey } from '../time.js';
import { fingerprint } from './actionBundles.js';
import { responsibleNodeId } from './chain.js';
import { STAKEHOLDER_STANCES } from './cases.js';
import { buildCommsFacts, commsAudience, renderCommsDraft } from './comms.js';
import { recordPeople } from './seat.js';
import { matchRegisterStakeholder } from './stakeholders.js';

const fail = (error) => ({ ok: false, error });
const nameKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const openStatuses = new Set(['open', 'mitigating', 'monitoring']);

/** The owner of an adopted capture may act on its case, not a peer's case or a merged constituent. */
export function captureBriefCase(state, capture, seat, built) {
  if (capture?.status !== 'adopted' || !capture.caseId || !capture.bundleId) return fail('Only the seat that adopted a case may prepare its stakeholder briefs. Merged constituent seats must ask the LCA owner.');
  const caseRecord = (state.cases || []).find((row) => row.id === capture.caseId);
  const bundle = (state.actionBundles || []).find((row) => row.id === capture.bundleId && row.sourceId === capture.caseId);
  if (!caseRecord || !bundle) return fail('The adopted case or its action receipt no longer exists.');
  const people = recordPeople(caseRecord);
  const ownerNode = responsibleNodeId(built.chain, people);
  // One named leader is attributed to that leader's manager by the command
  // chain. The originating leader may still follow through on their *own*
  // adopted case; a case later moved to a descendant or a peer does not become
  // a licence to read that other span's outbox.
  if (!seat.fullAccess && (people.some((id) => !seat.scope.has(id)) || (ownerNode !== seat.id && !people.includes(seat.id)))) {
    return fail('This case no longer belongs to the preparing seat’s operating span. Escalate to its current owner instead of crossing a peer boundary.');
  }
  return { ok: true, caseRecord };
}

/** Preview the exact recipient and case-sourced message before any write. */
export function captureBriefProposal(state, capture, seat, built, input, now) {
  const source = captureBriefCase(state, capture, seat, built);
  if (!source.ok) return source;
  const c = source.caseRecord;
  if (!openStatuses.has(c.status) || c.autoPropagate === false) return fail('Open the case and resume its automation before preparing a new brief. Existing message history remains readable.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Name and review a real stakeholder before drafting.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const role = typeof input.role === 'string' ? input.role.trim() : '';
  const keyMessage = typeof input.keyMessage === 'string' ? input.keyMessage.trim() : '';
  if (name.length < 2 || name.length > 120 || role.length < 2 || role.length > 120) return fail('Give the real recipient a 2–120 character name and role. Nothing is inferred from the note.');
  if (keyMessage.length > 600) return fail('Keep a previously agreed message under 600 characters.');
  if ((c.stakeholders || []).some((s) => nameKey(s.name) === nameKey(name))) return fail('This stakeholder is already attached to the case. Review its current brief rather than adding a duplicate recipient.');
  if ((c.stakeholders || []).length >= 25) return fail('The case has reached its 25-stakeholder storage limit; review its audience before adding anyone.');
  const rated = (value) => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '';
  const power = Number(input.power); const interest = Number(input.interest);
  if (!rated(input.power) || !rated(input.interest) || !Number.isInteger(power) || power < 1 || power > 5
    || !Number.isInteger(interest) || interest < 1 || interest > 5 || !STAKEHOLDER_STANCES.includes(input.stance)) {
    return fail('Explicitly assess power (1–5), interest (1–5) and the current stance. An unassessed actor cannot be auto-addressed.');
  }
  // The register is connected by RULE-STK-01's exact-name reconciliation. Do
  // not use that edge to cross a person boundary in another reporting subtree.
  const registered = matchRegisterStakeholder(state.stakeholders, { name });
  if (registered?.personId && !seat.scope.has(registered.personId)) return fail('That registered person is outside this operating span. Escalate to the common leader rather than briefing a peer subtree.');
  const recipient = { name, role, power, interest, stance: input.stance, commsCadence: '', lastCommsOn: null, nextCommsOn: null, keyMessage };
  const audience = commsAudience({ ...c, stakeholders: [recipient] }, dayKey(now))[0];
  if (!audience) return fail('Mendelow power × interest does not qualify this actor for an individual brief. Key players and skeptical/blocking stakeholders qualify; keep-informed and monitor actors use the digest cadence.');
  const preview = renderCommsDraft({ caseRecord: c, stakeholder: recipient, classified: audience.classified,
    facts: buildCommsFacts(c, { people: state.people || [] }) });
  return { ok: true, recipient, preview, quadrant: audience.classified.quadrant,
    fingerprint: fingerprint({ version: 1, revision: state.meta?.revision, caseRecord: c, recipient, preview }),
    revision: state.meta?.revision || 0, caseId: c.id, caseTitle: c.title };
}

/** Only this adopted case's messages, never the global outbox or a sibling's note. */
export function captureBriefReading(state, capture, seat, built) {
  const source = captureBriefCase(state, capture, seat, built);
  if (!source.ok) return source;
  const c = source.caseRecord;
  const drafts = (state.commsDrafts || []).filter((row) => row.caseId === c.id).map((row) => ({
    id: row.id, purpose: row.purpose, stakeholderName: row.stakeholderName,
    status: row.status, subject: row.subject, body: row.body, missing: [...(row.missing || [])],
    readiness: row.readiness, createdOn: row.createdOn, approvedOn: row.approvedOn,
    sentOn: row.sentOn, channel: row.channel, dismissedReason: row.dismissedReason,
  })).reverse();
  return { ok: true, caseId: c.id, caseTitle: c.title, caseStatus: c.status,
    canDraft: openStatuses.has(c.status) && c.autoPropagate !== false, drafts };
}
