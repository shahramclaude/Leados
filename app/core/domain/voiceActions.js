/**
 * app/core/domain/voiceActions.js — the seat-checked commands of the Employee
 * Voice & Collective Consultation Register (ADR-0243).
 *
 * Ten human acts and a scan, and nothing else: DECLARE a body, declare a MEMBER,
 * OPEN an item, SUPPLY a document, HOLD a sitting, RECORD its minutes, RECORD the
 * body's ADVICE, REPLY to that advice in writing, RECORD the DECISION and record
 * the day the change took effect — plus re-declaring the conventions and the
 * explicit scan. Every state, window, days-early figure, days-late figure and
 * quorum finding is re-derived on read by `voice.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A body carries a WRITTEN INSTRUMENT, a constitution day and a declared
 *    quorum, or it is refused. A group with no instrument has no term, no quorum
 *    and no competence, and printing its name over a decision would be the exact
 *    reassurance this register exists to prevent.
 *  - An item carries a SUBJECT, a KIND, a WRITTEN INSTRUMENT and a WINDOW DECLARED
 *    FROM IT, or it is refused. There is no default period anywhere in this file:
 *    a window the software chose is a window nobody can defend. An information
 *    item declares no window because it owes nothing back.
 *  - AN ITEM IS NEVER PUT TO A LAPSED BODY. A body whose declared term has ended
 *    is not constituted to advise, and the door refuses the item rather than
 *    collecting an opinion from a group the organisation has already dissolved.
 *  - THE DECISION IS REFUSED BEFORE THE WINDOW CLOSES. This is the register's
 *    central control: consulting after deciding is not consulting. The refusal
 *    prints the exact number of days early, so the actor knows what they were
 *    about to record. A decision recorded by a holder of only ONE of the affected
 *    lines is refused too — that is the matrix silently picking a winner between
 *    two managers — and the door names the joint apex that may record it instead.
 *  - AN IMPLEMENTATION IS REFUSED BEFORE ITS DECISION. A change in place before
 *    the act that authorised it is a change nobody decided.
 *  - ADVICE IS ANSWERED OR IT IS NOT; there is no command that marks an advice
 *    answered without a written reply, and none that records a reply before the
 *    advice arrived.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that records advice on the body's
 * behalf, none that changes a window after the item opened, none that re-dates a
 * decision, none that deletes a breach, none that scores a representative or a
 * body, and none that reads a lapsed window as consent. The absence of those
 * commands is the design.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { matrixJointApex } from './matrix.js';
import { buildVoice, voiceAttentionCount } from './voice.js';
import {
  VOI_ADVICE_COURSE_BY_KEY,
  VOI_BODY_KIND_BY_KEY,
  VOI_DECISION_COURSE_BY_KEY,
  VOI_EVENTS,
  VOI_ITEM_KIND_BY_KEY,
  VOI_LIMITS as L,
  VOI_MEMBER_ROLE_BY_KEY,
  VOI_REFUSALS,
  VOI_RIGHTS,
  VOI_ROUTE,
  VOI_SETTING_KEYS,
  VOI_BOUNDS,
} from './voiceRegistry.js';
import {
  normalizeVoiceBodies,
  normalizeVoiceDecisions,
  normalizeVoiceItems,
  normalizeVoiceMembers,
  normalizeVoiceResponses,
  normalizeVoiceSettings,
  normalizeVoiceSittings,
  voiceInstrument,
  voiceName,
  voiceNote,
  voiceQuorum,
  voiceShort,
  voiceSubject,
  voiceWindow,
} from './voiceSchema.js';
import { daysBetween } from '../time.js';
import { earlyDays, voiceDay, windowClosesOn, withinTerm } from './voiceMath.js';

const REFUSAL = (key) => `voice:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);

export function createVoiceActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(VOI_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check,
   * so the right is re-proved HERE. Without it, what a named body advised about a
   * named change would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(VOI_REFUSALS.notSeated);
    const verdict = canAct(VOI_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, today: dayKey(at) };
  }

  /** Does the acting seat hold this hand (itself, its span, or a declared line)? */
  function holdsHand(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  function holdsAnyOwner(check, ownerIds) {
    return list(ownerIds).some((ownerId) => holdsHand(check, ownerId));
  }

  function personRow(personId) {
    return rows('people').find((row) => row && row.id === personId) || null;
  }

  /** A declared day that is not in the future. A record is about what happened. */
  function declaredDay(check, value, field, { allowFuture = false, maxBackDays = 730 } = {}) {
    const day = voiceDay(value);
    if (!day) return { error: fail('Give a real day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const ahead = daysBetween(check.today, day);
    if (!allowFuture && ahead > 0) {
      return { error: fail('That day is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('day-future')) };
    }
    if (allowFuture && ahead > 90) {
      return { error: fail('A sitting more than 90 days ahead cannot be declared: the body’s term and membership will have moved by then.', field, REFUSAL('day-too-far')) };
    }
    if (daysBetween(day, check.today) > maxBackDays) {
      return { error: fail(`A record cannot be back-dated more than ${maxBackDays} days; a period nobody was given cannot be reconstructed after the fact.`, field, REFUSAL('day-too-old')) };
    }
    return { day };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  const bodies = () => normalizeVoiceBodies(rows('voiceBodies'), []);
  const members = () => normalizeVoiceMembers(rows('voiceMembers'), bodies(), []);
  const items = () => normalizeVoiceItems(rows('voiceItems'), bodies(), []);
  const sittings = () => normalizeVoiceSittings(rows('voiceSittings'), bodies(), members(), items(), []);
  const responses = () => normalizeVoiceResponses(rows('voiceResponses'), items(), []);
  const decisions = () => normalizeVoiceDecisions(rows('voiceDecisions'), items(), []);

  function bodyContext(check, bodyId) {
    const id = text(bodyId, L.idMax) || null;
    if (!id) return fail('Choose the body this act concerns.', 'bodyId');
    const body = bodies().find((row) => row.id === id) || null;
    if (!body) return fail(VOI_REFUSALS.notFound, 'bodyId', REFUSAL('body-not-found'));
    return { ok: true, body };
  }

  function itemContext(check, itemId) {
    const id = text(itemId, L.idMax) || null;
    if (!id) return fail('Choose the item this act concerns.', 'itemId');
    const item = items().find((row) => row.id === id) || null;
    if (!item) return fail(VOI_REFUSALS.notFound, 'itemId', REFUSAL('item-not-found'));
    const body = bodies().find((row) => row.id === item.bodyId) || null;
    return { ok: true, item, body };
  }

  /** The reach test every act on an item has to clear. */
  function itemReach(check, item) {
    if (check.seat.fullAccess) return true;
    if (holdsAnyOwner(check, item.ownerIds)) return true;
    const bodyMembers = members().filter((row) => row.bodyId === item.bodyId);
    return bodyMembers.some((row) => holdsHand(check, row.personId));
  }

  /**
   * The joint apex over an item's affected lines. Returned rather than thrown so
   * every caller prints the same finding: `no-authority` when the graph names no
   * seat, `ambiguous` when a diamond leaves more than one.
   */
  function itemApex(check, item) {
    const report = buildVoice(store.state, { now: check.at, settings: check.cfg, seat: null });
    const graph = report?.matrix;
    const graphIds = graph?.nodes ? new Set(graph.nodes.keys()) : new Set();
    const valid = list(item.ownerIds).filter((ownerId) => graphIds.has(ownerId));
    if (!valid.length) return { ok: false, reason: 'no-graph' };
    const apex = matrixJointApex(graph, valid);
    const apexIds = list(apex?.apexIds);
    if (!apexIds.length) return { ok: false, reason: 'no-authority' };
    return { ok: true, apexIds, ambiguous: Boolean(apex?.ambiguous) };
  }

  return {
    /* ----------------------------------------------------------------- body */

    /** DECLARE a consultation body: what it is, what constituted it, its quorum and its term. */
    voiceDeclareBody(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const name = voiceName(input.name);
      if (!name) return fail(`Name the body in at least ${L.nameMin} characters. “The reps” is not a body anybody can be held to.`, 'name', REFUSAL('name-invalid'));

      const kind = text(input.kind, 40);
      if (!VOI_BODY_KIND_BY_KEY[kind]) return fail('Choose what kind of body this is. The rights it holds and the way it is constituted differ by kind.', 'kind', REFUSAL('kind-invalid'));

      const instrumentRef = voiceInstrument(input.instrumentRef);
      if (!instrumentRef) {
        return fail(`Cite the written instrument that constitutes this body, in at least ${L.instrumentMin} characters — its name and clause. A body with no instrument has no quorum, no term and no competence, and printing its name over a decision would be the reassurance this register exists to prevent.`, 'instrumentRef', REFUSAL('instrument-missing'));
      }

      const constitutedOn = declaredDay(check, input.constitutedOn, 'constitutedOn');
      if (constitutedOn.error) return constitutedOn.error;

      const quorumWhole = voiceQuorum(Number(input.quorumWhole));
      if (quorumWhole === null) {
        return fail(`Declare how many representatives make the body quorate, as a whole number between ${L.quorumMin} and ${L.quorumMax}. A quorum guessed by the software would let a sitting transact on anybody who turned up.`, 'quorumWhole', REFUSAL('quorum-invalid'));
      }

      // A term END is the one declared day that may legitimately be in the future:
      // the constitution says when the mandate expires, and a body whose term has
      // already been declared can be put to today.
      let termEndsOn = null;
      if (input.termEndsOn !== undefined && input.termEndsOn !== null && input.termEndsOn !== '') {
        const day = voiceDay(input.termEndsOn);
        if (!day) return fail('Give a real day for the end of the body’s term (YYYY-MM-DD).', 'termEndsOn', REFUSAL('day-invalid'));
        if (daysBetween(constitutedOn.day, day) < 1) {
          return fail('The term must end at least one day after the body was constituted. A term that ends on its first day is not a term.', 'termEndsOn', REFUSAL('term-reversed'));
        }
        termEndsOn = day;
      }

      if (bodies().length >= L.bodies) return fail('The body ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('voi-bdy');
      const row = {
        id,
        name,
        kind,
        instrumentRef,
        constitutedOn: constitutedOn.day,
        termEndsOn,
        quorumWhole,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceBodies([...rows('voiceBodies'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The body could not be stored as a row this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.voiceBodies = Array.isArray(draft.voiceBodies) ? draft.voiceBodies : [];
        draft.voiceBodies.push(stored);
      }, {
        type: VOI_EVENTS.BODY_DECLARED,
        entity: 'workspace',
        entityId: id,
        summary: `Consultation body declared: ${name} (${VOI_BODY_KIND_BY_KEY[kind].label.toLowerCase()}), constituted by ${instrumentRef}, quorum ${quorumWhole}${termEndsOn ? `, term ends ${termEndsOn}` : ', term unstasted'} (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, body: stored });
    },

    /** DECLARE a member of a body, with the term that says when they were entitled to advise. */
    voiceDeclareMember(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const body = bodyContext(check, input.bodyId);
      if (!body.ok) return body;

      const personId = text(input.personId, L.idMax) || null;
      if (!personId) return fail('Name the person who sits on this body.', 'personId', REFUSAL('person-missing'));
      const person = personRow(personId);
      if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
      if (person.status === 'archived') return fail('That person is archived. An archived person is not a representative.', 'personId', REFUSAL('person-archived'));

      const role = text(input.role, 30);
      if (!VOI_MEMBER_ROLE_BY_KEY[role]) return fail('Choose the standing this person holds: chair, representative or observer.', 'role', REFUSAL('role-invalid'));

      const basis = text(input.basis, 20);
      if (!['elected', 'appointed'].includes(basis)) {
        return fail('Say whether the seat is elected or appointed. A mandate nobody can name the origin of is not a mandate.', 'basis', REFUSAL('basis-invalid'));
      }

      const termStart = declaredDay(check, input.termStart, 'termStart', { allowFuture: true });
      if (termStart.error) return termStart.error;

      if (body.body.termEndsOn && daysBetween(body.body.termEndsOn, termStart.day) > 0) {
        return fail(`That term starts after the body’s declared end (${body.body.termEndsOn}). A representative cannot serve a body that has already been dissolved.`, 'termStart', REFUSAL('term-after-body'));
      }

      let termEnd = null;
      if (input.termEnd !== undefined && input.termEnd !== null && input.termEnd !== '') {
        const day = voiceDay(input.termEnd);
        if (!day) return fail('Give a real day for the end of the term.', 'termEnd', REFUSAL('day-invalid'));
        if (daysBetween(termStart.day, day) < 0) {
          return fail('A term cannot end before it starts.', 'termEnd', REFUSAL('term-reversed'));
        }
        termEnd = day;
      }

      let electedOn = null;
      if (basis === 'elected') {
        const day = voiceDay(input.electedOn);
        if (!day) {
          return fail('An elected seat needs the day of the election. The election day is the fact that makes the mandate real; without it the register holds a name with no authority behind it.', 'electedOn', REFUSAL('election-missing'));
        }
        if (daysBetween(termStart.day, day) > 0) {
          return fail('The election day cannot be after the term starts. A seat occupied before it was won is an appointment.', 'electedOn', REFUSAL('election-after-term'));
        }
        electedOn = day;
      }

      const existing = members();
      if (existing.length >= L.members) return fail('The membership ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));
      const liveDuplicate = existing.some((row) => row.bodyId === body.body.id && row.personId === personId
        && row.role === role && withinTerm(termStart.day, row.termStart, row.termEnd));
      if (liveDuplicate) {
        return fail('This person already holds that seat on this body on that day. Two overlapping seats would count one representative twice against the quorum.', 'personId', REFUSAL('duplicate-member'));
      }

      const id = idFactory('voi-mbr');
      const row = {
        id,
        bodyId: body.body.id,
        personId,
        role,
        basis,
        termStart: termStart.day,
        termEnd,
        electedOn,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceMembers([...rows('voiceMembers'), row], bodies(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The membership could not be stored as a row this register can read back. Nothing was saved.', 'personId', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.voiceMembers = Array.isArray(draft.voiceMembers) ? draft.voiceMembers : [];
        draft.voiceMembers.push(stored);
      }, {
        type: VOI_EVENTS.MEMBER_DECLARED,
        entity: 'person',
        entityId: personId,
        summary: `${person.name || personId} declared ${VOI_MEMBER_ROLE_BY_KEY[role].label.toLowerCase()} of ${body.body.name} (${basis}), term from ${termStart.day}${termEnd ? ` to ${termEnd}` : ', open-ended'} (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, member: stored });
    },

    /* ----------------------------------------------------------------- item */

    /** OPEN an item: what is being put, to whom, on which instrument, over which window. */
    voiceOpenItem(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const body = bodyContext(check, input.bodyId);
      if (!body.ok) return body;

      const subject = voiceSubject(input.subject);
      if (!subject) return fail(`Write the subject in at least ${L.subjectMin} characters — what is actually being put to the body, not “consultation”.`, 'subject', REFUSAL('subject-invalid'));

      const kind = text(input.kind, 30);
      if (!VOI_ITEM_KIND_BY_KEY[kind]) return fail('Choose what the body is being asked to do: be informed, be consulted, or negotiate.', 'kind', REFUSAL('kind-invalid'));

      const ownerIds = [...new Set(list(input.ownerIds).map((value) => text(value, L.idMax)).filter(Boolean))];
      if (!ownerIds.length) return fail(VOI_REFUSALS.noLine, 'ownerIds', REFUSAL('no-owner'));
      for (const ownerId of ownerIds) {
        const person = personRow(ownerId);
        if (!person) return fail(`The affected line “${ownerId}” is not a hand on this record. Nothing was saved.`, 'ownerIds', REFUSAL('owner-not-found'));
      }
      if (!holdsAnyOwner(check, ownerIds)) {
        return fail(VOI_REFUSALS.noReach, 'ownerIds', REFUSAL('not-your-line'));
      }

      const instrumentRef = voiceInstrument(input.instrumentRef);
      if (!instrumentRef) {
        return fail(`Cite the written instrument that sets this clock, in at least ${L.instrumentMin} characters — the clause, the agreement, the article. There is no default consultation period in this register and no jurisdiction table behind it.`, 'instrumentRef', REFUSAL('instrument-missing'));
      }

      const rawWindow = kind === 'information' ? 0 : Number(input.windowDays);
      const windowDays = voiceWindow(rawWindow, kind);
      if (windowDays === null) {
        return fail(kind === 'information'
          ? 'An information item owes nothing back and declares no window. Choose consultation or negotiation if a period is owed.'
          : `Declare the period the body is given, in whole days between ${L.windowMin} and ${L.windowMax}, taken from the instrument you cited. The register will not choose one for you.`, 'windowDays', REFUSAL('window-invalid'));
      }

      const openedOn = declaredDay(check, input.openedOn, 'openedOn');
      if (openedOn.error) return openedOn.error;

      if (body.body.termEndsOn && daysBetween(body.body.termEndsOn, openedOn.day) > 0) {
        return fail(`That body’s declared term ended on ${body.body.termEndsOn}. An item put to a dissolved body collects an opinion from hands that were not constituted to give it.`, 'openedOn', REFUSAL('body-lapsed'));
      }

      const documents = [];
      for (const doc of list(input.documents).slice(0, 20)) {
        if (!doc || typeof doc !== 'object') continue;
        const label = voiceShort(doc.label);
        const on = voiceDay(doc.on);
        if (!label || !on) continue;
        documents.push({ label, on });
      }

      if (items().length >= L.items) return fail('The item ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('voi-itm');
      const row = {
        id,
        bodyId: body.body.id,
        subject,
        kind,
        ownerIds,
        instrumentRef,
        windowDays,
        openedOn: openedOn.day,
        documents,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceItems([...rows('voiceItems'), row], bodies(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The item could not be stored as a row this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL('unreadable'));

      const closesOn = stored.windowDays ? windowClosesOn(stored.openedOn, stored.windowDays) : null;
      writeDraft((draft) => {
        draft.voiceItems = Array.isArray(draft.voiceItems) ? draft.voiceItems : [];
        draft.voiceItems.push(stored);
      }, {
        type: VOI_EVENTS.ITEM_OPENED,
        entity: 'workspace',
        entityId: id,
        summary: `${VOI_ITEM_KIND_BY_KEY[kind].label} put to ${body.body.name} on ${openedOn.day}${closesOn ? `, window from ${instrumentRef} closes ${closesOn}` : ''}, affecting ${ownerIds.length} reporting line(s) (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, item: stored, closesOn });
    },

    /** SUPPLY a document to an item, dated. What the body was given, and when. */
    voiceSupplyDocument(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const context = itemContext(check, input.itemId);
      if (!context.ok) return context;
      if (!itemReach(check, context.item)) return fail(VOI_REFUSALS.noReach, 'itemId', REFUSAL('not-your-item'));

      const label = voiceShort(input.label);
      if (!label) return fail(`Name the document in at least ${L.shortMin} characters.`, 'label', REFUSAL('label-invalid'));
      const on = declaredDay(check, input.on, 'on');
      if (on.error) return on.error;
      if (daysBetween(context.item.openedOn, on.day) < 0) {
        return fail('That document is dated before the item was opened. Material that predates the question is not what the body was given to advise on.', 'on', REFUSAL('document-before-item'));
      }
      if (context.item.documents.length >= 20) return fail('This item already holds the maximum of 20 documents. Open a new item for further material.', 'label', REFUSAL('documents-full'));

      writeDraft((draft) => {
        for (const row of draft.voiceItems || []) {
          if (row && row.id === context.item.id) {
            row.documents = Array.isArray(row.documents) ? row.documents : [];
            row.documents.push({ label, on: on.day });
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: VOI_EVENTS.DOCUMENT_SUPPLIED,
        entity: 'workspace',
        entityId: context.item.id,
        summary: `Document “${label}” supplied to ${context.body?.name || 'the body'} on ${on.day} for the item “${context.item.subject}” (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: context.item.id });
    },

    /* -------------------------------------------------------------- sitting */

    /** HOLD a sitting: when, who attended, which items were heard. */
    voiceHoldSitting(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const body = bodyContext(check, input.bodyId);
      if (!body.ok) return body;

      const on = declaredDay(check, input.on, 'on', { allowFuture: true });
      if (on.error) return on.error;

      const bodyMembers = members().filter((row) => row.bodyId === body.body.id);
      const presentIds = [...new Set(list(input.presentIds).map((value) => text(value, L.idMax)).filter(Boolean))];
      for (const memberId of presentIds) {
        if (!bodyMembers.some((row) => row.id === memberId)) {
          return fail('Attendance names somebody who is not a member of this body. A sitting that cannot say who was entitled to be there cannot support a quorum finding.', 'presentIds', REFUSAL('non-member-present'));
        }
      }
      const bodyItems = items().filter((row) => row.bodyId === body.body.id);
      const itemIds = [...new Set(list(input.itemIds).map((value) => text(value, L.idMax)).filter(Boolean))];
      for (const itemId of itemIds) {
        if (!bodyItems.some((row) => row.id === itemId)) {
          return fail('That item belongs to another body.', 'itemIds', REFUSAL('item-other-body'));
        }
      }

      let minutesOn = null;
      let minutesRef = null;
      if (input.minutesOn !== undefined && input.minutesOn !== null && input.minutesOn !== '') {
        const minutes = declaredDay(check, input.minutesOn, 'minutesOn');
        if (minutes.error) return minutes.error;
        if (daysBetween(on.day, minutes.day) < 0) return fail('Minutes cannot be recorded before the sitting they minute.', 'minutesOn', REFUSAL('minutes-before-sitting'));
        const reference = voiceShort(input.minutesRef);
        if (!reference) return fail(`Cite where the minutes are held, in at least ${L.shortMin} characters. A day with no reference is a claim nobody can check.`, 'minutesRef', REFUSAL('minutes-ref-missing'));
        minutesOn = minutes.day;
        minutesRef = reference;
      }

      if (sittings().length >= L.sittings) return fail('The sitting ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('voi-sit');
      const row = {
        id,
        bodyId: body.body.id,
        on: on.day,
        presentIds,
        itemIds,
        minutesOn,
        minutesRef,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceSittings([...rows('voiceSittings'), row], bodies(), members(), items(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The sitting could not be stored as a row this register can read back. Nothing was saved.', 'on', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.voiceSittings = Array.isArray(draft.voiceSittings) ? draft.voiceSittings : [];
        draft.voiceSittings.push(stored);
      }, {
        type: VOI_EVENTS.SITTING_HELD,
        entity: 'workspace',
        entityId: id,
        summary: `${body.body.name} sat on ${on.day}: ${presentIds.length} member(s) present against a declared quorum of ${body.body.quorumWhole}, ${itemIds.length} item(s) heard${minutesOn ? `, minuted ${minutesOn}` : ', minutes still owed'} (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, sitting: stored });
    },

    /** RECORD the minutes of a sitting, dated, with the reference that holds them. */
    voiceRecordMinutes(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const sittingId = text(input.sittingId, L.idMax) || null;
      if (!sittingId) return fail('Name the sitting these minutes belong to.', 'sittingId');
      const sitting = sittings().find((row) => row.id === sittingId) || null;
      if (!sitting) return fail(VOI_REFUSALS.notFound, 'sittingId', REFUSAL('sitting-not-found'));
      if (sitting.minutesOn) return fail(`These minutes were already recorded on ${sitting.minutesOn}. History is never rewritten.`, 'sittingId', REFUSAL('minutes-recorded'));

      const on = declaredDay(check, input.on, 'on');
      if (on.error) return on.error;
      if (daysBetween(sitting.on, on.day) < 0) return fail('Minutes cannot be recorded before the sitting they minute.', 'on', REFUSAL('minutes-before-sitting'));
      const reference = voiceShort(input.reference);
      if (!reference) return fail(`Cite where the minutes are held, in at least ${L.shortMin} characters.`, 'reference', REFUSAL('minutes-ref-missing'));

      writeDraft((draft) => {
        for (const row of draft.voiceSittings || []) {
          if (row && row.id === sittingId) {
            row.minutesOn = on.day;
            row.minutesRef = reference;
          }
        }
      }, {
        type: VOI_EVENTS.MINUTES_RECORDED,
        entity: 'workspace',
        entityId: sittingId,
        summary: `Minutes of the ${sitting.on} sitting recorded on ${on.day} (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: sittingId });
    },

    /* --------------------------------------------------------------- advice */

    /** RECORD the body's advice: the day it arrived, the course, and its own written note. */
    voiceRecordAdvice(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const context = itemContext(check, input.itemId);
      if (!context.ok) return context;
      const { item, body } = context;
      if (!VOI_ITEM_KIND_BY_KEY[item.kind]?.owesAdvice) {
        return fail('That item was information: the body owes nothing back, so there is no advice to record. If the body has something to say, open a consultation item.', 'itemId', REFUSAL('no-advice-owed'));
      }
      if (responses().some((row) => row.itemId === item.id)) {
        return fail('A body advises once. A second note is a new item, not an edit of the first — the register will not overwrite what the body said.', 'itemId', REFUSAL('advice-exists'));
      }
      if (!itemReach(check, item)) return fail(VOI_REFUSALS.noReach, 'itemId', REFUSAL('not-your-item'));

      const receivedOn = declaredDay(check, input.receivedOn, 'receivedOn');
      if (receivedOn.error) return receivedOn.error;
      if (daysBetween(item.openedOn, receivedOn.day) < 0) {
        return fail('That advice predates the item. A body cannot have advised on a question it was not asked.', 'receivedOn', REFUSAL('advice-before-item'));
      }

      const advice = text(input.advice, 30);
      if (!VOI_ADVICE_COURSE_BY_KEY[advice]) return fail('Record what the body actually advised: support, amend, oppose or no view. “Feedback” is not advice.', 'advice', REFUSAL('advice-invalid'));
      const note = voiceNote(input.note);
      if (!note) {
        return fail(`Write what the body said, in at least ${L.textMin} characters. The register stores the body’s own words and prints them verbatim; it never summarises an opinion it did not hear.`, 'note', REFUSAL('advice-note-missing'));
      }

      const id = idFactory('voi-adv');
      const row = {
        id,
        itemId: item.id,
        receivedOn: receivedOn.day,
        advice,
        note,
        recordedById: check.actorId,
        replyOn: null,
        replyNote: null,
        replyById: null,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceResponses([...rows('voiceResponses'), row], items(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The advice could not be stored as a row this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));

      const closes = item.windowDays ? windowClosesOn(item.openedOn, item.windowDays) : null;
      const late = closes ? Math.max(0, daysBetween(closes, receivedOn.day)) : 0;
      writeDraft((draft) => {
        draft.voiceResponses = Array.isArray(draft.voiceResponses) ? draft.voiceResponses : [];
        draft.voiceResponses.push(stored);
      }, {
        type: VOI_EVENTS.ADVICE_RECORDED,
        entity: 'workspace',
        entityId: item.id,
        summary: `${body?.name || 'The body'} advised “${VOI_ADVICE_COURSE_BY_KEY[advice].label.toLowerCase()}” on ${receivedOn.day}${late ? ` (${late} day(s) after the declared window closed)` : ' (inside the declared window)'}; the organisation's reply is now owed (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, advice: stored, lateDays: late });
    },

    /** REPLY to the advice in writing. An advice nobody answered decays the channel. */
    voiceReplyToAdvice(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const context = itemContext(check, input.itemId);
      if (!context.ok) return context;
      const response = responses().find((row) => row.itemId === context.item.id) || null;
      if (!response) return fail('There is no advice on this item to reply to. Record the body’s advice first.', 'itemId', REFUSAL('no-advice'));
      if (response.replyOn) return fail(`This advice was already answered on ${response.replyOn}. History is never rewritten.`, 'itemId', REFUSAL('reply-exists'));
      if (!itemReach(check, context.item)) return fail(VOI_REFUSALS.noReach, 'itemId', REFUSAL('not-your-item'));

      const replyOn = declaredDay(check, input.replyOn, 'replyOn');
      if (replyOn.error) return replyOn.error;
      if (daysBetween(response.receivedOn, replyOn.day) < 0) {
        return fail('The reply cannot predate the advice it answers.', 'replyOn', REFUSAL('reply-before-advice'));
      }
      const replyNote = voiceNote(input.replyNote);
      if (!replyNote) {
        return fail(`Write the reply, in at least ${L.textMin} characters. “Noted” is not an answer to a body that was constituted to advise.`, 'replyNote', REFUSAL('reply-note-missing'));
      }

      writeDraft((draft) => {
        for (const row of draft.voiceResponses || []) {
          if (row && row.id === response.id) {
            row.replyOn = replyOn.day;
            row.replyNote = replyNote;
            row.replyById = check.actorId;
          }
        }
      }, {
        type: VOI_EVENTS.REPLY_RECORDED,
        entity: 'workspace',
        entityId: context.item.id,
        summary: `The organisation's written reply to the body's advice recorded on ${replyOn.day} (${VOI_ROUTE}).`,
      });
      return saved({ id: response.id });
    },

    /* ------------------------------------------------------------- decision */

    /**
     * RECORD the decision. THE CENTRAL CONTROL: it is refused before the declared
     * window closes, and refused to a hand that holds only one of the affected
     * lines.
     */
    voiceRecordDecision(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const context = itemContext(check, input.itemId);
      if (!context.ok) return context;
      const { item, body } = context;
      const kind = VOI_ITEM_KIND_BY_KEY[item.kind];

      if (decisions().some((row) => row.itemId === item.id)) {
        return fail('That item already carries a decision. A decision is not a running commentary, and the register will not overwrite one.', 'itemId', REFUSAL('decision-exists'));
      }

      // The apex, not one of the two lines. The refusal names the seat that may act.
      const apex = itemApex(check, item);
      if (!apex.ok) {
        return fail(apex.reason === 'no-authority'
          ? 'The reporting graph yields no joint seat above the affected lines, so no hand is authorised to decide this item. The register names the ambiguity and records nothing rather than promoting one line over the other.'
          : 'None of the affected lines resolves on the active reporting graph, so no joint seat can be computed. Re-declare the item against lines that exist.', 'itemId', REFUSAL('no-authority'));
      }
      if (!check.seat.fullAccess && !apex.apexIds.includes(check.actorId)) {
        return fail('A decision on this item belongs to the joint seat above the affected lines, and this seat is not it. One affected line recording the decision is the matrix silently picking a winner between two managers — the register refuses it and names the seat that may act.', 'itemId', REFUSAL('not-apex'));
      }

      const decidedOn = declaredDay(check, input.decidedOn, 'decidedOn');
      if (decidedOn.error) return decidedOn.error;

      const closesOn = kind?.owesAdvice ? windowClosesOn(item.openedOn, item.windowDays) : null;
      if (closesOn) {
        const early = earlyDays(decidedOn.day, closesOn);
        if (early > 0) {
          return fail(`That decision is ${early} day(s) before the declared window closes on ${closesOn}. Consulting after deciding is not consulting — this register refuses to record the ordering it exists to prevent. Record the decision on or after ${closesOn}, when the body has had the period its instrument gives it.`, 'decidedOn', REFUSAL('decided-before-advice'));
        }
      }

      const course = text(input.course, 40);
      if (!VOI_DECISION_COURSE_BY_KEY[course]) {
        return fail('Record what the decision did with the body’s position: followed the advice, departed from it, or proceeded with no advice.', 'course', REFUSAL('course-invalid'));
      }
      const response = responses().find((row) => row.itemId === item.id) || null;
      if (!kind?.owesAdvice && course !== 'followed-advice') {
        return fail('This item was information: nothing was owed and nothing was advised, so the decision cannot depart from advice or proceed without it. Record it as following the notification.', 'course', REFUSAL('course-not-owed'));
      }
      if (VOI_DECISION_COURSE_BY_KEY[course].needsAdvice && !response) {
        return fail('There is no advice on this item. Record the body’s advice first, or record the decision as proceeding with no advice after the window has closed — which is a different, and permanent, record.', 'course', REFUSAL('course-needs-advice'));
      }
      if (course === 'proceeded-without-advice' && response) {
        return fail('A body did advise on this item, so the decision cannot be recorded as proceeding without advice. Record whether it followed or departed from what the body said.', 'course', REFUSAL('course-has-advice'));
      }

      const needsNote = course === 'departed' || course === 'proceeded-without-advice';
      const note = needsNote ? voiceNote(input.note) : text(input.note, L.textMax);
      if (needsNote && !note) {
        return fail(course === 'departed'
          ? 'A decision that departs from the body’s advice carries its own written reason. The departure is a decision somebody must own, not a footnote.'
          : 'A decision taken with no advice carries a written reason. The register keeps the silence and the decision side by side; it will not keep them without an explanation.', 'note', REFUSAL('decision-note-missing'));
      }

      let implementedOn = null;
      if (input.implementedOn !== undefined && input.implementedOn !== null && input.implementedOn !== '') {
        const implementation = declaredDay(check, input.implementedOn, 'implementedOn');
        if (implementation.error) return implementation.error;
        if (daysBetween(decidedOn.day, implementation.day) < 0) {
          return fail('That change is recorded as in place before the decision that authorised it. An implementation with no decision behind it is a change nobody decided.', 'implementedOn', REFUSAL('implemented-before-decision'));
        }
        implementedOn = implementation.day;
      }

      if (decisions().length >= L.decisions) return fail('The decision ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('voi-dec');
      const row = {
        id,
        itemId: item.id,
        decidedOn: decidedOn.day,
        decidedById: check.actorId,
        course,
        note,
        implementedOn,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeVoiceDecisions([...rows('voiceDecisions'), row], items(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The decision could not be stored as a row this register can read back. Nothing was saved.', 'course', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.voiceDecisions = Array.isArray(draft.voiceDecisions) ? draft.voiceDecisions : [];
        draft.voiceDecisions.push(stored);
      }, {
        type: VOI_EVENTS.DECISION_RECORDED,
        entity: 'workspace',
        entityId: item.id,
        summary: `Decision recorded on ${decidedOn.day} at the joint seat above the affected lines: ${VOI_DECISION_COURSE_BY_KEY[course].label.toLowerCase()}${body ? ` for ${body.name}` : ''}${implementedOn ? `, in place ${implementedOn}` : ''} (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, decision: stored, closesOn, apexIds: apex.apexIds });
    },

    /** Re-declare the register's conventions. Refused rather than clamped. */
    voiceSetConventions(input = {}) {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeVoiceSettings(settings());
      const patch = input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : input;
      const known = new Set(Object.values(VOI_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === VOI_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = VOI_BOUNDS[key === VOI_SETTING_KEYS.privacyFloor ? 'privacyFloor' : key === VOI_SETTING_KEYS.replyDays ? 'replyDays' : 'minutesDueDays'];
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: VOI_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: VOI_ROUTE,
        summary: `Employee-voice conventions re-declared: the reply window, the minutes window, the privacy floor and whether the rule may file asks (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeVoiceSettings(store.state.settings || {}) });
    },

    /* ---------------------------------------------------------------- reads */

    voiceReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildVoice(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    voiceAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: voiceAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * The candidates a dialog may name, narrowed to what this seat may actually
     * reach: bodies it can see, their members in term, and the items still owed an
     * act.
     */
    voiceCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildVoice(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      const bodyRows = report.bodyRows.map((row) => ({
        id: row.body.id,
        name: row.body.name,
        kind: row.body.kind,
        quorumWhole: row.body.quorumWhole,
        termEndsOn: row.body.termEndsOn,
        membersN: row.membersN,
        termState: row.termState,
      }));
      const memberRows = report.members.map((row) => ({
        id: row.id,
        bodyId: row.bodyId,
        personId: row.personId,
        name: row.personId ? (report.matrix?.nodes?.get(row.personId)?.name || report.matrix?.roster?.get(row.personId)?.name || row.personId) : row.personId,
        role: row.role,
        termStart: row.termStart,
        termEnd: row.termEnd,
      }));
      const itemRows = report.rows.map((row) => ({
        id: row.item.id,
        bodyId: row.item.bodyId,
        subject: row.item.subject,
        kind: row.item.kind,
        openedOn: row.item.openedOn,
        closesOn: row.closesOn,
        stateKey: row.state.key,
        hasAdvice: Boolean(row.response),
        hasReply: Boolean(row.response?.replyOn),
        hasDecision: Boolean(row.decision),
      }));
      const sittingRows = report.sittingRows.map((row) => ({
        id: row.sitting.id,
        bodyId: row.sitting.bodyId,
        on: row.sitting.on,
        stateKey: row.state.key,
        minutesOn: row.sitting.minutesOn,
      }));
      const people = rows('people')
        .filter((row) => row && row.status !== 'archived' && row.id)
        .filter((row) => holdsHand(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const lines = rows('people')
        .filter((row) => row && row.status !== 'archived' && row.id)
        .filter((row) => holdsHand(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, bodies: bodyRows, members: memberRows, items: itemRows, sittings: sittingRows, people, lines };
    },

    /** The explicit scan. Pausable: a pause is a pause on every path. */
    voiceScan() {
      const check = seatFor(VOI_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.voiceMarkers = Array.isArray(draft.voiceMarkers) ? draft.voiceMarkers : [];
      }, {
        type: VOI_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: VOI_ROUTE,
        summary: `Employee-voice register scanned; the rule re-reads every window, advice, reply and sitting against its declared day (${VOI_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const EMPLOYEE_VOICE_CONTEXT = 'Read the employee-voice and consultation register (#/voice). It records what was put to a staff body, the period its instrument gave, what it advised, whether it was answered, and whether the decision followed. It scores no representative and no body.';
