import type {
  BrainProjection,
  CommitmentMadePayload,
  CommitmentResolvedPayload,
  FlightSignalPayload,
  GoalClosedPayload,
  GoalProgressPayload,
  GoalSetPayload,
  LeadosEvent,
  OOOPayload,
  OneOnePayload,
  PersonAddedPayload,
  PersonState,
  PersonUpdatedPayload,
  PerformancePayload,
  PulsePayload,
  SkillAddedPayload,
  SuccessionPayload,
} from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function blankPerson(id: string, timestamp: string): PersonState {
  return {
    id,
    name: id,
    title: '',
    reportsTo: null,
    addedAt: timestamp,
    directReports: [],
    tenureDays: 0,
    lastOneOneAt: null,
    oneOnes: [],
    pulses: [],
    flightSignalDates: [],
    flightSignals: 0,
    commitments: [],
    goals: [],
    skills: [],
    skillAddedDates: [],
    performanceHistory: [],
    successors: [],
    successionFor: [],
    oooDates: [],
  };
}

/**
 * Folds the full LeadosEvent log into a BrainProjection.
 * This is the ONLY place person.* events are interpreted into state.
 * No database — the event log (localStorage) is the source of truth.
 */
export function project(events: LeadosEvent[], now: Date = new Date()): BrainProjection {
  const people = new Map<string, PersonState>();

  const ensure = (id: string, timestamp: string) => {
    if (!people.has(id)) people.set(id, blankPerson(id, timestamp));
    return people.get(id)!;
  };

  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const evt of sorted) {
    switch (evt.type) {
      case 'person.added': {
        const p = evt.payload as PersonAddedPayload;
        const state = ensure(p.personId, evt.timestamp);
        state.name = p.name;
        state.title = p.title;
        state.reportsTo = p.reportsTo;
        state.addedAt = evt.timestamp;
        break;
      }
      case 'person.updated': {
        const p = evt.payload as PersonUpdatedPayload;
        const state = ensure(p.personId, evt.timestamp);
        if (p.name !== undefined) state.name = p.name;
        if (p.title !== undefined) state.title = p.title;
        if (p.reportsTo !== undefined) state.reportsTo = p.reportsTo;
        break;
      }
      case 'person.oneone.logged': {
        const p = evt.payload as OneOnePayload;
        const state = ensure(p.personId, evt.timestamp);
        state.oneOnes.push({
          id: evt.id,
          personId: p.personId,
          date: p.date,
          notes: p.notes,
          sentiment: p.sentiment,
          topics: p.topics ?? [],
          actionItems: p.actionItems ?? [],
          actionItemsResolved: p.actionItemsResolved ?? false,
        });
        if (!state.lastOneOneAt || p.date > state.lastOneOneAt) state.lastOneOneAt = p.date;
        break;
      }
      case 'person.pulse.logged': {
        const p = evt.payload as PulsePayload;
        const state = ensure(p.personId, evt.timestamp);
        state.pulses.push({ id: evt.id, personId: p.personId, date: p.date, mood: p.mood, notes: p.notes });
        break;
      }
      case 'person.flight.signal': {
        const p = evt.payload as FlightSignalPayload;
        const state = ensure(p.personId, evt.timestamp);
        state.flightSignalDates.push(p.date);
        state.flightSignals += 1;
        break;
      }
      case 'person.commitment.made': {
        const p = evt.payload as CommitmentMadePayload;
        const state = ensure(p.personId, evt.timestamp);
        state.commitments.push({
          id: p.commitmentId,
          personId: p.personId,
          text: p.text,
          madeDate: evt.timestamp,
          byDate: p.byDate,
          resolved: false,
        });
        break;
      }
      case 'person.commitment.resolved': {
        const p = evt.payload as CommitmentResolvedPayload;
        const state = ensure(p.personId, evt.timestamp);
        const c = state.commitments.find((c) => c.id === p.commitmentId);
        if (c) {
          c.resolved = true;
          c.resolvedDate = p.resolvedDate;
        }
        break;
      }
      case 'person.goal.set': {
        const p = evt.payload as GoalSetPayload;
        const state = ensure(p.personId, evt.timestamp);
        state.goals.push({
          id: p.goalId,
          personId: p.personId,
          text: p.text,
          targetDate: p.targetDate,
          progress: 0,
          status: 'open',
          lastUpdated: evt.timestamp,
        });
        break;
      }
      case 'person.goal.progress': {
        const p = evt.payload as GoalProgressPayload;
        const state = ensure(p.personId, evt.timestamp);
        const g = state.goals.find((g) => g.id === p.goalId);
        if (g) {
          g.progress = p.progress;
          g.lastUpdated = p.date;
        }
        break;
      }
      case 'person.goal.closed': {
        const p = evt.payload as GoalClosedPayload;
        const state = ensure(p.personId, evt.timestamp);
        const g = state.goals.find((g) => g.id === p.goalId);
        if (g) {
          g.status = p.outcome;
          g.lastUpdated = p.date;
        }
        break;
      }
      case 'person.skill.added': {
        const p = evt.payload as SkillAddedPayload;
        const state = ensure(p.personId, evt.timestamp);
        if (!state.skills.includes(p.skill)) state.skills.push(p.skill);
        state.skillAddedDates.push(p.date);
        break;
      }
      case 'person.performance.logged': {
        const p = evt.payload as PerformancePayload;
        const state = ensure(p.personId, evt.timestamp);
        state.performanceHistory.push({
          id: evt.id,
          personId: p.personId,
          period: p.period,
          score: p.score,
          reviewer: p.reviewer,
          date: p.date,
        });
        break;
      }
      case 'person.succession.nominated': {
        const p = evt.payload as SuccessionPayload;
        const incumbent = ensure(p.incumbentId, evt.timestamp);
        const nominee = ensure(p.nomineeId, evt.timestamp);
        if (!incumbent.successors.includes(p.nomineeId)) incumbent.successors.push(p.nomineeId);
        if (!nominee.successionFor.includes(p.role)) nominee.successionFor.push(p.role);
        break;
      }
      case 'person.ooo.logged': {
        const p = evt.payload as OOOPayload;
        const state = ensure(p.personId, evt.timestamp);
        state.oooDates.push(p.date);
        break;
      }
      default:
        break;
    }
  }

  // Compute derived fields: directReports + tenure, sort history chronologically.
  const all = Array.from(people.values());
  for (const p of all) {
    p.directReports = all.filter((q) => q.reportsTo === p.id).map((q) => q.id);
    p.tenureDays = Math.max(0, Math.round((now.getTime() - new Date(p.addedAt).getTime()) / MS_PER_DAY));
    p.oneOnes.sort((a, b) => a.date.localeCompare(b.date));
    p.pulses.sort((a, b) => a.date.localeCompare(b.date));
    p.performanceHistory.sort((a, b) => a.date.localeCompare(b.date));
    p.commitments.sort((a, b) => a.byDate.localeCompare(b.byDate));
  }

  return { people: all, generatedAt: now.toISOString() };
}
