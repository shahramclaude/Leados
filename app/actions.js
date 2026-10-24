/**
 * app/actions.js — every mutation in the application.
 *
 * Views never touch the store directly. Each action validates its input,
 * returns `{ok:false, error}` instead of throwing, and records an event so the
 * audit trail explains what changed and when. No DOM access lives here, which
 * is what makes the write path testable.
 */

import { dayKey } from './core/time.js';
import { PULSE_DIMENSIONS } from './core/schema.js';

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function fail(error, field = null) {
  return { ok: false, error, field };
}

export function createApi(store, options = {}) {
  const id = options.idFactory || makeId;
  const clock = options.now || (() => new Date());
  const today = () => dayKey(clock());
  const stamp = () => clock().toISOString();

  const personExists = (personId) => store.state.people.some((p) => p.id === personId);

  function append(draft, prefix) {
    return { id: id(prefix), createdAt: stamp() };
  }

  return {
    /* ------------------------------------------------------------ settings */
    updateSettings(patch) {
      const next = { ...patch };
      store.update(
        (draft) => {
          draft.settings = { ...draft.settings, ...next };
        },
        { type: 'settings.updated', entity: 'settings', summary: `Settings updated (${Object.keys(next).join(', ') || 'no change'})` },
      );
      return { ok: true };
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
    logOneOnOne(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const person = store.state.people.find((p) => p.id === data.personId);
      const meeting = {
        ...append(null, 'oo'),
        personId: data.personId,
        date: data.date || today(),
        status: ['held', 'skipped', 'moved'].includes(data.status) ? data.status : 'held',
        mood: data.mood ?? null,
        agenda: (data.agenda || []).map((a) => ({
          id: id('ag'),
          text: clean(a.text) || '',
          done: Boolean(a.done),
          source: a.source || 'manual',
        })).filter((a) => a.text),
        notes: clean(data.notes) || '',
        actions: (data.actions || [])
          .map((a) => ({ id: id('ac'), text: clean(a.text) || '', due: a.due || null, done: false, personId: data.personId }))
          .filter((a) => a.text),
      };
      store.update(
        (draft) => {
          draft.oneOnOnes.push(meeting);
        },
        {
          type: 'oneonone.logged',
          entity: 'oneOnOne',
          entityId: meeting.id,
          summary: `${meeting.status === 'held' ? '1:1 held' : `1:1 ${meeting.status}`} with ${person.name}`,
        },
      );
      return { ok: true, id: meeting.id };
    },

    toggleMeetingAction(meetingId, actionId) {
      store.update(
        (draft) => {
          const meeting = draft.oneOnOnes.find((m) => m.id === meetingId);
          const action = meeting?.actions.find((a) => a.id === actionId);
          if (!action) return;
          action.done = !action.done;
        },
        { type: 'oneonone.action.toggled', entity: 'oneOnOne', entityId: meetingId, summary: '1:1 action toggled' },
      );
      return { ok: true };
    },

    addMeetingAction(meetingId, text, due) {
      const value = clean(text);
      if (!value) return fail('Describe the action.', 'text');
      store.update(
        (draft) => {
          const meeting = draft.oneOnOnes.find((m) => m.id === meetingId);
          if (!meeting) return;
          meeting.actions.push({ id: id('ac'), text: value, due: due || null, done: false, personId: meeting.personId });
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
      const item = {
        ...append(null, 'fb'),
        personId: data.personId,
        direction: data.direction === 'received' ? 'received' : 'given',
        kind,
        situation: clean(data.situation) || '',
        behavior,
        impact: clean(data.impact) || '',
        tags: (data.tags || []).map((t) => clean(t)).filter(Boolean).slice(0, 6),
        date: data.date || today(),
        followUpOn: data.followUpOn || null,
        followUpDone: false,
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
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (!item) return;
          Object.assign(item, patch);
        },
        { type: 'feedback.updated', entity: 'feedback', entityId: feedbackId, summary: 'Feedback updated' },
      );
      return { ok: true };
    },

    completeFollowUp(feedbackId, done = true) {
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (item) item.followUpDone = done;
        },
        { type: 'feedback.followup', entity: 'feedback', entityId: feedbackId, summary: done ? 'Feedback follow-up closed' : 'Feedback follow-up reopened' },
      );
      return { ok: true };
    },

    /* --------------------------------------------------------------- goals */
    addGoal(data) {
      const title = clean(data.title) || '';
      if (!title) return fail('Give the goal a name.', 'title');
      const goal = {
        ...append(null, 'goal'),
        title,
        description: clean(data.description) || '',
        ownerId: data.ownerId || null,
        scope: data.scope === 'team' ? 'team' : 'person',
        dueDate: data.dueDate || null,
        keyResults: (data.keyResults || [])
          .map((kr) => ({
            id: id('kr'),
            title: clean(kr.title) || '',
            start: Number(kr.start) || 0,
            target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
            current: Number.isFinite(Number(kr.current)) ? Number(kr.current) : Number(kr.start) || 0,
            unit: clean(kr.unit) || '',
          }))
          .filter((kr) => kr.title),
        confidence: 'on-track',
        status: 'active',
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
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          if (patch.title !== undefined) goal.title = clean(patch.title) || goal.title;
          if (patch.description !== undefined) goal.description = clean(patch.description);
          if (patch.dueDate !== undefined) goal.dueDate = patch.dueDate || null;
          if (patch.ownerId !== undefined) goal.ownerId = patch.ownerId || null;
          if (patch.confidence) goal.confidence = patch.confidence;
          if (patch.status) goal.status = patch.status;
        },
        { type: 'goal.updated', entity: 'goal', entityId: goalId, summary: 'Goal updated' },
      );
      return { ok: true };
    },

    /** Check in: records confidence, a note, and any key-result movements. */
    checkInGoal(goalId, { note = '', confidence = 'on-track', keyResults = [] } = {}) {
      const goal = store.state.goals.find((g) => g.id === goalId);
      if (!goal) return fail('That goal no longer exists.');
      store.update(
        (draft) => {
          const target = draft.goals.find((g) => g.id === goalId);
          if (!target) return;
          target.checkins.push({ id: id('chk'), date: today(), note: clean(note) || '', confidence });
          target.confidence = confidence;
          for (const update of keyResults) {
            const kr = target.keyResults.find((k) => k.id === update.id);
            if (kr && Number.isFinite(Number(update.current))) kr.current = Number(update.current);
          }
        },
        {
          type: 'goal.checkin',
          entity: 'goal',
          entityId: goalId,
          summary: `Check-in on "${goal.title.slice(0, 50)}" (${confidence})`,
        },
      );
      return { ok: true };
    },

    addKeyResult(goalId, kr) {
      const title = clean(kr.title) || '';
      if (!title) return fail('Name the key result.', 'title');
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          goal.keyResults.push({
            id: id('kr'),
            title,
            start: Number(kr.start) || 0,
            target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
            current: Number.isFinite(Number(kr.current)) ? Number(kr.current) : Number(kr.start) || 0,
            unit: clean(kr.unit) || '',
          });
        },
        { type: 'goal.kr.added', entity: 'goal', entityId: goalId, summary: `Key result added: ${title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    removeKeyResult(goalId, krId) {
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (goal) goal.keyResults = goal.keyResults.filter((k) => k.id !== krId);
        },
        { type: 'goal.kr.removed', entity: 'goal', entityId: goalId, summary: 'Key result removed' },
      );
      return { ok: true };
    },

    /* -------------------------------------------------------------- growth */
    saveGrowthPlan(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const goal = clean(data.goal) || '';
      if (!goal) return fail('A GROW plan starts with a goal.', 'goal');
      const plan = {
        ...append(null, 'gp'),
        personId: data.personId,
        goal,
        reality: clean(data.reality) || '',
        options: (data.options || []).map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text),
        will: (data.will || [])
          .map((a) => ({ id: id('ac'), text: clean(a.text) || '', due: a.due || null, done: false, personId: data.personId }))
          .filter((a) => a.text),
        competencies: (data.competencies || []).map((c) => clean(c)).filter(Boolean),
        reviewOn: data.reviewOn || null,
        status: 'active',
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          // A person has one active plan at a time; close the previous one.
          for (const existing of draft.growthPlans) {
            if (existing.personId === data.personId && existing.status === 'active') existing.status = 'done';
          }
          draft.growthPlans.push(plan);
        },
        { type: 'growth.created', entity: 'growthPlan', entityId: plan.id, summary: `Growth plan for ${person.name}` },
      );
      return { ok: true, id: plan.id };
    },

    updateGrowthPlan(planId, patch) {
      store.update(
        (draft) => {
          const plan = draft.growthPlans.find((p) => p.id === planId);
          if (!plan) return;
          if (patch.goal !== undefined) plan.goal = clean(patch.goal) || plan.goal;
          if (patch.reality !== undefined) plan.reality = clean(patch.reality);
          if (patch.reviewOn !== undefined) plan.reviewOn = patch.reviewOn || null;
          if (patch.status) plan.status = patch.status;
          if (Array.isArray(patch.options)) plan.options = patch.options.map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text);
          if (Array.isArray(patch.competencies)) plan.competencies = patch.competencies.map((c) => clean(c)).filter(Boolean);
        },
        { type: 'growth.updated', entity: 'growthPlan', entityId: planId, summary: 'Growth plan updated' },
      );
      return { ok: true };
    },

    addWillAction(planId, text, due) {
      const value = clean(text);
      if (!value) return fail('Describe the commitment.', 'text');
      store.update(
        (draft) => {
          const plan = draft.growthPlans.find((p) => p.id === planId);
          if (!plan) return;
          plan.will.push({ id: id('ac'), text: value, due: due || null, done: false, personId: plan.personId });
        },
        { type: 'growth.will.added', entity: 'growthPlan', entityId: planId, summary: `Development action added: ${value.slice(0, 50)}` },
      );
      return { ok: true };
    },

    toggleWillAction(planId, actionId) {
      store.update(
        (draft) => {
          const plan = draft.growthPlans.find((p) => p.id === planId);
          const action = plan?.will.find((a) => a.id === actionId);
          if (!action) return;
          action.done = !action.done;
        },
        { type: 'growth.will.toggled', entity: 'growthPlan', entityId: planId, summary: 'Development action toggled' },
      );
      return { ok: true };
    },

    /* --------------------------------------------------------------- pulse */
    submitPulse(data) {
      const scores = {};
      for (const dim of PULSE_DIMENSIONS) {
        const value = Number(data.scores?.[dim]);
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
  };
}
