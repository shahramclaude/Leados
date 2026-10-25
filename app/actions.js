/**
 * app/actions.js — every mutation in the application.
 *
 * Views never touch the store directly. Each action validates its input,
 * returns `{ok:false, error}` instead of throwing, and records an event so the
 * audit trail explains what changed and when. No DOM access lives here, which
 * is what makes the write path testable.
 */

import { addDays, dayKey } from './core/time.js';
import {
  ACTION_OWNERS,
  CONFIDENCE,
  PULSE_DIMENSIONS,
  REVIEW_RATINGS,
  ONBOARDING_HORIZONS,
  ONBOARDING_CATEGORIES,
  ONBOARDING_KINDS,
  normalizeTalkingPoints,
} from './core/schema.js';
import { buildReviewEvidence, calibrateReview, reviewReadiness, validPeriod } from './core/domain/reviews.js';
import { goalProgress } from './core/domain/goals.js';
import { createConflictActions } from './conflict-actions.js';
import { DELEGATION_AUTHORITY } from './core/domain/delegations.js';
import {
  starterCheckpointsForKind,
  planKind,
  planKindNoun,
  planKindRecordNoun,
} from './core/domain/onboarding.js';
import { isOpenWill } from './core/domain/growth.js';
import { isOpenAction, OWNER_LABELS } from './core/domain/oneonone.js';
import {
  CASE_KINDS,
  CASE_STATUSES,
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
  isCaseOpen,
  resolveLinkedEntity,
} from './core/domain/cases.js';
import {
  buildCaseFromUpstreamEntity,
  ensureEntityLink,
  onDelegationCompleted,
  propagateCaseEvent,
  propagateCaseResolution,
} from './core/domain/automation.js';

/**
 * `null` is a legal owner ("not decided yet"); anything else must be one of the
 * three real answers. A blank string from a form is normalised to null rather
 * than rejected — the field is optional, but a wrong value is never coerced
 * into a plausible one.
 */
function normalizeOwner(value) {
  if (value === null || value === undefined) return { ok: true, owner: null };
  const owner = typeof value === 'string' ? value.trim() : value;
  if (!owner) return { ok: true, owner: null };
  if (!ACTION_OWNERS.includes(owner)) {
    return { ok: false, error: 'Choose who owes this: them, you, or both.' };
  }
  return { ok: true, owner };
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function fail(error, field = null) {
  return { ok: false, error, field };
}

function isCalendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function delegationValidation(data) {
  if (!clean(data.title)) return { error: 'Name the outcome or responsibility being delegated.', field: 'title' };
  if (!clean(data.expectedOutcome)) return { error: 'Describe what a successful result will look like.', field: 'expectedOutcome' };
  if (!DELEGATION_AUTHORITY[data.authority]) return { error: 'Choose the decision authority being transferred.', field: 'authority' };
  if (!clean(data.support)) return { error: 'Record the resources, context or support the owner can rely on.', field: 'support' };
  if (!isCalendarDay(data.delegatedOn)) return { error: 'Choose a valid delegation date.', field: 'delegatedOn' };
  if (!isCalendarDay(data.dueOn)) return { error: 'Choose a valid due date.', field: 'dueOn' };
  if (data.dueOn < data.delegatedOn) return { error: 'The due date cannot be before the delegation date.', field: 'dueOn' };
  return null;
}

export function createApi(store, options = {}) {
  const id = options.idFactory || makeId;
  const clock = options.now || (() => new Date());
  const today = () => dayKey(clock());
  const stamp = () => clock().toISOString();

  const personExists = (personId) => store.state.people.some((p) => p.id === personId);
  const reviewById = (reviewId) => (store.state.reviews || []).find((review) => review.id === reviewId) || null;
  const validateReviewSource = (personId, rawReviewId) => {
    const sourceReviewId = clean(rawReviewId) || null;
    if (!sourceReviewId) return { ok: true, sourceReviewId: null };
    const review = reviewById(sourceReviewId);
    if (!review || review.status !== 'complete' || review.personId !== personId) {
      return fail('Choose a completed review for this same person, or remove the review source.', 'sourceReviewId');
    }
    return { ok: true, sourceReviewId: review.id };
  };
  const onboardingById = (planId) => (store.state.onboarding || []).find((plan) => plan.id === planId) || null;

  function append(draft, prefix) {
    return { id: id(prefix), createdAt: stamp() };
  }

  /**
   * A new development commitment in its full v9 shape.
   *
   * `addedOn` is the day it was written down, which is what "carried 2× since"
   * and the export's `first_agreed_on` derive from. Filling it here rather than
   * at render time means the date survives a later edit of the plan.
   */
  function newWillAction(personId, text, due, extra = {}) {
    return {
      id: id('ac'),
      text,
      due: due || null,
      addedOn: today(),
      done: false,
      completedOn: null,
      completedInReviewId: null,
      dropped: false,
      droppedOn: null,
      droppedReason: '',
      droppedInReviewId: null,
      personId,
      delegationId: null,
      carriedFromId: null,
      carriedToId: null,
      carriedInReviewId: null,
      ...extra,
    };
  }

  function validateDelegationLink(personId, rawDelegationId, plan = null) {
    const delegationId = clean(rawDelegationId) || null;
    if (!delegationId) return { ok: true, delegationId: null };
    const del = (store.state.delegations || []).find((d) => d.id === delegationId);
    if (!del || del.personId !== personId) {
      return fail('Choose a delegation owned by this person, or leave the link blank.', 'delegationId');
    }
    if (del.status === 'returned') {
      return fail('This delegation was returned to the leader; link an active or completed delegation instead.', 'delegationId');
    }
    if (plan && (plan.will || []).some((w) => !w.carriedToId && !w.dropped && w.delegationId === delegationId)) {
      return fail('This delegation is already linked to a commitment on this plan.', 'delegationId');
    }
    return { ok: true, delegationId: del.id };
  }

  const api = {
    ...createConflictActions(store, { now: clock, idFactory: id }),
    /* ------------------------------------------------------------ settings */
    updateSettings(patch) {
      const next = { ...patch };
      if (Object.hasOwn(next, 'pulseMinResponses')) {
        const value = next.pulseMinResponses;
        const floor = Number(value);
        if (value == null || typeof value === 'boolean' || !Number.isInteger(floor) || floor < 3 || floor > 25) {
          return fail('Choose a pulse privacy floor from 3 to 25 responses. Five is the default; a floor never guarantees anonymity.', 'pulseMinResponses');
        }
        next.pulseMinResponses = floor;
      }
      if (Object.hasOwn(next, 'idleLockMinutes')) {
        const value = Number(next.idleLockMinutes);
        if (!Number.isInteger(value) || value < 0 || value > 480) {
          return fail('Idle lock must be a whole number of minutes from 0 (off) to 480 (8 hours).', 'idleLockMinutes');
        }
        next.idleLockMinutes = value;
      }
      store.update(
        (draft) => {
          draft.settings = { ...draft.settings, ...next };
        },
        { type: 'settings.updated', entity: 'settings', summary: `Settings updated (${Object.keys(next).join(', ') || 'no change'})` },
      );
      return { ok: true, warning: store.persistError || null };
    },

    /* -------------------------------------------------------------- people */
    addPerson(data) {
      const name = clean(data.name) || '';
      if (!name) return fail('A name is required.', 'name');
      const person = {
        id: id('person'),
        name,
        role: clean(data.role) || '',
        level: data.level || 'ic',
        team: clean(data.team) || store.state.settings.teamName,
        managerId: data.managerId || null,
        startDate: data.startDate || today(),
        focus: clean(data.focus) || '',
        talkingPoints: normalizeTalkingPoints(data.talkingPoints),
        status: 'active',
        createdAt: stamp(),
        archivedAt: null,
      };
      store.update(
        (draft) => {
          draft.people.push(person);
        },
        { type: 'person.created', entity: 'person', entityId: person.id, summary: `Added ${person.name}` },
      );
      return { ok: true, id: person.id };
    },

    updatePerson(personId, patch) {
      if (!personExists(personId)) return fail('That person is no longer in the roster.');
      const before = store.state.people.find((p) => p.id === personId);
      store.update(
        (draft) => {
          const person = draft.people.find((p) => p.id === personId);
          if (!person) return;
          Object.assign(person, {
            name: patch.name !== undefined ? clean(patch.name) || person.name : person.name,
            role: patch.role !== undefined ? clean(patch.role) : person.role,
            level: patch.level || person.level,
            team: patch.team !== undefined ? clean(patch.team) : person.team,
            managerId: patch.managerId !== undefined ? patch.managerId || null : person.managerId,
            startDate: patch.startDate !== undefined ? patch.startDate || person.startDate : person.startDate,
            focus: patch.focus !== undefined ? clean(patch.focus) : person.focus,
            talkingPoints: patch.talkingPoints !== undefined ? normalizeTalkingPoints(patch.talkingPoints) : person.talkingPoints,
          });
        },
        { type: 'person.updated', entity: 'person', entityId: personId, summary: `Updated ${before?.name || 'person'}` },
      );
      return { ok: true };
    },

    archivePerson(personId) {
      const person = store.state.people.find((p) => p.id === personId);
      if (!person) return fail('That person is no longer in the roster.');
      store.update(
        (draft) => {
          const target = draft.people.find((p) => p.id === personId);
          target.status = 'archived';
          target.archivedAt = stamp();
        },
        { type: 'person.archived', entity: 'person', entityId: personId, summary: `Archived ${person.name} (history kept)` },
      );
      return { ok: true };
    },

    restorePerson(personId) {
      store.update(
        (draft) => {
          const target = draft.people.find((p) => p.id === personId);
          if (target) {
            target.status = 'active';
            target.archivedAt = null;
          }
        },
        { type: 'person.restored', entity: 'person', entityId: personId, summary: 'Restored to the active roster' },
      );
      return { ok: true };
    },

    /* -------------------------------------------------------------1:1s */
    /**
     * Log a 1:1 and, optionally, what happened to the promises made earlier.
     *
     * Every open commitment the leader touched must get an explicit outcome:
     * done in this conversation, still open, carried into a later meeting, or
     * dropped with a reason. Untouched commitments stay open — silence is
     * never recorded as completion, and nothing is auto-carried, because an
     * item that quietly moves forward every week hides a real blocker.
     */
    logOneOnOne(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const person = store.state.people.find((p) => p.id === data.personId);
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid meeting date.', 'date');
      if (date > today()) return fail('A 1:1 cannot be logged before it has happened.', 'date');
      const status = ['held', 'skipped', 'moved'].includes(data.status) ? data.status : 'held';

      const planned = Array.isArray(data.reconciliations) ? data.reconciliations : [];
      if (planned.length && status !== 'held') {
        return fail('Only a 1:1 that was held can confirm what happened to an earlier commitment.', 'status');
      }
      const rawResolvedTopics = Array.isArray(data.resolvedTalkingPoints) ? data.resolvedTalkingPoints : [];
      const resolvedTopicList = normalizeTalkingPoints(rawResolvedTopics);
      if (resolvedTopicList.length && status !== 'held') {
        return fail('Only a 1:1 that was held can clear topics the person asked to raise.', 'status');
      }
      for (const action of Array.isArray(data.actions) ? data.actions : []) {
        if (action?.due && !isCalendarDay(action.due)) {
          return fail('Choose a valid due date for the action, or leave it blank.', 'actionDue');
        }
        const owner = normalizeOwner(action?.owner);
        if (!owner.ok) return fail(owner.error, 'actionOwner');
      }
      const seen = new Set();
      const applied = [];
      for (const item of planned) {
        const outcome = ['done', 'still-open', 'carried', 'dropped'].includes(item?.outcome) ? item.outcome : null;
        if (!outcome) return fail('Choose done, still open, carried forward or dropped for each promise.', 'reconciliations');
        const sourceType = item.sourceType === 'managerSupport' ? 'managerSupport' : 'oneOnOne';
        const due = item.due ? String(item.due) : null;
        let source = null;
        if (sourceType === 'managerSupport') {
          source = store.state.managerSupport.find((record) => record.id === item.managerSupportId);
          if (!source) return fail('That manager follow-up no longer exists. Reload and try again.', 'reconciliations');
          if (source.personId !== person.id) return fail('A commitment can only be reconciled with the person it concerns.', 'reconciliations');
          if (source.addedOn > date) return fail('A commitment cannot be settled in a conversation that happened before it was created.', 'date');
          if (source.status !== 'open') return fail(`"${source.text}" is already closed. Reload before logging this 1:1.`, 'reconciliations');
        } else {
          const sourceMeeting = store.state.oneOnOnes.find((m) => m.id === item.meetingId);
          const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.actionId);
          if (!sourceMeeting || !sourceAction) return fail('That commitment no longer exists. Reload and try again.', 'reconciliations');
          if (sourceMeeting.personId !== person.id) return fail('A commitment can only be reconciled with the person it was agreed with.', 'reconciliations');
          if (sourceMeeting.date > date) return fail('A commitment cannot be settled in a conversation that happened before it was made.', 'date');
          if (!isOpenAction(sourceAction)) return fail(`"${sourceAction.text}" is already closed. Reload before logging this 1:1.`, 'reconciliations');
          source = { meeting: sourceMeeting, action: sourceAction };
        }
        const key = sourceType === 'managerSupport'
          ? `managerSupport|${source.id}`
          : `oneOnOne|${source.meeting.id}|${source.action.id}`;
        if (seen.has(key)) return fail('The same commitment was listed twice. Reload the form.', 'reconciliations');
        seen.add(key);
        if (outcome === 'still-open') continue;
        if (outcome === 'carried') {
          if (due && !isCalendarDay(due)) return fail('Choose a valid due date for the carried commitment, or leave it blank.', 'reconciliations');
          if (due && due < date) return fail('A carried commitment cannot be due before the 1:1 that moved it.', 'reconciliations');
        }
        if (outcome === 'dropped' && clean(item.reason).length > 300) {
          return fail('Keep the reason for dropping a commitment under 300 characters.', 'reconciliations');
        }
        applied.push({ sourceType, source, outcome, due, reason: clean(item.reason) || '' });
      }

      const meeting = {
        ...append(null, 'oo'),
        personId: data.personId,
        date,
        status,
        mood: data.mood ?? null,
        agenda: (data.agenda || []).map((a) => ({
          id: id('ag'),
          text: clean(a.text) || '',
          done: Boolean(a.done),
          source: a.source || 'manual',
        })).filter((a) => a.text),
        notes: clean(data.notes) || '',
        actions: (data.actions || [])
          .map((a) => ({
            id: id('ac'),
            text: clean(a.text) || '',
            due: a.due || null,
            done: false,
            completedOn: null,
            completedInMeetingId: null,
            dropped: false,
            droppedOn: null,
            droppedReason: '',
            droppedInMeetingId: null,
            personId: data.personId,
            owner: normalizeOwner(a.owner).owner,
            carriedFrom: null,
            carriedToMeetingId: null,
            carriedToActionId: null,
          }))
          .filter((a) => a.text),
      };

      const resolvedTopicKeys = new Set(resolvedTopicList.map((t) => t.toLowerCase()));
      const topicsCleared = status === 'held' && resolvedTopicKeys.size
        ? (person.talkingPoints || []).filter((t) => resolvedTopicKeys.has(t.toLowerCase())).length
        : 0;

      const closedCount = applied.filter((item) => item.outcome === 'done').length;
      const carriedCount = applied.filter((item) => item.outcome === 'carried').length;
      const droppedCount = applied.filter((item) => item.outcome === 'dropped').length;
      const parts = [];
      if (closedCount) parts.push(`${closedCount} promise${closedCount === 1 ? '' : 's'} closed`);
      if (carriedCount) parts.push(`${carriedCount} carried forward`);
      if (droppedCount) parts.push(`${droppedCount} dropped`);
      if (topicsCleared) parts.push(`${topicsCleared} employee topic${topicsCleared === 1 ? '' : 's'} covered`);

      store.update(
        (draft) => {
          draft.oneOnOnes.push(meeting);
          if (status === 'held' && resolvedTopicKeys.size) {
            const draftPerson = draft.people.find((p) => p.id === person.id);
            if (draftPerson && Array.isArray(draftPerson.talkingPoints)) {
              draftPerson.talkingPoints = draftPerson.talkingPoints.filter(
                (topic) => !resolvedTopicKeys.has(topic.toLowerCase()),
              );
            }
          }
          const live = draft.oneOnOnes.find((m) => m.id === meeting.id);
          for (const item of applied) {
            if (item.sourceType === 'managerSupport') {
              const source = draft.managerSupport.find((record) => record.id === item.source.id);
              if (!source || source.status !== 'open') continue;
              source.updatedAt = stamp();
              if (item.outcome === 'done') {
                source.status = 'done';
                source.completedOn = date;
                source.completedInMeetingId = meeting.id;
                continue;
              }
              if (item.outcome === 'dropped') {
                source.status = 'dropped';
                source.droppedOn = date;
                source.droppedReason = item.reason;
                source.droppedInMeetingId = meeting.id;
                continue;
              }
              const successor = {
                ...source,
                id: id('msup'),
                due: item.due,
                addedOn: date,
                status: 'open',
                completedOn: null,
                completedInMeetingId: null,
                droppedOn: null,
                droppedReason: '',
                droppedInMeetingId: null,
                carriedFromId: source.id,
                carriedFromMeetingId: meeting.id,
                carriedToId: null,
                carriedOn: null,
                carriedInMeetingId: null,
                createdAt: stamp(),
                updatedAt: stamp(),
              };
              source.status = 'carried';
              source.carriedToId = successor.id;
              source.carriedOn = date;
              source.carriedInMeetingId = meeting.id;
              draft.managerSupport.push(successor);
              continue;
            }
            const sourceMeeting = draft.oneOnOnes.find((m) => m.id === item.source.meeting.id);
            const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.source.action.id);
            if (!sourceAction || !isOpenAction(sourceAction)) continue;
            if (item.outcome === 'done') {
              sourceAction.done = true;
              sourceAction.completedOn = date;
              sourceAction.completedInMeetingId = meeting.id;
              sourceAction.carriedToMeetingId = null;
              sourceAction.carriedToActionId = null;
              continue;
            }
            if (item.outcome === 'dropped') {
              sourceAction.dropped = true;
              sourceAction.droppedOn = date;
              sourceAction.droppedReason = item.reason;
              sourceAction.droppedInMeetingId = meeting.id;
              sourceAction.carriedToMeetingId = null;
              sourceAction.carriedToActionId = null;
              continue;
            }
            const successor = {
              id: id('ac'),
              text: sourceAction.text,
              due: item.due,
              done: false,
              completedOn: null,
              completedInMeetingId: null,
              dropped: false,
              droppedOn: null,
              droppedReason: '',
              droppedInMeetingId: null,
              personId: person.id,
              // A carried promise keeps the owner it was agreed with. Changing
              // who owes it is a separate, audited decision.
              owner: sourceAction.owner || null,
              carriedFrom: { meetingId: sourceMeeting.id, actionId: sourceAction.id },
              carriedToMeetingId: null,
              carriedToActionId: null,
            };
            live.actions.push(successor);
            sourceAction.carriedToMeetingId = meeting.id;
            sourceAction.carriedToActionId = successor.id;
          }
        },
        {
          type: 'oneonone.logged',
          entity: 'oneOnOne',
          entityId: meeting.id,
          summary: `${status === 'held' ? '1:1 held' : `1:1 ${status}`} with ${person.name}${parts.length ? ` — ${parts.join(', ')}` : ''}`,
        },
      );
      return {
        ok: true,
        id: meeting.id,
        closed: closedCount,
        carried: carriedCount,
        dropped: droppedCount,
        topicsCleared,
      };
    },

    toggleMeetingAction(meetingId, actionId) {
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      const action = meeting?.actions.find((a) => a.id === actionId);
      if (!action) return fail('That action no longer exists.');
      if (action.carriedToMeetingId) {
        return fail('This commitment was carried forward to a later 1:1. Update the newer copy instead.');
      }
      if (action.dropped) return fail('This commitment was explicitly dropped. Add a new action if it is back on.');
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId)?.actions.find((a) => a.id === actionId);
          if (!target) return;
          target.done = !target.done;
          target.completedOn = target.done ? today() : null;
          // Ticking it off on the board is a report, not a conversation: it must
          // not claim a 1:1 confirmed it.
          target.completedInMeetingId = null;
        },
        { type: 'oneonone.action.toggled', entity: 'oneOnOne', entityId: meetingId, summary: '1:1 action toggled' },
      );
      return { ok: true };
    },

    addMeetingAction(meetingId, text, due, ownerValue = null) {
      const value = clean(text);
      if (!value) return fail('Describe the action.', 'text');
      if (due && !isCalendarDay(due)) return fail('Choose a valid due date, or leave it blank.', 'due');
      const owner = normalizeOwner(ownerValue);
      if (!owner.ok) return fail(owner.error, 'owner');
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      if (!meeting) return fail('That 1:1 no longer exists.');
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId);
          if (!target) return;
          target.actions.push({
            id: id('ac'),
            text: value,
            due: due || null,
            done: false,
            completedOn: null,
            completedInMeetingId: null,
            dropped: false,
            droppedOn: null,
            droppedReason: '',
            droppedInMeetingId: null,
            personId: target.personId,
            owner: owner.owner,
            carriedFrom: null,
            carriedToMeetingId: null,
            carriedToActionId: null,
          });
        },
        { type: 'oneonone.action.added', entity: 'oneOnOne', entityId: meetingId, summary: `Action added: ${value.slice(0, 60)}` },
      );
      return { ok: true };
    },

    /* ----------------------------------------------------------- feedback */
    addFeedback(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const behavior = clean(data.behavior) || '';
      if (!behavior) return fail('The behaviour is the one part that cannot be omitted.', 'behavior');
      const kind = data.kind === 'constructive' ? 'constructive' : 'praise';
      const date = data.date || today();
      const observedOn = data.observedOn || null;
      if (!isCalendarDay(date)) return fail('Choose a valid conversation date.', 'date');
      if (date > today()) return fail('The feedback conversation cannot be dated in the future.', 'date');
      if (observedOn && !isCalendarDay(observedOn)) return fail('Choose a valid observation date, or leave it unknown.', 'observedOn');
      if (observedOn && observedOn > date) return fail('The observation cannot be after the feedback conversation.', 'observedOn');
      const item = {
        ...append(null, 'fb'),
        personId: data.personId,
        direction: data.direction === 'received' ? 'received' : 'given',
        kind,
        situation: clean(data.situation) || '',
        behavior,
        impact: clean(data.impact) || '',
        tags: (data.tags || []).map((t) => clean(t)).filter(Boolean).slice(0, 6),
        date,
        observedOn,
        followUpOn: data.followUpOn || null,
        followUpDone: false,
        followUpCompletedOn: null,
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          draft.feedback.push(item);
        },
        {
          type: 'feedback.created',
          entity: 'feedback',
          entityId: item.id,
          summary: `${kind === 'praise' ? 'Praise' : 'Constructive feedback'} ${item.direction === 'received' ? 'received from' : 'given to'} ${person.name}`,
        },
      );
      return { ok: true, id: item.id };
    },

    updateFeedback(feedbackId, patch) {
      const existing = store.state.feedback.find((f) => f.id === feedbackId);
      if (!existing) return fail('That feedback record no longer exists.');
      const next = { ...existing, ...patch, observedOn: patch.observedOn !== undefined ? patch.observedOn || null : existing.observedOn || null };
      if (!isCalendarDay(next.date)) return fail('Choose a valid conversation date.', 'date');
      if (next.date > today()) return fail('The feedback conversation cannot be dated in the future.', 'date');
      if (next.observedOn && !isCalendarDay(next.observedOn)) return fail('Choose a valid observation date, or leave it unknown.', 'observedOn');
      if (next.observedOn && next.observedOn > next.date) return fail('The observation cannot be after the feedback conversation.', 'observedOn');
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (!item) return;
          Object.assign(item, patch, { observedOn: next.observedOn });
        },
        { type: 'feedback.updated', entity: 'feedback', entityId: feedbackId, summary: 'Feedback updated' },
      );
      return { ok: true };
    },

    completeFollowUp(feedbackId, done = true) {
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (!item) return;
          item.followUpDone = Boolean(done);
          item.followUpCompletedOn = done ? today() : null;
        },
        { type: 'feedback.followup', entity: 'feedback', entityId: feedbackId, summary: done ? 'Feedback follow-up closed' : 'Feedback follow-up reopened' },
      );
      return { ok: true };
    },

    /* --------------------------------------------------------------- goals */
    addGoal(data) {
      const title = clean(data.title) || '';
      if (!title) return fail('Give the goal a name.', 'title');
      const reviewSource = validateReviewSource(data.ownerId || null, data.sourceReviewId);
      if (!reviewSource.ok) return reviewSource;
      const confidence = CONFIDENCE.includes(data.confidence) ? data.confidence : 'on-track';
      const status = ['active', 'done', 'dropped'].includes(data.status) ? data.status : 'active';
      const goal = {
        ...append(null, 'goal'),
        sourceReviewId: reviewSource.sourceReviewId,
        title,
        description: clean(data.description) || '',
        ownerId: data.ownerId || null,
        scope: data.scope === 'team' ? 'team' : 'person',
        coAuthored: data.ownerId ? (data.coAuthored === true ? true : data.coAuthored === false ? false : null) : null,
        dueDate: data.dueDate || null,
        keyResults: (data.keyResults || [])
          .map((kr) => {
            const start = Number(kr.start) || 0;
            const current = Number.isFinite(Number(kr.current)) ? Number(kr.current) : start;
            return {
              id: id('kr'),
              title: clean(kr.title) || '',
              start,
              target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
              current,
              initialCurrent: current,
              unit: clean(kr.unit) || '',
            };
          })
          .filter((kr) => kr.title),
        confidence,
        initialConfidence: confidence,
        status,
        completedOn: status === 'done' ? today() : null,
        krUpdatedOn: null,
        checkins: [],
      };
      store.update(
        (draft) => {
          draft.goals.push(goal);
        },
        { type: 'goal.created', entity: 'goal', entityId: goal.id, summary: `Goal created: ${title.slice(0, 70)}` },
      );
      return { ok: true, id: goal.id };
    },

    updateGoal(goalId, patch) {
      if (!store.state.goals.some((goal) => goal.id === goalId)) return fail('That goal no longer exists.');
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          const previousOwner = goal.ownerId;
          const previousStatus = goal.status;
          if (patch.title !== undefined) goal.title = clean(patch.title) || goal.title;
          if (patch.description !== undefined) goal.description = clean(patch.description);
          if (patch.dueDate !== undefined) goal.dueDate = patch.dueDate || null;
          if (patch.ownerId !== undefined) goal.ownerId = patch.ownerId || null;
          if (patch.coAuthored !== undefined && goal.ownerId) {
            goal.coAuthored = patch.coAuthored === true ? true : patch.coAuthored === false ? false : null;
          } else if (!goal.ownerId || previousOwner !== goal.ownerId) {
            goal.coAuthored = null;
          }
          if (patch.confidence && CONFIDENCE.includes(patch.confidence)) {
            goal.confidence = patch.confidence;
            if (!goal.checkins.length && (goal.createdAt || '').slice(0, 10) === today()) {
              goal.initialConfidence = patch.confidence;
            }
          }
          if (patch.status && ['active', 'done', 'dropped'].includes(patch.status)) {
            goal.status = patch.status;
            if (patch.status === 'done' && previousStatus !== 'done') goal.completedOn = today();
            else if (patch.status !== 'done') goal.completedOn = null;
          }
        },
        { type: 'goal.updated', entity: 'goal', entityId: goalId, summary: 'Goal updated' },
      );
      return { ok: true };
    },

    /** Check in: records confidence, a note, and dated key-result snapshots. */
    checkInGoal(goalId, { note = '', confidence = 'on-track', keyResults = [] } = {}) {
      const goal = store.state.goals.find((g) => g.id === goalId);
      if (!goal) return fail('That goal no longer exists.');
      const safeConfidence = CONFIDENCE.includes(confidence) ? confidence : 'on-track';
      store.update(
        (draft) => {
          const target = draft.goals.find((g) => g.id === goalId);
          if (!target) return;
          for (const update of keyResults) {
            const kr = target.keyResults.find((k) => k.id === update.id);
            if (kr && Number.isFinite(Number(update.current))) kr.current = Number(update.current);
          }
          target.confidence = safeConfidence;
          target.checkins.push({
            id: id('chk'),
            date: today(),
            note: clean(note) || '',
            confidence: safeConfidence,
            progressPct: goalProgress(target),
            keyResults: target.keyResults.map((kr) => ({ id: kr.id, current: kr.current })),
          });
        },
        {
          type: 'goal.checkin',
          entity: 'goal',
          entityId: goalId,
          summary: `Check-in on "${goal.title.slice(0, 50)}" (${safeConfidence})`,
        },
      );
      return { ok: true };
    },

    addKeyResult(goalId, kr) {
      const title = clean(kr.title) || '';
      if (!title) return fail('Name the key result.', 'title');
      if (!store.state.goals.some((goal) => goal.id === goalId)) return fail('That goal no longer exists. Reopen it and try again.', 'title');
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          const start = Number(kr.start) || 0;
          const current = Number.isFinite(Number(kr.current)) ? Number(kr.current) : start;
          goal.keyResults.push({
            id: id('kr'),
            title,
            start,
            target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
            current,
            initialCurrent: current,
            unit: clean(kr.unit) || '',
          });
          goal.krUpdatedOn = today();
        },
        { type: 'goal.kr.added', entity: 'goal', entityId: goalId, summary: `Key result added: ${title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    removeKeyResult(goalId, krId) {
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          goal.keyResults = goal.keyResults.filter((k) => k.id !== krId);
          goal.krUpdatedOn = today();
        },
        { type: 'goal.kr.removed', entity: 'goal', entityId: goalId, summary: 'Key result removed' },
      );
      return { ok: true };
    },

    /* ---------------------------------------------------------- delegation */
    addDelegation(data) {
      if (!personExists(data.personId)) return fail('Choose one accountable owner.', 'personId');
      const person = store.state.people.find((p) => p.id === data.personId);
      if (person.status === 'archived') return fail('Restore this person before delegating new work to them.', 'personId');
      const input = {
        title: clean(data.title) || '',
        expectedOutcome: clean(data.expectedOutcome) || '',
        authority: data.authority || '',
        support: clean(data.support) || '',
        delegatedOn: data.delegatedOn || today(),
        dueOn: data.dueOn || null,
      };
      const invalid = delegationValidation(input);
      if (invalid) return fail(invalid.error, invalid.field);
      if (input.delegatedOn > today()) return fail('The delegation cannot be dated in the future.', 'delegatedOn');
      const delegation = {
        ...append(null, 'delegation'),
        ...input,
        personId: data.personId,
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        updatedAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.delegations.push(delegation);
        },
        { type: 'delegation.created', entity: 'delegation', entityId: delegation.id, summary: `Delegated “${delegation.title.slice(0, 60)}” to ${person.name} (${DELEGATION_AUTHORITY[delegation.authority].shortLabel})` },
      );
      return { ok: true, id: delegation.id };
    },

    updateDelegation(delegationId, patch) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('Completed or returned delegations are kept as history and cannot be edited.');
      const next = {
        title: patch.title !== undefined ? clean(patch.title) || '' : current.title,
        expectedOutcome: patch.expectedOutcome !== undefined ? clean(patch.expectedOutcome) || '' : current.expectedOutcome,
        authority: patch.authority !== undefined ? patch.authority : current.authority,
        support: patch.support !== undefined ? clean(patch.support) || '' : current.support,
        delegatedOn: patch.delegatedOn !== undefined ? patch.delegatedOn : current.delegatedOn,
        dueOn: patch.dueOn !== undefined ? patch.dueOn || null : current.dueOn,
      };
      const invalid = delegationValidation(next);
      if (invalid) return fail(invalid.error, invalid.field);
      if (next.delegatedOn > today()) return fail('The delegation cannot be dated in the future.', 'delegatedOn');
      if (current.checkins.some((checkin) => checkin.date < next.delegatedOn)) {
        return fail('The delegation date cannot be after an existing check-in.', 'delegatedOn');
      }
      store.update(
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, next, { updatedAt: stamp() });
        },
        { type: 'delegation.updated', entity: 'delegation', entityId: delegationId, summary: `Delegation updated: ${next.title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    checkInDelegation(delegationId, data) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const date = data.date || today();
      const note = clean(data.note) || '';
      const progress = data.progress;
      if (!isCalendarDay(date) || date > today()) return fail('Choose a valid check-in date that is not in the future.', 'date');
      if (date < current.delegatedOn) return fail('A check-in cannot predate the delegation.', 'date');
      if (!['on-track', 'blocked'].includes(progress)) return fail('Say whether the outcome is on track or blocked.', 'progress');
      if (!note) return fail('Record what changed, what is next, or what support is needed.', 'note');
      const checkin = { id: id('dchk'), date, progress, note, createdAt: stamp() };
      store.update(
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          target.checkins.push(checkin);
          target.updatedAt = stamp();
        },
        { type: 'delegation.checkin', entity: 'delegation', entityId: delegationId, summary: `Delegation check-in: ${current.title.slice(0, 50)} (${progress})` },
      );
      return { ok: true, id: checkin.id };
    },

    completeDelegation(delegationId, data = {}) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const completedOn = data.completedOn || today();
      const completionNote = clean(data.completionNote) || '';
      if (!isCalendarDay(completedOn) || completedOn > today() || completedOn < current.delegatedOn) {
        return fail('Choose a valid completion date within the delegation period, not in the future.', 'completedOn');
      }
      if (current.checkins.some((checkin) => checkin.date > completedOn)) {
        return fail('Completion cannot predate an existing check-in.', 'completedOn');
      }
      if (!completionNote) return fail('Record the outcome delivered and any follow-up that remains.', 'completionNote');
      store.update(
        (draft, { logEvent }) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, { status: 'done', completedOn, completionNote, updatedAt: stamp() });
          onDelegationCompleted(draft, delegationId, { now: clock(), logEvent });
        },
        { type: 'delegation.completed', entity: 'delegation', entityId: delegationId, summary: `Delegation completed: ${current.title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    returnDelegation(delegationId, data = {}) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const returnedOn = data.returnedOn || today();
      const returnReason = clean(data.returnReason) || '';
      if (!isCalendarDay(returnedOn) || returnedOn > today() || returnedOn < current.delegatedOn) {
        return fail('Choose a valid return date within the delegation period, not in the future.', 'returnedOn');
      }
      if (current.checkins.some((checkin) => checkin.date > returnedOn)) {
        return fail('Returning the work cannot predate an existing check-in.', 'returnedOn');
      }
      if (!returnReason) return fail('Explain why the work came back and what happens next.', 'returnReason');
      store.update(
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, { status: 'returned', returnedOn, returnReason, updatedAt: stamp() });
        },
        { type: 'delegation.returned', entity: 'delegation', entityId: delegationId, summary: `Delegation returned to leader: ${current.title.slice(0, 50)}` },
      );
      return { ok: true };
    },

    /**
     * Record (or correct) who owes an open commitment.
     *
     * Closed promises are refused on purpose: rewriting the owner of something
     * already done or dropped would rewrite the history the ledger exists to
     * keep. So is a promise that was carried forward — the live copy in the
     * later meeting is the one to change, and the error says where it is.
     */
    setActionOwner(meetingId, actionId, ownerValue) {
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      const action = meeting?.actions.find((a) => a.id === actionId);
      if (!meeting || !action) return fail('That commitment no longer exists. Reload and try again.');
      const owner = normalizeOwner(ownerValue);
      if (!owner.ok) return fail(owner.error, 'owner');
      if (action.done || action.dropped) {
        return fail('This promise is already closed; its owner is part of the record.');
      }
      if (action.carriedToMeetingId) {
        const successor = store.state.oneOnOnes.find((m) => m.id === action.carriedToMeetingId);
        return fail(successor
          ? `This promise was carried forward to the 1:1 on ${successor.date}. Change the owner on that copy.`
          : 'This promise was carried forward. Change the owner on the newer copy.');
      }
      if ((action.owner || null) === owner.owner) return { ok: true, unchanged: true };
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId)?.actions.find((a) => a.id === actionId);
          if (!target) return;
          target.owner = owner.owner;
        },
        {
          type: 'oneonone.action.owner',
          entity: 'oneOnOne',
          entityId: meetingId,
          summary: owner.owner
            ? `Promise owner set to ${OWNER_LABELS[owner.owner].toLowerCase()}: ${action.text.slice(0, 60)}`
            : `Promise owner cleared: ${action.text.slice(0, 60)}`,
        },
      );
      return { ok: true, owner: owner.owner };
    },

    /* -------------------------------------------------------------- growth */
    saveGrowthPlan(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const reviewSource = validateReviewSource(data.personId, data.sourceReviewId);
      if (!reviewSource.ok) return reviewSource;
      const goal = clean(data.goal) || '';
      if (!goal) return fail('A GROW plan starts with a goal.', 'goal');
      const seenDelegationIds = new Set();
      for (const action of Array.isArray(data.will) ? data.will : []) {
        if (action?.due && !isCalendarDay(action.due)) return fail('Choose a valid due date for the commitment, or leave it blank.', 'willDue');
        if (action?.delegationId) {
          const linkCheck = validateDelegationLink(data.personId, action.delegationId);
          if (!linkCheck.ok) return linkCheck;
          if (seenDelegationIds.has(linkCheck.delegationId)) {
            return fail('The same delegation cannot be linked twice on the same plan.', 'delegationId');
          }
          seenDelegationIds.add(linkCheck.delegationId);
        }
      }
      if (data.reviewOn && !isCalendarDay(data.reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      const plan = {
        ...append(null, 'gp'),
        sourceReviewId: reviewSource.sourceReviewId,
        personId: data.personId,
        goal,
        reality: clean(data.reality) || '',
        options: (data.options || []).map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text),
        will: (data.will || [])
          .map((a) => newWillAction(data.personId, clean(a.text) || '', a.due || null, {
            delegationId: clean(a.delegationId) || null,
          }))
          .filter((a) => a.text),
        competencies: (data.competencies || []).map((c) => clean(c)).filter(Boolean),
        reviewOn: data.reviewOn || null,
        reviews: [],
        reviewDeferrals: 0,
        reviewMovedOn: null,
        status: 'active',
        closedOn: null,
        stagesUpdatedOn: null,
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          // A person has one active plan at a time; close the previous one.
          for (const existing of draft.growthPlans) {
            if (existing.personId === data.personId && existing.status === 'active') {
              existing.status = 'done';
              existing.closedOn = today();
            }
          }
          draft.growthPlans.push(plan);
        },
        { type: 'growth.created', entity: 'growthPlan', entityId: plan.id, summary: `Growth plan for ${person.name}` },
      );
      return { ok: true, id: plan.id };
    },

    updateGrowthPlan(planId, patch) {
      if (patch.reviewOn && !isCalendarDay(patch.reviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      store.update(
        (draft) => {
          const plan = draft.growthPlans.find((p) => p.id === planId);
          if (!plan) return;
          const previousStatus = plan.status;
          let stageChanged = false;
          if (patch.goal !== undefined) {
            const nextGoal = clean(patch.goal) || plan.goal;
            if (nextGoal !== plan.goal) stageChanged = true;
            plan.goal = nextGoal;
          }
          if (patch.reality !== undefined) {
            const nextReality = clean(patch.reality);
            if (nextReality !== plan.reality) stageChanged = true;
            plan.reality = nextReality;
          }
          if (patch.reviewOn !== undefined) {
            const next = patch.reviewOn || null;
            if (next && !isCalendarDay(next)) return;
            // Pushing the next review out without holding one is recorded, not
            // silent: a reviewing ritual that keeps sliding is not a review.
            if (next && plan.reviewOn && next > plan.reviewOn) {
              plan.reviewDeferrals = (plan.reviewDeferrals || 0) + 1;
              plan.reviewMovedOn = today();
            }
            plan.reviewOn = next;
          }
          if (patch.status) {
            plan.status = patch.status === 'done' ? 'done' : 'active';
            if (plan.status === 'done' && previousStatus !== 'done') plan.closedOn = today();
            else if (plan.status === 'active') plan.closedOn = null;
          }
          if (Array.isArray(patch.options)) {
            plan.options = patch.options.map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text);
            stageChanged = true;
          }
          if (Array.isArray(patch.competencies)) plan.competencies = patch.competencies.map((c) => clean(c)).filter(Boolean);
          if (stageChanged && (plan.createdAt || '').slice(0, 10) !== today()) {
            plan.stagesUpdatedOn = today();
          }
        },
        { type: 'growth.updated', entity: 'growthPlan', entityId: planId, summary: 'Growth plan updated' },
      );
      return { ok: true };
    },

    addWillAction(planId, text, due, extra = {}) {
      const value = clean(text);
      if (!value) return fail('Describe the commitment.', 'text');
      if (due && !isCalendarDay(due)) return fail('Choose a valid due date, or leave it blank.', 'due');
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed. Start a new one instead of adding commitments to history.');
      const linkCheck = validateDelegationLink(plan.personId, extra?.delegationId, plan);
      if (!linkCheck.ok) return linkCheck;
      const entry = newWillAction(plan.personId, value, due || null, {
        delegationId: linkCheck.delegationId,
      });
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId);
          if (!target) return;
          target.will.push(entry);
        },
        { type: 'growth.will.added', entity: 'growthPlan', entityId: planId, summary: `Development action added: ${value.slice(0, 50)}` },
      );
      return { ok: true, id: entry.id };
    },

    toggleWillAction(planId, actionId) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      const action = plan?.will.find((a) => a.id === actionId);
      if (!plan || !action) return fail('That commitment no longer exists.');
      if (action.carriedToId) return fail('This commitment was carried forward. Update the newer copy instead.');
      if (action.dropped) return fail('This commitment was explicitly dropped. Add a new one if it is back on.');
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId)?.will.find((a) => a.id === actionId);
          if (!target) return;
          target.done = !target.done;
          target.completedOn = target.done ? today() : null;
          // Ticking a box is a report, not a review: it must not claim that a
          // development conversation confirmed it.
          target.completedInReviewId = null;
        },
        { type: 'growth.will.toggled', entity: 'growthPlan', entityId: planId, summary: 'Development action toggled' },
      );
      return { ok: true };
    },

    /**
     * Move a commitment into a later date without losing where it came from.
     *
     * The original stays as history (with a link to its successor); the new copy
     * is the live promise. A carry is an explicit re-commitment, so it needs a
     * new date — silently re-showing the old one is what makes a stalled plan
     * look busy.
     */
    carryWillAction(planId, actionId, due, reviewId = null) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed; its commitments are part of the record.');
      const action = plan.will.find((a) => a.id === actionId);
      if (!action) return fail('That commitment no longer exists. Reload and try again.');
      if (!isOpenWill(action)) {
        return fail(action.done ? 'This commitment is already done.' : action.dropped ? 'This commitment was dropped.' : 'This commitment was already carried forward.');
      }
      if (!due || !isCalendarDay(due)) return fail('Choose a new date for the carried commitment.', 'due');
      if (due < today()) return fail('A carried commitment cannot be due in the past.', 'due');
      if (reviewId && !(plan.reviews || []).some((review) => review.id === reviewId)) {
        return fail('That review is not on this plan. Reload and try again.');
      }
      const successorId = id('ac');
      store.update(
        (draft) => {
          const targetPlan = draft.growthPlans.find((p) => p.id === planId);
          const source = targetPlan?.will.find((a) => a.id === actionId);
          if (!source) return;
          source.carriedToId = successorId;
          targetPlan.will.push(newWillAction(targetPlan.personId, source.text, due, {
            // The link on the original already names this id, so the successor
            // has to be created with exactly that id — a second id would leave
            // the promise pointing at a record that does not exist.
            id: successorId,
            delegationId: source.delegationId || null,
            carriedFromId: source.id,
            carriedInReviewId: reviewId || null,
          }));
        },
        {
          type: 'growth.will.carried',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development commitment carried forward to ${due}: ${action.text.slice(0, 50)}`,
        },
      );
      return { ok: true, id: successorId };
    },

    /**
     * Stop a commitment on purpose.
     *
     * A reason is required: "we decided this no longer matters" is the single
     * most useful thing a development record can hold, and an unexplained drop
     * is indistinguishable from forgetting.
     */
    dropWillAction(planId, actionId, reason, reviewId = null) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed; its commitments are part of the record.');
      const action = plan.will.find((a) => a.id === actionId);
      if (!action) return fail('That commitment no longer exists. Reload and try again.');
      if (!isOpenWill(action)) return fail('Only an open commitment can be dropped.');
      if (reviewId && !(plan.reviews || []).some((review) => review.id === reviewId)) {
        return fail('That review is not on this plan. Reload and try again.');
      }
      const why = clean(reason) || '';
      if (why.length < 3) return fail('Say why it is no longer worth doing — the reason is the record.', 'reason');
      if (why.length > 300) return fail('Keep the reason under 300 characters.', 'reason');
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId)?.will.find((a) => a.id === actionId);
          if (!target) return;
          target.dropped = true;
          target.droppedOn = today();
          target.droppedReason = why;
          target.droppedInReviewId = reviewId || null;
        },
        {
          type: 'growth.will.dropped',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development commitment dropped (${why.slice(0, 60)})`,
        },
      );
      return { ok: true };
    },

    /**
     * Record a development review: the conversation, its decisions, and the date
     * the next one is owed.
     *
     * The review is a first-class record rather than an edit of `reviewOn`,
     * because "I moved the date" and "we talked" are different facts and only one
     * of them develops anybody.
     */
    logGrowthReview(planId, data = {}) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed. Reopen it before recording a review.');
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid review date.', 'date');
      if (date > today()) return fail('A review cannot be logged before it has happened.', 'date');
      const notes = clean(data.notes) || '';
      if (notes.length < 5) return fail('Write a line about what was actually discussed — a review with no record is a checkbox.', 'notes');
      if (notes.length > 4000) return fail('Keep the review notes under 4000 characters.', 'notes');
      const nextReviewOn = data.nextReviewOn || null;
      if (nextReviewOn) {
        if (!isCalendarDay(nextReviewOn)) return fail('Choose a valid date for the next review.', 'nextReviewOn');
        if (nextReviewOn <= date) return fail('The next review has to be after this one.', 'nextReviewOn');
      }
      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      const seen = new Set();
      const applied = [];
      for (const item of decisions) {
        const outcome = ['done', 'still-open', 'carried', 'dropped'].includes(item?.outcome) ? item.outcome : null;
        if (!outcome) return fail('Choose done, still open, carried forward or dropped for each commitment.', 'decisions');
        const source = plan.will.find((a) => a.id === item.actionId);
        if (!source) return fail('That commitment no longer exists. Reload and try again.', 'decisions');
        if (!isOpenWill(source)) return fail(`"${source.text}" is already closed. Reload before logging this review.`, 'decisions');
        if (seen.has(source.id)) return fail('The same commitment was listed twice. Reload the form.', 'decisions');
        seen.add(source.id);
        if (outcome === 'still-open') continue;
        if (outcome === 'carried') {
          if (!item.due || !isCalendarDay(item.due)) return fail('Choose a new date for the carried commitment.', 'decisions');
          if (item.due < date) return fail('A carried commitment cannot be due before the review that moved it.', 'decisions');
        }
        if (outcome === 'dropped') {
          const why = clean(item.reason) || '';
          if (why.length < 3) return fail('Say why each dropped commitment is no longer worth doing.', 'decisions');
          if (why.length > 300) return fail('Keep each reason under 300 characters.', 'decisions');
        }
        applied.push({ source, outcome, due: item.due || null, reason: clean(item.reason) || '' });
      }

      const review = { ...append(null, 'grev'), date, notes, nextReviewOn };
      const closed = applied.filter((d) => d.outcome === 'done').length;
      const carried = applied.filter((d) => d.outcome === 'carried').length;
      const dropped = applied.filter((d) => d.outcome === 'dropped').length;
      const parts = [];
      if (closed) parts.push(`${closed} closed`);
      if (carried) parts.push(`${carried} carried forward`);
      if (dropped) parts.push(`${dropped} dropped`);

      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId);
          target.reviews.push(review);
          for (const decision of applied) {
            const source = target.will.find((a) => a.id === decision.source.id);
            if (!source || !isOpenWill(source)) continue;
            if (decision.outcome === 'done') {
              source.done = true;
              source.completedOn = date;
              source.completedInReviewId = review.id;
              continue;
            }
            if (decision.outcome === 'dropped') {
              source.dropped = true;
              source.droppedOn = date;
              source.droppedReason = decision.reason;
              source.droppedInReviewId = review.id;
              continue;
            }
            const successor = newWillAction(target.personId, source.text, decision.due, {
              delegationId: source.delegationId || null,
              carriedFromId: source.id,
              carriedInReviewId: review.id,
              // The successor was agreed in the review, not on the day the
              // review happened to be entered.
              addedOn: date,
            });
            source.carriedToId = successor.id;
            target.will.push(successor);
          }
          target.reviewOn = nextReviewOn;
          // A held review resets the deferral count: the thing that kept sliding
          // finally happened.
          target.reviewDeferrals = 0;
          target.reviewMovedOn = null;
        },
        {
          type: 'growth.reviewed',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development review${parts.length ? ` — ${parts.join(', ')}` : ''}${nextReviewOn ? ` · next ${nextReviewOn}` : ''}`,
        },
      );
      return { ok: true, id: review.id, closed, carried, dropped, nextReviewOn };
    },

    /* --------------------------------------------------------------- pulse */
    submitPulse(data) {
      const scores = {};
      for (const dim of PULSE_DIMENSIONS) {
        const raw = data.scores?.[dim];
        if (raw == null || typeof raw === 'boolean' || (typeof raw === 'string' && !raw.trim())) continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 1 && value <= 5) scores[dim] = Math.round(value);
      }
      if (!Object.keys(scores).length) return fail('Answer at least one question.', 'scores');
      const anonymous = data.anonymity !== 'named';
      if (!anonymous && !personExists(data.personId)) return fail('Choose who is answering, or submit anonymously.', 'personId');
      const response = {
        ...append(null, 'pulse'),
        date: today(),
        // Anonymous responses are never linked to a person.
        personId: anonymous ? null : data.personId,
        anonymity: anonymous ? 'anonymous' : 'named',
        scores,
        comment: clean(data.comment) || '',
      };
      store.update(
        (draft) => {
          draft.pulses.push(response);
        },
        {
          type: 'pulse.submitted',
          entity: 'pulse',
          entityId: response.id,
          summary: `Pulse response recorded (${response.anonymity})`,
        },
      );
      return { ok: true, id: response.id };
    },

    /* ----------------------------------------------------------- decisions */
    addDecision(data = {}) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the decision.', 'title');
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid decision date.', 'date');
      const reviewOn = data.reviewOn ? String(data.reviewOn).trim() : null;
      if (reviewOn && !isCalendarDay(reviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      if (reviewOn && reviewOn < date) {
        return fail('The review date cannot be before the decision date.', 'reviewOn');
      }
      const decision = {
        ...append(null, 'dec'),
        title,
        question: clean(data.question) || '',
        date,
        reversibility: data.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
        driver: clean(data.driver) || '',
        approver: clean(data.approver) || '',
        contributors: clean(data.contributors) || '',
        informed: clean(data.informed) || '',
        options: (data.options || [])
          .map((o) => ({ id: o?.id ? String(o.id) : id('dopt'), label: clean(o?.label) || '', pros: clean(o?.pros) || '', cons: clean(o?.cons) || '' }))
          .filter((o) => o.label),
        chosen: clean(data.chosen) || '',
        rationale: clean(data.rationale) || '',
        reviewOn,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
      };
      store.update(
        (draft) => {
          draft.decisions.push(decision);
        },
        { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: `Decision logged: ${title.slice(0, 70)}` },
      );
      return { ok: true, id: decision.id };
    },

    updateDecision(decisionId, patch = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      const nextTitle = patch.title !== undefined ? clean(patch.title) || '' : current.title;
      if (!nextTitle) return fail('Name the decision.', 'title');
      const nextDate = patch.date !== undefined ? (patch.date || '') : current.date;
      if (!isCalendarDay(nextDate)) return fail('Choose a valid decision date.', 'date');
      if (current.reviewedOn && nextDate > current.reviewedOn) {
        return fail('The decision date cannot be after the date its outcome was reviewed.', 'date');
      }
      const nextReviewOn = patch.reviewOn !== undefined
        ? (patch.reviewOn ? String(patch.reviewOn).trim() : null)
        : current.reviewOn;
      if (nextReviewOn && !isCalendarDay(nextReviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      if (nextReviewOn && nextReviewOn < nextDate) {
        return fail('The review date cannot be before the decision date.', 'reviewOn');
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.title = nextTitle;
          if (patch.question !== undefined) decision.question = clean(patch.question) || '';
          if (patch.reversibility !== undefined) {
            decision.reversibility = patch.reversibility === 'irreversible' ? 'irreversible' : 'reversible';
          }
          decision.date = nextDate;
          if (patch.driver !== undefined) decision.driver = clean(patch.driver) || '';
          if (patch.approver !== undefined) decision.approver = clean(patch.approver) || '';
          if (patch.contributors !== undefined) decision.contributors = clean(patch.contributors) || '';
          if (patch.informed !== undefined) decision.informed = clean(patch.informed) || '';
          if (Array.isArray(patch.options)) {
            const existingByLabel = new Map(
              (decision.options || []).map((o) => [o.label.toLowerCase(), o]),
            );
            decision.options = patch.options
              .map((o) => {
                const label = clean(o?.label) || '';
                if (!label) return null;
                const prev = existingByLabel.get(label.toLowerCase());
                return {
                  id: o?.id || prev?.id || id('dopt'),
                  label,
                  pros: o?.pros !== undefined ? clean(o.pros) || '' : (prev?.pros || ''),
                  cons: o?.cons !== undefined ? clean(o.cons) || '' : (prev?.cons || ''),
                };
              })
              .filter(Boolean);
          }
          if (patch.rationale !== undefined) decision.rationale = clean(patch.rationale) || '';
          decision.reviewOn = nextReviewOn;
        },
        { type: 'decision.updated', entity: 'decision', entityId: decisionId, summary: `Decision updated: ${nextTitle.slice(0, 60)}` },
      );
      return { ok: true };
    },

    decideDecision(decisionId, { chosen, rationale = '', reviewOn } = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      const choice = clean(chosen) || '';
      if (!choice) return fail('Record what was decided.', 'chosen');
      let nextReviewOn = current.reviewOn;
      if (reviewOn !== undefined) {
        nextReviewOn = reviewOn ? String(reviewOn).trim() : null;
        if (nextReviewOn && !isCalendarDay(nextReviewOn)) {
          return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
        }
        if (nextReviewOn && nextReviewOn < current.date) {
          return fail('The review date cannot be before the decision date.', 'reviewOn');
        }
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.chosen = choice;
          decision.rationale = clean(rationale) || decision.rationale;
          if (reviewOn !== undefined) decision.reviewOn = nextReviewOn;
        },
        { type: 'decision.made', entity: 'decision', entityId: decisionId, summary: `Decided: ${choice.slice(0, 60)}` },
      );
      return { ok: true };
    },

    reviewDecision(decisionId, { outcome, outcomeNotes = '', reviewedOn } = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      if (!current.chosen) {
        return fail('Record what was decided before reviewing its outcome.', 'outcome');
      }
      if (!['good', 'mixed', 'bad'].includes(outcome)) return fail('Choose an outcome.', 'outcome');
      const revDay = reviewedOn ? String(reviewedOn).trim() : today();
      if (!isCalendarDay(revDay) || revDay > today()) {
        return fail('Choose a valid review date, not in the future.', 'reviewedOn');
      }
      if (revDay < current.date) {
        return fail('An outcome review cannot predate the decision itself.', 'reviewedOn');
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.outcome = outcome;
          decision.outcomeNotes = clean(outcomeNotes) || '';
          decision.reviewedOn = revDay;
        },
        { type: 'decision.reviewed', entity: 'decision', entityId: decisionId, summary: `Decision reviewed (${outcome}): ${current.title.slice(0, 50)}` },
      );
      return { ok: true };
    },

    /* ------------------------------------------------------------ recognition */
    addRecognition(data) {
      if (!personExists(data.personId)) return fail('Choose who you are recognising.', 'personId');
      const what = clean(data.what) || '';
      if (!what) return fail('Say what they did.', 'what');
      const entry = {
        ...append(null, 'rec'),
        personId: data.personId,
        what,
        values: (data.values || []).map((v) => clean(v)).filter(Boolean),
        visibility: data.visibility === 'private' ? 'private' : 'public',
        date: data.date || today(),
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          draft.recognition.push(entry);
        },
        { type: 'recognition.created', entity: 'recognition', entityId: entry.id, summary: `Recognised ${person.name}` },
      );
      return { ok: true, id: entry.id };
    },

    /* ------------------------------------------------------------ readiness */
    setReadiness(data) {
      if (!personExists(data.personId)) return fail('Choose a person.', 'personId');
      const seat = clean(data.seat)?.slice(0, 160) || '';
      if (!seat) return fail('Name the seat being planned for.', 'seat');
      const rating = ['ready-now', 'ready-later', 'not-ready'].includes(data.rating) ? data.rating : 'not-ready';
      const hasNotes = data.notes !== undefined;
      const notes = hasNotes ? (clean(data.notes) || '').slice(0, 1200) : '';
      store.update(
        (draft) => {
          const existing = draft.readiness.find((r) => r.personId === data.personId && r.seat === seat);
          if (existing) {
            existing.rating = rating;
            if (hasNotes) existing.notes = notes;
            existing.updatedAt = stamp();
          } else {
            draft.readiness.push({ id: id('rd'), personId: data.personId, seat, rating, notes, updatedAt: stamp() });
          }
        },
        { type: 'readiness.set', entity: 'readiness', entityId: data.personId, summary: `Readiness set: ${seat} → ${rating}` },
      );
      return { ok: true };
    },

    /* --------------------------------------------------- performance reviews */
    createReview(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      if (!validPeriod(data.periodStart, data.periodEnd)) return fail('Choose a valid period with the start on or before the end.', 'periodStart');
      const duplicate = (store.state.reviews || []).find((review) =>
        review.personId === data.personId && review.periodStart === data.periodStart && review.periodEnd === data.periodEnd,
      );
      if (duplicate) return fail('A review for this person and exact period already exists.', 'periodStart');
      const person = store.state.people.find((p) => p.id === data.personId);
      const review = {
        id: id('review'),
        personId: data.personId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        status: 'draft',
        selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
        selfReflectionRecordedAt: null,
        manager: { achievements: '', development: '', nextSteps: '', rating: '' },
        evidence: buildReviewEvidence(store.state, data.personId, data.periodStart, data.periodEnd),
        evidenceCapturedAt: stamp(),
        createdAt: stamp(),
        updatedAt: stamp(),
        completedAt: null,
      };
      store.update(
        (draft) => {
          draft.reviews.push(review);
        },
        { type: 'review.created', entity: 'review', entityId: review.id, summary: `Performance review started for ${person.name} (${review.periodStart} to ${review.periodEnd})` },
      );
      return { ok: true, id: review.id, evidenceCount: review.evidence.length };
    },

    updateReflection(reviewId, patch) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('Reopen the completed review before editing it.');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          for (const key of ['achievements', 'challenges', 'growth', 'support']) {
            if (patch[key] !== undefined) target.selfReflection[key] = clean(patch[key]) || '';
          }
          target.selfReflectionRecordedAt = Object.values(target.selfReflection).some((value) => value.trim()) ? stamp() : null;
          target.updatedAt = stamp();
        },
        { type: 'review.reflection.updated', entity: 'review', entityId: reviewId, summary: 'Employee self-reflection recorded' },
      );
      return { ok: true };
    },

    updateAssessment(reviewId, patch) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('Reopen the completed review before editing it.');
      if (patch.rating && !REVIEW_RATINGS.includes(patch.rating)) return fail('Choose a valid rating, or leave the review unrated.', 'rating');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          for (const key of ['achievements', 'development', 'nextSteps']) {
            if (patch[key] !== undefined) target.manager[key] = clean(patch[key]) || '';
          }
          if (patch.rating !== undefined) target.manager.rating = patch.rating || '';
          target.updatedAt = stamp();
        },
        { type: 'review.assessment.updated', entity: 'review', entityId: reviewId, summary: 'Manager assessment updated' },
      );
      return { ok: true };
    },

    refreshReviewEvidence(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('A completed review keeps its evidence snapshot. Reopen it to refresh.');
      const evidence = buildReviewEvidence(store.state, review.personId, review.periodStart, review.periodEnd);
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.evidence = evidence;
          target.evidenceCapturedAt = stamp();
          target.updatedAt = stamp();
        },
        { type: 'review.evidence.refreshed', entity: 'review', entityId: reviewId, summary: `Review evidence refreshed (${evidence.length} source records)` },
      );
      return { ok: true, evidenceCount: evidence.length };
    },

    completeReview(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('This review is already complete.');
      // Completion always recaptures, so a record added after the last manual
      // refresh cannot be silently omitted from the frozen packet.
      const evidence = buildReviewEvidence(store.state, review.personId, review.periodStart, review.periodEnd);
      const candidate = { ...review, evidence };
      const readiness = reviewReadiness(candidate, evidence);
      if (!readiness.canComplete) {
        return fail(`Before completing: ${readiness.missing.map((check) => check.label).join('; ')}.`);
      }
      const warnings = calibrateReview(candidate, evidence);
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.evidence = evidence;
          target.evidenceCapturedAt = stamp();
          target.status = 'complete';
          target.completedAt = stamp();
          target.updatedAt = stamp();
        },
        {
          type: 'review.completed', entity: 'review', entityId: reviewId,
          summary: `Performance review completed (${evidence.length} source records${warnings.length ? `; ${warnings.map((w) => w.id).join(', ')} acknowledged` : '; no calibration warnings'})`,
        },
      );
      return { ok: true, warnings, evidenceCount: evidence.length };
    },

    reopenReview(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'complete') return fail('This review is already a draft.');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.status = 'draft';
          target.completedAt = null;
          target.updatedAt = stamp();
        },
        { type: 'review.reopened', entity: 'review', entityId: reviewId, summary: 'Performance review reopened for correction' },
      );
      return { ok: true };
    },

    /* -------------------------------------------------- onboarding 30-60-90 */
    createOnboardingPlan(data = {}) {
      const person = store.state.people.find((p) => p.id === data.personId);
      if (!person) return fail('Choose the team member this 30-60-90 plan is for.', 'personId');
      if (person.status === 'archived') return fail('Restore this person before starting a 30-60-90 plan.', 'personId');

      const kind = data.kind === undefined ? 'new-hire' : clean(data.kind);
      if (!ONBOARDING_KINDS.includes(kind)) {
        return fail('Choose whether this is new-joiner onboarding, a role transition, or return to work.', 'kind');
      }
      const isTransition = kind === 'role-transition';
      const isReboarding = kind === 'reboarding';
      const isNonJoiner = isTransition || isReboarding;
      const labelRaw = clean(data.label);
      const label = typeof labelRaw === 'string' ? labelRaw : '';
      if (label.length > 160) return fail('Keep the plan label under 160 characters.', 'label');
      if (isTransition && !label) {
        return fail('Name the new role or scope (e.g. “Team Lead · Platform”) so this reads as the move it is.', 'label');
      }

      const existingActive = (store.state.onboarding || []).find(
        (plan) => plan.personId === person.id && plan.status === 'active',
      );
      if (existingActive) {
        const existingKind = planKind(existingActive);
        const existingNoun = existingKind === 'new-hire'
          ? '30-60-90 onboarding plan'
          : `${planKindRecordNoun(existingKind)}${existingActive.label ? ` (“${existingActive.label}”)` : ''}`;
        return fail(`${person.name} already has an active ${existingNoun}. Complete that plan before starting another.`, 'personId');
      }

      // The anchor is the plan's own start, never a rewrite of the roster
      // record: a role transition or return-to-work plan defaults to today,
      // so a tenured person's plan is not silently anchored to the day they
      // joined the company years earlier.
      const startDate = data.startDate !== undefined && data.startDate !== ''
        ? clean(data.startDate)
        : isNonJoiner
          ? today()
          : (person.startDate || today());
      if (!isCalendarDay(startDate)) return fail('Choose a valid start date (YYYY-MM-DD).', 'startDate');
      if (isNonJoiner && person.startDate && startDate < person.startDate) {
        return fail(`A ${planKindNoun(kind)} plan cannot start before ${person.name} joined the team (${person.startDate}).`, 'startDate');
      }

      const buddyId = clean(data.buddyId) || null;
      if (buddyId) {
        if (buddyId === person.id) return fail('A person cannot be their own peer buddy.', 'buddyId');
        const buddy = store.state.people.find((p) => p.id === buddyId);
        if (!buddy || buddy.status === 'archived') return fail('Choose an active team member as the buddy, or leave blank.', 'buddyId');
      }
      const buddyName = (clean(data.buddyName) || '').slice(0, 120);
      const roleClarity = clean(data.roleClarity) || '';
      if (roleClarity.length > 2000) return fail('Keep role clarity under 2,000 characters.', 'roleClarity');
      const earlyWin = clean(data.earlyWin) || '';
      if (earlyWin.length > 2000) return fail('Keep the early win description under 2,000 characters.', 'earlyWin');

      const rawStakeholders = Array.isArray(data.stakeholders) ? data.stakeholders : [];
      const seenNames = new Set();
      const stakeholders = [];
      for (const item of rawStakeholders) {
        if (!item || typeof item !== 'object') continue;
        const name = (clean(item.name) || '').slice(0, 160);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        const met = item.met === true;
        stakeholders.push({
          id: id('onbs'),
          name,
          purpose: (clean(item.purpose) || '').slice(0, 300),
          met,
          metOn: met ? today() : null,
        });
      }

      const seedCheckpoints = Array.isArray(data.checkpoints)
        ? data.checkpoints
        : data.useTemplate === false
          ? []
          : starterCheckpointsForKind(kind, startDate);
      const checkpoints = [];
      for (const item of seedCheckpoints) {
        if (!item || typeof item !== 'object') continue;
        const title = (clean(item.title) || '').slice(0, 300);
        if (!title) continue;
        const horizon = ONBOARDING_HORIZONS.includes(Number(item.horizon)) ? Number(item.horizon) : 30;
        const category = ONBOARDING_CATEGORIES.includes(item.category) ? item.category : 'clarity';
        const due = item.due ? (isCalendarDay(item.due) ? item.due : null) : addDays(startDate, horizon);
        const done = item.done === true;
        checkpoints.push({
          id: id('onbc'),
          horizon,
          category,
          title,
          due,
          done,
          completedOn: done ? today() : null,
          notes: (clean(item.notes) || '').slice(0, 1000),
        });
      }

      const plan = {
        id: id('onb'),
        personId: person.id,
        kind,
        label,
        startDate,
        buddyId,
        buddyName,
        roleClarity,
        earlyWin,
        stakeholders,
        checkpoints,
        reviews: { 30: null, 60: null, 90: null },
        status: 'active',
        completedOn: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      };

      store.update(
        (draft) => {
          draft.onboarding.push(plan);
        },
        {
          type: 'onboarding.created',
          entity: 'onboarding',
          entityId: plan.id,
          summary: isTransition
            ? `Started role-transition 30-60-90 plan for ${person.name}: ${label}`
            : isReboarding
              ? `Started return-to-work 30-60-90 plan for ${person.name}${label ? `: ${label}` : ''}`
              : `Started 30-60-90 onboarding plan for ${person.name}`,
        },
      );
      if (store.isLocked) return fail('This workspace is encrypted and locked. Unlock it before making changes.');
      return { ok: true, id: plan.id };
    },

    updateOnboardingPlan(planId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before editing it.');

      let nextStartDate = plan.startDate;
      if (patch.startDate !== undefined) {
        const candidate = clean(patch.startDate);
        if (!isCalendarDay(candidate)) return fail('Choose a valid start date (YYYY-MM-DD).', 'startDate');
        for (const h of ONBOARDING_HORIZONS) {
          const heldOn = plan.reviews?.[h]?.heldOn;
          if (heldOn && heldOn < candidate) {
            return fail(`The start date cannot be after the recorded Day ${h} check-in (${heldOn}).`, 'startDate');
          }
        }
        nextStartDate = candidate;
      }

      let nextBuddyId = plan.buddyId;
      if (patch.buddyId !== undefined) {
        const candidate = clean(patch.buddyId) || null;
        if (candidate) {
          if (candidate === plan.personId) return fail('A person cannot be their own peer buddy.', 'buddyId');
          const buddy = store.state.people.find((p) => p.id === candidate);
          if (!buddy || buddy.status === 'archived') return fail('Choose an active team member as the buddy, or leave blank.', 'buddyId');
        }
        nextBuddyId = candidate;
      }

      if (patch.roleClarity !== undefined && String(clean(patch.roleClarity) || '').length > 2000) {
        return fail('Keep role clarity under 2,000 characters.', 'roleClarity');
      }
      if (patch.earlyWin !== undefined && String(clean(patch.earlyWin) || '').length > 2000) {
        return fail('Keep the early win description under 2,000 characters.', 'earlyWin');
      }

      // Kind and label can be corrected after the fact (e.g. a plan created
      // as onboarding before role transitions or re-boarding existed). The
      // checkpoints, check-ins and history are untouched — only framing changes.
      let nextKind = planKind(plan);
      if (patch.kind !== undefined) {
        const candidate = clean(patch.kind);
        if (!ONBOARDING_KINDS.includes(candidate)) {
          return fail('Choose whether this is new-joiner onboarding, a role transition, or return to work.', 'kind');
        }
        nextKind = candidate;
      }
      let nextLabel = plan.label || '';
      if (patch.label !== undefined) {
        const candidate = clean(patch.label);
        nextLabel = typeof candidate === 'string' ? candidate : '';
      }
      if (nextLabel.length > 160) return fail('Keep the plan label under 160 characters.', 'label');
      if (nextKind === 'role-transition' && !nextLabel) {
        return fail('Name the new role or scope (e.g. “Team Lead · Platform”) so this reads as the move it is.', 'label');
      }

      const person = store.state.people.find((p) => p.id === plan.personId);
      if ((nextKind === 'role-transition' || nextKind === 'reboarding') && person?.startDate && nextStartDate < person.startDate) {
        return fail(`A ${planKindNoun(nextKind)} plan cannot start before ${person.name} joined the team (${person.startDate}).`, 'startDate');
      }
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.kind = nextKind;
          target.label = nextLabel;
          target.startDate = nextStartDate;
          target.buddyId = nextBuddyId;
          if (patch.buddyName !== undefined) target.buddyName = (clean(patch.buddyName) || '').slice(0, 120);
          if (patch.roleClarity !== undefined) target.roleClarity = clean(patch.roleClarity) || '';
          if (patch.earlyWin !== undefined) target.earlyWin = clean(patch.earlyWin) || '';
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.updated',
          entity: 'onboarding',
          entityId: planId,
          summary: `Updated 30-60-90 ${nextKind === 'role-transition' ? 'role-transition' : planKindNoun(nextKind)} scaffolding${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    addOnboardingCheckpoint(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before adding checkpoints.');
      const title = clean(input.title) || '';
      if (!title) return fail('Describe the checkpoint so both of you know when it is done.', 'title');
      if (title.length > 300) return fail('Keep the checkpoint title under 300 characters.', 'title');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day horizon.', 'horizon');
      const category = ONBOARDING_CATEGORIES.includes(input.category) ? input.category : 'clarity';
      let due = addDays(plan.startDate, horizon);
      if (input.due !== undefined && input.due !== null && input.due !== '') {
        if (!isCalendarDay(input.due)) return fail('Choose a valid due date (YYYY-MM-DD).', 'due');
        due = input.due;
      }
      const notes = clean(input.notes) || '';
      if (notes.length > 1000) return fail('Keep checkpoint notes under 1,000 characters.', 'notes');

      const cp = {
        id: id('onbc'),
        horizon,
        category,
        title,
        due,
        done: false,
        completedOn: null,
        notes,
      };
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.checkpoints.push(cp);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.added',
          entity: 'onboarding',
          entityId: planId,
          summary: `Added Day ${horizon} 30-60-90 checkpoint: ${title}`,
        },
      );
      return { ok: true, id: cp.id };
    },

    toggleOnboardingCheckpoint(planId, checkpointId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before changing checkpoints.');
      const existing = (plan.checkpoints || []).find((c) => c.id === checkpointId);
      if (!existing) return fail('That checkpoint no longer exists.');
      if (patch.notes !== undefined && String(clean(patch.notes) || '').length > 1000) {
        return fail('Keep checkpoint notes under 1,000 characters.', 'notes');
      }
      const nextDone = typeof patch.done === 'boolean' ? patch.done : !existing.done;
      let completedOn = null;
      if (nextDone) {
        if (patch.completedOn !== undefined && patch.completedOn !== null && patch.completedOn !== '') {
          if (!isCalendarDay(patch.completedOn)) return fail('Choose a valid completion date.', 'completedOn');
          if (patch.completedOn > today()) return fail('Completion date cannot be in the future.', 'completedOn');
          completedOn = patch.completedOn;
        } else {
          completedOn = today();
        }
      }
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          const cp = target?.checkpoints.find((c) => c.id === checkpointId);
          if (!cp) return;
          cp.done = nextDone;
          cp.completedOn = completedOn;
          if (patch.notes !== undefined) cp.notes = clean(patch.notes) || '';
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.toggled',
          entity: 'onboarding',
          entityId: planId,
          summary: `${nextDone ? 'Completed' : 'Reopened'} Day ${existing.horizon} checkpoint: ${existing.title}`,
        },
      );
      return { ok: true, done: nextDone };
    },

    removeOnboardingCheckpoint(planId, checkpointId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before removing checkpoints.');
      const existing = (plan.checkpoints || []).find((c) => c.id === checkpointId);
      if (!existing) return fail('That checkpoint no longer exists.');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.checkpoints = target.checkpoints.filter((c) => c.id !== checkpointId);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.removed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Removed 30-60-90 checkpoint: ${existing.title}`,
        },
      );
      return { ok: true };
    },

    addOnboardingStakeholder(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before editing introductions.');
      const name = clean(input.name) || '';
      if (!name) return fail('Name the person or team to introduce.', 'name');
      if (name.length > 160) return fail('Keep the stakeholder name under 160 characters.', 'name');
      const duplicate = (plan.stakeholders || []).some((s) => s.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return fail('That stakeholder is already on the introduction list.', 'name');
      const purpose = clean(input.purpose) || '';
      if (purpose.length > 300) return fail('Keep the purpose under 300 characters.', 'purpose');
      const met = input.met === true;
      const entry = {
        id: id('onbs'),
        name,
        purpose,
        met,
        metOn: met ? today() : null,
      };
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.stakeholders.push(entry);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.added',
          entity: 'onboarding',
          entityId: planId,
          summary: `Added 30-60-90 introduction: ${name}`,
        },
      );
      return { ok: true, id: entry.id };
    },

    toggleOnboardingStakeholder(planId, stakeholderId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before changing introductions.');
      const existing = (plan.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder entry no longer exists.');
      const nextMet = typeof patch.met === 'boolean' ? patch.met : !existing.met;
      const metOn = nextMet ? today() : null;
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          const item = target?.stakeholders.find((s) => s.id === stakeholderId);
          if (!item) return;
          item.met = nextMet;
          item.metOn = metOn;
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.toggled',
          entity: 'onboarding',
          entityId: planId,
          summary: `${nextMet ? 'Marked introduction met' : 'Marked introduction pending'}: ${existing.name}`,
        },
      );
      return { ok: true, met: nextMet };
    },

    removeOnboardingStakeholder(planId, stakeholderId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before removing introductions.');
      const existing = (plan.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder entry no longer exists.');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.stakeholders = target.stakeholders.filter((s) => s.id !== stakeholderId);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.removed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Removed 30-60-90 introduction: ${existing.name}`,
        },
      );
      return { ok: true };
    },

    recordOnboardingReview(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before updating check-ins.');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day check-in.', 'horizon');
      const heldOn = input.heldOn !== undefined && input.heldOn !== '' ? clean(input.heldOn) : today();
      if (!isCalendarDay(heldOn)) return fail('Choose a valid check-in date (YYYY-MM-DD).', 'heldOn');
      if (heldOn > today()) return fail('Check-in date cannot be in the future.', 'heldOn');
      if (heldOn < plan.startDate) return fail('Check-in date cannot precede the plan start date.', 'heldOn');
      const summary = clean(input.summary) || '';
      if (!summary) return fail('Record what is clear and working from the conversation.', 'summary');
      if (summary.length > 2000) return fail('Keep the check-in summary under 2,000 characters.', 'summary');
      const blockers = clean(input.blockers) || '';
      if (blockers.length > 2000) return fail('Keep blockers and support notes under 2,000 characters.', 'blockers');

      const person = store.state.people.find((p) => p.id === plan.personId);
      const checkinId = plan.reviews?.[horizon]?.id || id('onbr');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.reviews[horizon] = { id: checkinId, heldOn, summary, blockers };
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.review.recorded',
          entity: 'onboarding',
          entityId: planId,
          summary: `Logged Day ${horizon} ${plan.kind === 'role-transition' ? 'role-transition' : planKindNoun(plan)} check-in${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true, id: checkinId };
    },

    addManagerSupportCommitment(input = {}) {
      const plan = onboardingById(input.planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day check-in.', 'horizon');
      const checkin = plan.reviews?.[horizon];
      const checkinId = clean(input.checkinId) || '';
      if (!checkin?.heldOn || !checkin.id || checkin.id !== checkinId) {
        return fail('That recorded check-in could not be verified. Reload the plan and try again.', 'checkinId');
      }
      const text = clean(input.text) || '';
      if (!text) return fail('Describe the specific manager action you are committing to.', 'text');
      if (text.length > 300) return fail('Keep the manager follow-up under 300 characters.', 'text');
      const due = clean(input.due) || '';
      if (!isCalendarDay(due)) return fail('Choose a valid due date (YYYY-MM-DD).', 'due');
      if (due < checkin.heldOn) return fail('The due date cannot be before the source check-in.', 'due');
      if (due < today()) return fail('Choose today or a future date for this new commitment.', 'due');
      const person = store.state.people.find((p) => p.id === plan.personId);
      const createdAt = stamp();
      const commitment = {
        id: id('msup'),
        personId: plan.personId,
        text,
        due,
        owner: 'leader',
        sourcePlanId: plan.id,
        sourceCheckinId: checkin.id,
        sourceHorizon: horizon,
        sourceHeldOn: checkin.heldOn,
        addedOn: today(),
        status: 'open',
        completedOn: null,
        completedInMeetingId: null,
        droppedOn: null,
        droppedReason: '',
        droppedInMeetingId: null,
        carriedFromId: null,
        carriedFromMeetingId: null,
        carriedToId: null,
        carriedOn: null,
        carriedInMeetingId: null,
        createdAt,
        updatedAt: createdAt,
      };
      store.update(
        (draft) => { draft.managerSupport.push(commitment); },
        {
          type: 'manager-support.created',
          entity: 'managerSupport',
          entityId: commitment.id,
          summary: `Added manager-owned Day ${horizon} follow-up${person ? ` for ${person.name}` : ''}: ${text}`,
        },
      );
      return { ok: true, id: commitment.id };
    },

    toggleManagerSupportCommitment(commitmentId, patch = {}) {
      const existing = store.state.managerSupport.find((record) => record.id === commitmentId);
      if (!existing) return fail('That manager follow-up no longer exists.');
      if (!['open', 'done'].includes(existing.status)) {
        return fail('A dropped or carried commitment can only be changed in its follow-up history.');
      }
      const done = typeof patch.done === 'boolean' ? patch.done : existing.status !== 'done';
      if (done && patch.completedOn && !isCalendarDay(patch.completedOn)) {
        return fail('Choose a valid completion date.', 'completedOn');
      }
      const completedOn = done ? (patch.completedOn || today()) : null;
      if (completedOn && completedOn > today()) return fail('Completion date cannot be in the future.', 'completedOn');
      store.update(
        (draft) => {
          const target = draft.managerSupport.find((record) => record.id === commitmentId);
          if (!target || !['open', 'done'].includes(target.status)) return;
          target.status = done ? 'done' : 'open';
          target.completedOn = completedOn;
          // Board completion is a manager report, not proof that a 1:1 confirmed it.
          target.completedInMeetingId = null;
          target.updatedAt = stamp();
        },
        {
          type: 'manager-support.toggled',
          entity: 'managerSupport',
          entityId: commitmentId,
          summary: `${done ? 'Completed' : 'Reopened'} manager-owned follow-up: ${existing.text}`,
        },
      );
      return { ok: true, done };
    },

    completeOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status === 'completed') return fail('This 30-60-90 plan is already complete.');
      if (!plan.reviews?.[90]?.heldOn) {
        return fail(`Record the Day 90 check-in conversation before marking this ${planKindNoun(plan)} complete.`);
      }
      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.status = 'completed';
          target.completedOn = today();
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.completed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Completed ${plan.kind === 'role-transition' ? 'role-transition' : plan.kind === 'reboarding' ? 're-boarding' : '30-60-90 onboarding'} plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    reopenOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'completed') return fail('This 30-60-90 plan is already active.');
      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.status = 'active';
          target.completedOn = null;
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.reopened',
          entity: 'onboarding',
          entityId: planId,
          summary: `Reopened ${plan.kind === 'role-transition' ? 'role-transition' : plan.kind === 'reboarding' ? 're-boarding' : '30-60-90 onboarding'} plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    /* --------------------------- operational cases & cross-module rules */
    addCase(data = {}) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the operational case, incident, or initiative.', 'title');
      const kind = data.kind || 'risk';
      if (!CASE_KINDS.includes(kind)) return fail('Choose a valid case type.', 'kind');
      const status = data.status || 'open';
      if (!CASE_STATUSES.includes(status)) return fail('Choose a valid case status.', 'status');

      const openedOn = data.openedOn || today();
      if (!isCalendarDay(openedOn)) return fail('Choose a valid opened date.', 'openedOn');
      if (openedOn > today()) return fail('A case cannot be opened in the future.', 'openedOn');

      const defaultReviewDays = store.state.settings?.caseReviewDays ?? 14;
      const reviewOn = data.reviewOn !== undefined
        ? (data.reviewOn ? String(data.reviewOn).trim() : null)
        : addDays(openedOn, defaultReviewDays);
      if (reviewOn && !isCalendarDay(reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      if (reviewOn && reviewOn < openedOn) return fail('The review date cannot be before the opened date.', 'reviewOn');

      const ownerId = clean(data.ownerId) || null;
      if (ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
        if (owner.status === 'archived') return fail('Restore this person before assigning a new operational case to them.', 'ownerId');
      }

      const linkedGoalId = clean(data.linkedGoalId) || null;
      if (linkedGoalId && !(store.state.goals || []).some((g) => g.id === linkedGoalId)) {
        return fail('Choose an existing goal to link, or leave unlinked.', 'linkedGoalId');
      }

      const involvedPersonIds = [
        ...new Set(
          (Array.isArray(data.involvedPersonIds) ? data.involvedPersonIds : [])
            .map((pid) => clean(pid))
            .filter((pid) => pid && store.state.people.some((p) => p.id === pid)),
        ),
      ];

      const rawFmea = data.fmea || {};
      const parseRating = (val, fallback, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: fallback };
        const n = Number(val);
        if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
          return fail(`Enter a whole rating from 1 to 10 for ${fieldName}.`, fieldName);
        }
        return { ok: true, value: Math.round(n) };
      };
      const sev = parseRating(rawFmea.severity, 5, 'severity');
      if (!sev.ok) return sev;
      const prob = parseRating(rawFmea.probability, 5, 'probability');
      if (!prob.ok) return prob;
      const det = parseRating(rawFmea.detectability, 5, 'detectability');
      if (!det.ok) return det;

      const rawFin = data.financial || {};
      const parseMoney = (val, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: 0 };
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) return fail('Financial and capacity estimates must be zero or positive.', fieldName);
        return { ok: true, value: Math.round(n * 100) / 100 };
      };
      const opt = parseMoney(rawFin.optimistic, 'optimistic');
      if (!opt.ok) return opt;
      const ml = parseMoney(rawFin.mostLikely, 'mostLikely');
      if (!ml.ok) return ml;
      const pess = parseMoney(rawFin.pessimistic, 'pessimistic');
      if (!pess.ok) return pess;
      if ((opt.value > 0 || ml.value > 0 || pess.value > 0) && (opt.value > ml.value || ml.value > pess.value)) {
        return fail('Keep financial PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'mostLikely');
      }
      const mitCost = parseMoney(rawFin.mitigationCost, 'mitigationCost');
      if (!mitCost.ok) return mitCost;

      const capO = parseMoney(rawFin.capacityDaysOptimistic, 'capacityDaysOptimistic');
      if (!capO.ok) return capO;
      const capM = parseMoney(rawFin.capacityDaysMostLikely, 'capacityDaysMostLikely');
      if (!capM.ok) return capM;
      const capP = parseMoney(rawFin.capacityDaysPessimistic, 'capacityDaysPessimistic');
      if (!capP.ok) return capP;
      if ((capO.value > 0 || capM.value > 0 || capP.value > 0) && (capO.value > capM.value || capM.value > capP.value)) {
        return fail('Keep capacity-day PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'capacityDaysMostLikely');
      }

      const rawRca = data.rca || {};
      const whys = (Array.isArray(rawRca.whys) ? rawRca.whys : [])
        .map((w) => (clean(w) || '').slice(0, 500))
        .filter(Boolean)
        .slice(0, 5);

      const stakeholders = [];
      for (const s of Array.isArray(data.stakeholders) ? data.stakeholders : []) {
        const sName = clean(s?.name) || '';
        if (!sName) continue;
        const pwr = Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3)));
        const intr = Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3)));
        const stance = STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral';
        const commsCadence = STAKEHOLDER_CADENCES.includes(s?.commsCadence) ? s.commsCadence : '';
        const nextCommsOn = s?.nextCommsOn ? String(s.nextCommsOn).trim() : null;
        if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
          return fail(`Choose a valid communication date for stakeholder ${sName}.`, 'stakeholders');
        }
        const lastCommsOn = s?.lastCommsOn ? String(s.lastCommsOn).trim() : null;
        if (lastCommsOn && (!isCalendarDay(lastCommsOn) || lastCommsOn > today())) {
          return fail(`Last communication date for ${sName} must be valid and not in the future.`, 'stakeholders');
        }
        stakeholders.push({
          id: clean(s?.id) || id('cstk'),
          name: sName.slice(0, 160),
          role: (clean(s?.role) || '').slice(0, 120),
          power: pwr,
          interest: intr,
          stance,
          commsCadence,
          lastCommsOn,
          nextCommsOn,
          keyMessage: (clean(s?.keyMessage) || '').slice(0, 600),
        });
      }

      const isClosed = status === 'resolved' || status === 'closed';
      const caseRecord = {
        ...append(null, 'case'),
        kind,
        status,
        title: title.slice(0, 200),
        summary: (clean(data.summary) || '').slice(0, 4000),
        ownerId,
        involvedPersonIds,
        linkedGoalId,
        openedOn,
        reviewOn,
        resolvedOn: isClosed ? today() : null,
        resolutionNotes: isClosed ? (clean(data.resolutionNotes) || '').slice(0, 4000) : '',
        fmea: {
          severity: sev.value,
          probability: prob.value,
          detectability: det.value,
          failureMode: (clean(rawFmea.failureMode) || '').slice(0, 600),
          effect: (clean(rawFmea.effect) || '').slice(0, 600),
          controls: (clean(rawFmea.controls) || '').slice(0, 600),
          residualSeverity: null,
          residualProbability: null,
          residualDetectability: null,
        },
        financial: {
          currency: (clean(rawFin.currency) || 'USD').toUpperCase().slice(0, 6),
          optimistic: opt.value,
          mostLikely: ml.value,
          pessimistic: pess.value,
          mitigationCost: mitCost.value,
          capacityDaysOptimistic: capO.value,
          capacityDaysMostLikely: capM.value,
          capacityDaysPessimistic: capP.value,
          opportunityCost: (clean(rawFin.opportunityCost) || '').slice(0, 600),
        },
        rca: {
          problemStatement: (clean(rawRca.problemStatement) || '').slice(0, 1000),
          whys,
          rootCause: (clean(rawRca.rootCause) || '').slice(0, 1000),
          systemicBarrier: (clean(rawRca.systemicBarrier) || '').slice(0, 1000),
          preventiveAction: (clean(rawRca.preventiveAction) || '').slice(0, 1000),
        },
        stakeholders,
        autoPropagate: data.autoPropagate !== false,
        updatedAt: stamp(),
      };

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.cases = Array.isArray(draft.cases) ? draft.cases : [];
          draft.links = Array.isArray(draft.links) ? draft.links : [];
          draft.cases.push(caseRecord);
          if (data._upstreamLink) {
            ensureEntityLink(
              draft,
              {
                sourceType: 'case',
                sourceId: caseRecord.id,
                targetType: data._upstreamLink.sourceType,
                targetId: data._upstreamLink.sourceId,
                relation: 'escalates-from',
                ruleId: 'RULE-ESC-01',
                summary: data._upstreamLink.summary || `Escalated from ${data._upstreamLink.sourceType}`,
              },
              { idFactory: id, todayStr: today(), nowIso: stamp() },
            );
          }
          propagations = propagateCaseEvent(draft, caseRecord, {
            now: clock(),
            idFactory: id,
            logEvent,
            options: data,
          });
        },
        {
          type: 'case.created',
          entity: 'case',
          entityId: caseRecord.id,
          summary: `Operational case registered (${kind}): ${caseRecord.title.slice(0, 70)}`,
        },
      );
      return { ok: true, id: caseRecord.id, propagations };
    },

    updateCase(caseId, patch = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');

      const title = patch.title !== undefined ? clean(patch.title) || '' : current.title;
      if (!title) return fail('Name the operational case, incident, or initiative.', 'title');
      const kind = patch.kind !== undefined ? patch.kind : current.kind;
      if (!CASE_KINDS.includes(kind)) return fail('Choose a valid case type.', 'kind');
      const status = patch.status !== undefined ? patch.status : current.status;
      if (!CASE_STATUSES.includes(status)) return fail('Choose a valid case status.', 'status');

      const openedOn = patch.openedOn !== undefined ? patch.openedOn : current.openedOn;
      if (!isCalendarDay(openedOn) || openedOn > today()) {
        return fail('Choose a valid opened date that is not in the future.', 'openedOn');
      }
      const reviewOn = patch.reviewOn !== undefined
        ? (patch.reviewOn ? String(patch.reviewOn).trim() : null)
        : current.reviewOn;
      if (reviewOn && !isCalendarDay(reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      if (reviewOn && reviewOn < openedOn) return fail('The review date cannot be before the opened date.', 'reviewOn');

      const ownerId = patch.ownerId !== undefined ? (clean(patch.ownerId) || null) : current.ownerId;
      if (ownerId && ownerId !== current.ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
        if (owner.status === 'archived') return fail('Restore this person before assigning an operational case to them.', 'ownerId');
      }

      const linkedGoalId = patch.linkedGoalId !== undefined ? (clean(patch.linkedGoalId) || null) : current.linkedGoalId;
      if (linkedGoalId && !(store.state.goals || []).some((g) => g.id === linkedGoalId)) {
        return fail('Choose an existing goal to link, or leave unlinked.', 'linkedGoalId');
      }

      const involvedPersonIds = patch.involvedPersonIds !== undefined
        ? [
            ...new Set(
              (Array.isArray(patch.involvedPersonIds) ? patch.involvedPersonIds : [])
                .map((pid) => clean(pid))
                .filter((pid) => pid && store.state.people.some((p) => p.id === pid)),
            ),
          ]
        : current.involvedPersonIds;

      const nextFmea = { ...current.fmea };
      if (patch.fmea) {
        for (const key of ['severity', 'probability', 'detectability']) {
          if (patch.fmea[key] !== undefined) {
            const n = Number(patch.fmea[key]);
            if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
              return fail(`Enter a whole rating from 1 to 10 for ${key}.`, key);
            }
            nextFmea[key] = Math.round(n);
          }
        }
        for (const key of ['failureMode', 'effect', 'controls']) {
          if (patch.fmea[key] !== undefined) nextFmea[key] = (clean(patch.fmea[key]) || '').slice(0, 600);
        }
        for (const key of ['residualSeverity', 'residualProbability', 'residualDetectability']) {
          if (patch.fmea[key] !== undefined) {
            if (patch.fmea[key] === null || patch.fmea[key] === '') {
              nextFmea[key] = null;
            } else {
              const n = Number(patch.fmea[key]);
              if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
                return fail(`Enter a whole residual rating from 1 to 10 for ${key}.`, key);
              }
              nextFmea[key] = Math.round(n);
            }
          }
        }
      }

      const nextFinancial = { ...current.financial };
      if (patch.financial) {
        if (patch.financial.currency !== undefined) {
          nextFinancial.currency = (clean(patch.financial.currency) || 'USD').toUpperCase().slice(0, 6);
        }
        for (const key of [
          'optimistic', 'mostLikely', 'pessimistic', 'mitigationCost',
          'capacityDaysOptimistic', 'capacityDaysMostLikely', 'capacityDaysPessimistic',
        ]) {
          if (patch.financial[key] !== undefined) {
            const raw = patch.financial[key];
            const n = raw === '' || raw === null ? 0 : Number(raw);
            if (!Number.isFinite(n) || n < 0) {
              return fail('Financial and capacity estimates must be zero or positive.', key);
            }
            nextFinancial[key] = Math.round(n * 100) / 100;
          }
        }
        if (patch.financial.opportunityCost !== undefined) {
          nextFinancial.opportunityCost = (clean(patch.financial.opportunityCost) || '').slice(0, 600);
        }
      }
      if (
        (nextFinancial.optimistic > 0 || nextFinancial.mostLikely > 0 || nextFinancial.pessimistic > 0) &&
        (nextFinancial.optimistic > nextFinancial.mostLikely || nextFinancial.mostLikely > nextFinancial.pessimistic)
      ) {
        return fail('Keep financial PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'mostLikely');
      }
      if (
        (nextFinancial.capacityDaysOptimistic > 0 || nextFinancial.capacityDaysMostLikely > 0 || nextFinancial.capacityDaysPessimistic > 0) &&
        (nextFinancial.capacityDaysOptimistic > nextFinancial.capacityDaysMostLikely || nextFinancial.capacityDaysMostLikely > nextFinancial.capacityDaysPessimistic)
      ) {
        return fail('Keep capacity-day PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'capacityDaysMostLikely');
      }

      const nextRca = { ...current.rca };
      if (patch.rca) {
        for (const key of ['problemStatement', 'rootCause', 'systemicBarrier', 'preventiveAction']) {
          if (patch.rca[key] !== undefined) nextRca[key] = (clean(patch.rca[key]) || '').slice(0, 1000);
        }
        if (Array.isArray(patch.rca.whys)) {
          nextRca.whys = patch.rca.whys
            .map((w) => (clean(w) || '').slice(0, 500))
            .filter(Boolean)
            .slice(0, 5);
        }
      }

      let nextStakeholders = current.stakeholders;
      if (Array.isArray(patch.stakeholders)) {
        nextStakeholders = [];
        for (const s of patch.stakeholders) {
          const sName = clean(s?.name) || '';
          if (!sName) continue;
          const nextCommsOn = s?.nextCommsOn ? String(s.nextCommsOn).trim() : null;
          if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
            return fail(`Choose a valid communication date for stakeholder ${sName}.`, 'stakeholders');
          }
          const lastCommsOn = s?.lastCommsOn ? String(s.lastCommsOn).trim() : null;
          if (lastCommsOn && (!isCalendarDay(lastCommsOn) || lastCommsOn > today())) {
            return fail(`Last communication date for ${sName} must be valid and not in the future.`, 'stakeholders');
          }
          nextStakeholders.push({
            id: clean(s?.id) || id('cstk'),
            name: sName.slice(0, 160),
            role: (clean(s?.role) || '').slice(0, 120),
            power: Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3))),
            interest: Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3))),
            stance: STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral',
            commsCadence: STAKEHOLDER_CADENCES.includes(s?.commsCadence) ? s.commsCadence : '',
            lastCommsOn,
            nextCommsOn,
            keyMessage: (clean(s?.keyMessage) || '').slice(0, 600),
          });
        }
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.title = title.slice(0, 200);
          target.kind = kind;
          target.status = status;
          if (patch.summary !== undefined) target.summary = (clean(patch.summary) || '').slice(0, 4000);
          target.ownerId = ownerId;
          target.involvedPersonIds = involvedPersonIds;
          target.linkedGoalId = linkedGoalId;
          target.openedOn = openedOn;
          target.reviewOn = reviewOn;
          if (status === 'resolved' || status === 'closed') {
            target.resolvedOn = target.resolvedOn || today();
            if (patch.resolutionNotes !== undefined) {
              target.resolutionNotes = (clean(patch.resolutionNotes) || '').slice(0, 4000);
            }
          } else {
            target.resolvedOn = null;
            target.resolutionNotes = '';
          }
          target.fmea = nextFmea;
          target.financial = nextFinancial;
          target.rca = nextRca;
          target.stakeholders = nextStakeholders;
          if (patch.autoPropagate !== undefined) target.autoPropagate = Boolean(patch.autoPropagate);
          target.updatedAt = stamp();

          propagations = propagateCaseEvent(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
            options: patch,
          });
        },
        {
          type: 'case.updated',
          entity: 'case',
          entityId: caseId,
          summary: `Operational case updated: ${title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    syncCaseAutomations(caseId, options = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (!isCaseOpen(current)) return fail('Reopen this case before running cross-module automation.');
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.autoPropagate = true;
          propagations = propagateCaseEvent(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
            options,
          });
          target.updatedAt = stamp();
        },
        {
          type: 'case.synced',
          entity: 'case',
          entityId: caseId,
          summary: `Synced cross-module rules on case “${current.title.slice(0, 60)}” (${propagations.length} action${propagations.length === 1 ? '' : 's'})`,
        },
      );
      return { ok: true, propagations };
    },

    logCaseStakeholderComms(caseId, stakeholderId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      const stakeholder = (current.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!stakeholder) return fail('That stakeholder entry no longer exists.');

      const date = data.date || today();
      if (!isCalendarDay(date) || date > today()) {
        return fail('Choose a valid communication date that is not in the future.', 'date');
      }
      if (date < current.openedOn) {
        return fail('Communication cannot predate the case opened date.', 'date');
      }
      const nextCommsOn = data.nextCommsOn !== undefined
        ? (data.nextCommsOn ? String(data.nextCommsOn).trim() : null)
        : stakeholder.nextCommsOn;
      if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
        return fail('Choose a valid next communication date, or leave it blank.', 'nextCommsOn');
      }
      if (nextCommsOn && nextCommsOn < date) {
        return fail('The next communication checkpoint cannot be before this brief.', 'nextCommsOn');
      }
      const stance = data.stance !== undefined
        ? (STAKEHOLDER_STANCES.includes(data.stance) ? data.stance : null)
        : stakeholder.stance;
      if (!stance) return fail('Choose a valid coalition stance.', 'stance');
      const keyMessage = data.keyMessage !== undefined
        ? (clean(data.keyMessage) || '').slice(0, 600)
        : stakeholder.keyMessage;
      if (!keyMessage) return fail('Record a short summary of what was aligned or raised.', 'keyMessage');

      store.update(
        (draft) => {
          const targetCase = (draft.cases || []).find((c) => c.id === caseId);
          const targetStk = targetCase?.stakeholders?.find((s) => s.id === stakeholderId);
          if (!targetStk) return;
          targetStk.lastCommsOn = date;
          targetStk.nextCommsOn = nextCommsOn;
          targetStk.stance = stance;
          targetStk.keyMessage = keyMessage;
          if (data.commsCadence && STAKEHOLDER_CADENCES.includes(data.commsCadence)) {
            targetStk.commsCadence = data.commsCadence;
          }
          targetCase.updatedAt = stamp();
        },
        {
          type: 'case.stakeholder.comms',
          entity: 'case',
          entityId: caseId,
          summary: `Logged stakeholder brief with ${stakeholder.name} (${stance}) on “${current.title.slice(0, 50)}”`,
        },
      );
      return { ok: true };
    },

    resolveCase(caseId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (!isCaseOpen(current)) return fail('This operational case is already resolved.');

      const resolvedOn = data.resolvedOn || today();
      if (!isCalendarDay(resolvedOn) || resolvedOn > today()) {
        return fail('Choose a valid resolution date that is not in the future.', 'resolvedOn');
      }
      if (resolvedOn < current.openedOn) {
        return fail('Resolution date cannot predate the opened date.', 'resolvedOn');
      }
      const resolutionNotes = clean(data.resolutionNotes) || '';
      if (resolutionNotes.length < 5) {
        return fail('Record what resolved the case and which systemic guardrail holds it.', 'resolutionNotes');
      }
      const terminalStatus = data.status === 'closed' ? 'closed' : 'resolved';

      const parseResidual = (val, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: null };
        const n = Number(val);
        if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
          return fail(`Enter a whole residual rating from 1 to 10 for ${fieldName}, or leave blank.`, fieldName);
        }
        return { ok: true, value: Math.round(n) };
      };
      const resS = parseResidual(data.residualSeverity, 'residualSeverity');
      if (!resS.ok) return resS;
      const resP = parseResidual(data.residualProbability, 'residualProbability');
      if (!resP.ok) return resP;
      const resD = parseResidual(data.residualDetectability, 'residualDetectability');
      if (!resD.ok) return resD;
      const anyResidual = resS.value !== null || resP.value !== null || resD.value !== null;
      const allResidual = resS.value !== null && resP.value !== null && resD.value !== null;
      if (anyResidual && !allResidual) {
        return fail('Record all three residual FMEA scores (Severity, Probability, Detection) together, or leave all three blank.', 'residualSeverity');
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.status = terminalStatus;
          target.resolvedOn = resolvedOn;
          target.resolutionNotes = resolutionNotes.slice(0, 4000);
          if (allResidual) {
            target.fmea.residualSeverity = resS.value;
            target.fmea.residualProbability = resP.value;
            target.fmea.residualDetectability = resD.value;
          }
          if (data.systemicBarrier !== undefined && clean(data.systemicBarrier)) {
            target.rca.systemicBarrier = clean(data.systemicBarrier).slice(0, 1000);
          }
          target.updatedAt = stamp();
          propagations = propagateCaseResolution(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'case.resolved',
          entity: 'case',
          entityId: caseId,
          summary: `Operational case ${terminalStatus}: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    reopenCase(caseId) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (isCaseOpen(current)) return fail('This operational case is already open.');
      store.update(
        (draft) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.status = 'open';
          target.resolvedOn = null;
          target.updatedAt = stamp();
        },
        {
          type: 'case.reopened',
          entity: 'case',
          entityId: caseId,
          summary: `Reopened operational case: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    deleteCase(caseId) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      store.update(
        (draft) => {
          draft.cases = (draft.cases || []).filter((c) => c.id !== caseId);
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'case' && l.sourceId === caseId) || (l.targetType === 'case' && l.targetId === caseId)),
          );
        },
        {
          type: 'case.deleted',
          entity: 'case',
          entityId: caseId,
          summary: `Deleted operational case: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    linkCaseEntity(caseId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      const targetType = clean(data.targetType) || '';
      const targetId = clean(data.targetId) || '';
      const relation = clean(data.relation) || '';
      if (FORBIDDEN_LINK_TYPES.includes(targetType)) {
        return fail('Confidential conflict records and anonymous pulse responses can never be linked to operational cases.', 'targetType');
      }
      if (!LINK_ENTITY_TYPES.includes(targetType)) return fail('Choose a valid module type to link.', 'targetType');
      if (!LINK_RELATIONS.includes(relation)) return fail('Choose a valid relationship type.', 'relation');
      if (targetType === 'case' && targetId === caseId) return fail('A case cannot link to itself.', 'targetId');
      const resolved = resolveLinkedEntity(store.state, targetType, targetId);
      if (!resolved) return fail('Choose an existing record to link.', 'targetId');

      let created = false;
      let link = null;
      store.update(
        (draft) => {
          const res = ensureEntityLink(
            draft,
            {
              sourceType: 'case',
              sourceId: caseId,
              targetType,
              targetId,
              relation,
              ruleId: 'MANUAL',
              summary: (clean(data.summary) || `${relation}: ${resolved.title}`).slice(0, 300),
            },
            { idFactory: id, todayStr: today(), nowIso: stamp() },
          );
          created = res.created;
          link = res.link;
        },
        {
          type: 'case.linked',
          entity: 'case',
          entityId: caseId,
          summary: `Linked ${targetType} “${resolved.title.slice(0, 50)}” (${relation}) to case “${current.title.slice(0, 45)}”`,
        },
      );
      return { ok: true, created, id: link?.id || null };
    },

    escalateToCase({ sourceType, sourceId, ...overrides } = {}) {
      if (FORBIDDEN_LINK_TYPES.includes(sourceType)) {
        return fail('Confidential conflict records and anonymous pulses cannot be escalated into general operational cases.');
      }
      const existingOpenLink = (store.state.links || []).find((l) => {
        if (l.sourceType !== 'case' || l.targetType !== sourceType || l.targetId !== sourceId) return false;
        const linkedCase = (store.state.cases || []).find((c) => c.id === l.sourceId);
        return Boolean(linkedCase && isCaseOpen(linkedCase));
      });
      if (existingOpenLink) {
        return {
          ok: false,
          existingCaseId: existingOpenLink.sourceId,
          error: 'An open operational case is already linked to this record.',
        };
      }

      const built = buildCaseFromUpstreamEntity(store.state, {
        sourceType,
        sourceId,
        overrides,
        now: clock(),
      });
      if (!built.ok) return built;

      return api.addCase({
        ...built.payload,
        _upstreamLink: {
          sourceType,
          sourceId,
          summary: `Escalated from ${sourceType}`,
        },
      });
    },
  };
  return Object.fromEntries(Object.entries(api).map(([name, action]) => [name, (...args) =>
    store.writeBlockReason ? fail(store.writeBlockReason) : action(...args),
  ]));
}
