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
  normalizeTalkingPoints,
} from './core/schema.js';
import { buildReviewEvidence, calibrateReview, reviewReadiness, validPeriod } from './core/domain/reviews.js';
import { goalProgress } from './core/domain/goals.js';
import { createConflictActions } from './conflict-actions.js';
import { DELEGATION_AUTHORITY } from './core/domain/delegations.js';
import { defaultCheckpoints } from './core/domain/onboarding.js';
import { isOpenWill } from './core/domain/growth.js';
import { isOpenAction, OWNER_LABELS } from './core/domain/oneonone.js';

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
      carriedFromId: null,
      carriedToId: null,
      carriedInReviewId: null,
      ...extra,
    };
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
        const sourceMeeting = store.state.oneOnOnes.find((m) => m.id === item.meetingId);
        const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.actionId);
        if (!sourceMeeting || !sourceAction) return fail('That commitment no longer exists. Reload and try again.', 'reconciliations');
        if (sourceMeeting.personId !== person.id) return fail('A commitment can only be reconciled with the person it was agreed with.', 'reconciliations');
        if (sourceMeeting.date > date) return fail('A commitment cannot be settled in a conversation that happened before it was made.', 'date');
        if (!isOpenAction(sourceAction)) return fail(`"${sourceAction.text}" is already closed. Reload before logging this 1:1.`, 'reconciliations');
        const key = `${sourceMeeting.id}|${sourceAction.id}`;
        if (seen.has(key)) return fail('The same commitment was listed twice. Reload the form.', 'reconciliations');
        seen.add(key);
        if (outcome === 'still-open') continue;
        const due = item.due ? String(item.due) : null;
        if (outcome === 'carried') {
          if (due && !isCalendarDay(due)) return fail('Choose a valid due date for the carried commitment, or leave it blank.', 'reconciliations');
          if (due && due < date) return fail('A carried commitment cannot be due before the 1:1 that moved it.', 'reconciliations');
        }
        if (outcome === 'dropped' && clean(item.reason).length > 300) {
          return fail('Keep the reason for dropping a commitment under 300 characters.', 'reconciliations');
        }
        applied.push({ meeting: sourceMeeting, action: sourceAction, outcome, due, reason: clean(item.reason) || '' });
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

      const closedCount = applied.filter((item) => item.outcome === 'done').length;
      const carriedCount = applied.filter((item) => item.outcome === 'carried').length;
      const droppedCount = applied.filter((item) => item.outcome === 'dropped').length;
      const parts = [];
      if (closedCount) parts.push(`${closedCount} promise${closedCount === 1 ? '' : 's'} closed`);
      if (carriedCount) parts.push(`${carriedCount} carried forward`);
      if (droppedCount) parts.push(`${droppedCount} dropped`);

      store.update(
        (draft) => {
          draft.oneOnOnes.push(meeting);
          const live = draft.oneOnOnes.find((m) => m.id === meeting.id);
          for (const item of applied) {
            const sourceMeeting = draft.oneOnOnes.find((m) => m.id === item.meeting.id);
            const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.action.id);
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
      return { ok: true, id: meeting.id, closed: closedCount, carried: carriedCount, dropped: droppedCount };
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
      const confidence = CONFIDENCE.includes(data.confidence) ? data.confidence : 'on-track';
      const status = ['active', 'done', 'dropped'].includes(data.status) ? data.status : 'active';
      const goal = {
        ...append(null, 'goal'),
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
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, { status: 'done', completedOn, completionNote, updatedAt: stamp() });
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
      const goal = clean(data.goal) || '';
      if (!goal) return fail('A GROW plan starts with a goal.', 'goal');
      for (const action of Array.isArray(data.will) ? data.will : []) {
        if (action?.due && !isCalendarDay(action.due)) return fail('Choose a valid due date for the commitment, or leave it blank.', 'willDue');
      }
      if (data.reviewOn && !isCalendarDay(data.reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      const plan = {
        ...append(null, 'gp'),
        personId: data.personId,
        goal,
        reality: clean(data.reality) || '',
        options: (data.options || []).map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text),
        will: (data.will || [])
          .map((a) => newWillAction(data.personId, clean(a.text) || '', a.due || null))
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

    addWillAction(planId, text, due) {
      const value = clean(text);
      if (!value) return fail('Describe the commitment.', 'text');
      if (due && !isCalendarDay(due)) return fail('Choose a valid due date, or leave it blank.', 'due');
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed. Start a new one instead of adding commitments to history.');
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId);
          if (!target) return;
          target.will.push(newWillAction(target.personId, value, due || null));
        },
        { type: 'growth.will.added', entity: 'growthPlan', entityId: planId, summary: `Development action added: ${value.slice(0, 50)}` },
      );
      return { ok: true };
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
    addDecision(data) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the decision.', 'title');
      const decision = {
        ...append(null, 'dec'),
        title,
        question: clean(data.question) || '',
        date: data.date || today(),
        reversibility: data.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
        driver: clean(data.driver) || '',
        approver: clean(data.approver) || '',
        contributors: clean(data.contributors) || '',
        informed: clean(data.informed) || '',
        options: (data.options || [])
          .map((o) => ({ id: id('dopt'), label: clean(o.label) || '', pros: clean(o.pros) || '', cons: clean(o.cons) || '' }))
          .filter((o) => o.label),
        chosen: clean(data.chosen) || '',
        rationale: clean(data.rationale) || '',
        reviewOn: data.reviewOn || null,
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

    decideDecision(decisionId, { chosen, rationale = '' }) {
      const choice = clean(chosen) || '';
      if (!choice) return fail('Record what was decided.', 'chosen');
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.chosen = choice;
          decision.rationale = clean(rationale) || decision.rationale;
        },
        { type: 'decision.made', entity: 'decision', entityId: decisionId, summary: `Decided: ${choice.slice(0, 60)}` },
      );
      return { ok: true };
    },

    reviewDecision(decisionId, { outcome, outcomeNotes = '' }) {
      if (!['good', 'mixed', 'bad'].includes(outcome)) return fail('Choose an outcome.');
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.outcome = outcome;
          decision.outcomeNotes = clean(outcomeNotes) || '';
          decision.reviewedOn = today();
        },
        { type: 'decision.reviewed', entity: 'decision', entityId: decisionId, summary: `Decision reviewed: ${outcome}` },
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
      const seat = clean(data.seat) || '';
      if (!seat) return fail('Name the seat being planned for.', 'seat');
      const rating = ['ready-now', 'ready-later', 'not-ready'].includes(data.rating) ? data.rating : 'not-ready';
      store.update(
        (draft) => {
          const existing = draft.readiness.find((r) => r.personId === data.personId && r.seat === seat);
          if (existing) {
            existing.rating = rating;
            existing.updatedAt = stamp();
          } else {
            draft.readiness.push({ id: id('rd'), personId: data.personId, seat, rating, updatedAt: stamp() });
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
      if (!person) return fail('Choose the team member who is onboarding.', 'personId');
      if (person.status === 'archived') return fail('Restore this person before starting an onboarding plan.', 'personId');
      const existingActive = (store.state.onboarding || []).find(
        (plan) => plan.personId === person.id && plan.status === 'active',
      );
      if (existingActive) {
        return fail(`${person.name} already has an active 30-60-90 onboarding plan.`, 'personId');
      }

      const startDate = data.startDate !== undefined && data.startDate !== ''
        ? clean(data.startDate)
        : (person.startDate || today());
      if (!isCalendarDay(startDate)) return fail('Choose a valid start date (YYYY-MM-DD).', 'startDate');

      const buddyId = clean(data.buddyId) || null;
      if (buddyId) {
        if (buddyId === person.id) return fail('A person cannot be their own onboarding buddy.', 'buddyId');
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
          : defaultCheckpoints(startDate);
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
          summary: `Started 30-60-90 onboarding plan for ${person.name}`,
        },
      );
      if (store.isLocked) return fail('This workspace is encrypted and locked. Unlock it before making changes.');
      return { ok: true, id: plan.id };
    },

    updateOnboardingPlan(planId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before editing it.');

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
          if (candidate === plan.personId) return fail('A person cannot be their own onboarding buddy.', 'buddyId');
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

      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
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
          summary: `Updated 30-60-90 onboarding scaffolding${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    addOnboardingCheckpoint(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before adding checkpoints.');
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
          summary: `Added Day ${horizon} onboarding checkpoint: ${title}`,
        },
      );
      return { ok: true, id: cp.id };
    },

    toggleOnboardingCheckpoint(planId, checkpointId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before changing checkpoints.');
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
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before removing checkpoints.');
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
          summary: `Removed onboarding checkpoint: ${existing.title}`,
        },
      );
      return { ok: true };
    },

    addOnboardingStakeholder(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before editing introductions.');
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
          summary: `Added onboarding introduction: ${name}`,
        },
      );
      return { ok: true, id: entry.id };
    },

    toggleOnboardingStakeholder(planId, stakeholderId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before changing introductions.');
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
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before removing introductions.');
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
          summary: `Removed onboarding introduction: ${existing.name}`,
        },
      );
      return { ok: true };
    },

    recordOnboardingReview(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed onboarding plan before updating check-ins.');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day check-in.', 'horizon');
      const heldOn = input.heldOn !== undefined && input.heldOn !== '' ? clean(input.heldOn) : today();
      if (!isCalendarDay(heldOn)) return fail('Choose a valid check-in date (YYYY-MM-DD).', 'heldOn');
      if (heldOn > today()) return fail('Check-in date cannot be in the future.', 'heldOn');
      if (heldOn < plan.startDate) return fail('Check-in date cannot precede the onboarding start date.', 'heldOn');
      const summary = clean(input.summary) || '';
      if (!summary) return fail('Record what is clear and working from the conversation.', 'summary');
      if (summary.length > 2000) return fail('Keep the check-in summary under 2,000 characters.', 'summary');
      const blockers = clean(input.blockers) || '';
      if (blockers.length > 2000) return fail('Keep blockers and support notes under 2,000 characters.', 'blockers');

      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.reviews[horizon] = { heldOn, summary, blockers };
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.review.recorded',
          entity: 'onboarding',
          entityId: planId,
          summary: `Logged Day ${horizon} onboarding check-in${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    completeOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status === 'completed') return fail('This onboarding plan is already complete.');
      if (!plan.reviews?.[90]?.heldOn) {
        return fail('Record the Day 90 check-in conversation before marking onboarding complete.');
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
          summary: `Completed 30-60-90 onboarding plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    reopenOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That onboarding plan no longer exists.');
      if (plan.status !== 'completed') return fail('This onboarding plan is already active.');
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
          summary: `Reopened 30-60-90 onboarding plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },
  };
  return Object.fromEntries(Object.entries(api).map(([name, action]) => [name, (...args) =>
    store.writeBlockReason ? fail(store.writeBlockReason) : action(...args),
  ]));
}
