// Synthetic roster + deterministic synthetic event log for LeadOS pt-Q.
// ORIGINAL to this build. All names/people are fabricated demo data, clearly
// labeled as such in the UI — not real org data.
import { mulberry32 } from './prng';
import type { AppState, Person, LeadEvent } from './types';

const rnd = mulberry32(20260220);
let counter = 0;
const uid = (p: string) => `${p}_${(counter++).toString(36)}`;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

const ACTIVE_NAMES: { name: string; title: string; team: string; level: 'direct' | 'skip' }[] = [
  { name: 'Mina Osei', title: 'Staff Engineer', team: 'Platform', level: 'direct' },
  { name: 'Devon Clarke', title: 'Eng Manager', team: 'Payments', level: 'direct' },
  { name: 'Priya Natarajan', title: 'Senior PM', team: 'Growth', level: 'direct' },
  { name: 'Jonas Weber', title: 'Design Lead', team: 'Core UX', level: 'direct' },
  { name: 'Aiko Tanaka', title: 'Data Scientist', team: 'Platform', level: 'skip' },
  { name: 'Carlos Mendez', title: 'SRE', team: 'Platform', level: 'skip' },
  { name: 'Freya Lindqvist', title: 'Frontend Engineer', team: 'Growth', level: 'skip' },
  { name: 'Tomi Adeyemi', title: 'Backend Engineer', team: 'Payments', level: 'skip' },
  { name: 'Sana Rahman', title: 'QA Lead', team: 'Core UX', level: 'direct' },
  { name: 'Liam O\'Brien', title: 'Support Eng', team: 'Growth', level: 'skip' },
];

const DEPARTED_NAMES = ['Nora Petrov', 'Haruto Sato', 'Ingrid Voss', 'Felix Nwosu'];

export function buildSeedState(): AppState {
  const people: Person[] = ACTIVE_NAMES.map((p, i) => ({
    id: uid('p'),
    name: p.name,
    title: p.title,
    team: p.team,
    level: p.level,
    cadenceDays: 14,
    startDate: daysAgo(200 + i * 37),
  }));

  const departed: Person[] = DEPARTED_NAMES.map((name, i) => ({
    id: uid('p'),
    name,
    title: 'Engineer',
    team: ['Platform', 'Payments', 'Growth', 'Core UX'][i % 4],
    level: 'skip',
    cadenceDays: 14,
    startDate: daysAgo(500 - i * 20),
    archived: true,
  }));

  const events: LeadEvent[] = [];
  const push = (type: LeadEvent['type'], ts: string, data: Record<string, any>) =>
    events.push({ id: uid('e'), type, ts, data });

  // --- Active people: pulses, feedback, 1:1s, growth plans, conflicts ---
  people.forEach((person, idx) => {
    // Give a couple of people a visibly at-risk profile so the app has
    // something interesting to surface (disclosed synthetic construction).
    const atRisk = idx === 1 || idx === 6; // Devon Clarke, Freya Lindqvist
    const neglectedCadence = idx === 4; // Aiko Tanaka

    // Pulses over last ~90 days, every ~7 days
    for (let d = 84; d >= 0; d -= 7) {
      const baseMood = atRisk ? 3.5 : 7.2;
      const baseLoad = atRisk ? 8.3 : 5.5;
      const drift = atRisk ? -0.01 * (84 - d) : 0.004 * (84 - d);
      const mood = Math.max(1, Math.min(10, baseMood + drift + (rnd() - 0.5) * 1.4));
      const load = Math.max(1, Math.min(10, baseLoad + (rnd() - 0.5) * 1.2));
      push('pulse.logged', daysAgo(d), { personId: person.id, mood: Math.round(mood * 10) / 10, load: Math.round(load * 10) / 10 });
    }

    // Feedback over 90 days
    const fbCount = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < fbCount; i++) {
      const positive = atRisk ? rnd() > 0.6 : rnd() > 0.25;
      push('feedback.logged', daysAgo(Math.floor(rnd() * 89)), {
        personId: person.id,
        polarity: positive ? 'positive' : 'negative',
        note: positive ? 'Strong delivery on recent project.' : 'Missed a deadline; needs follow-up.',
      });
    }

    // 1:1 history — last one more overdue for neglected/at-risk people
    const lastOneOnOneGap = neglectedCadence ? 40 : atRisk ? 25 : 6;
    push('oneonone.logged', daysAgo(lastOneOnOneGap), { personId: person.id, notes: 'Routine check-in.' });
    for (let i = 1; i <= 6; i++) {
      push('oneonone.logged', daysAgo(lastOneOnOneGap + i * 14), { personId: person.id, notes: 'Routine check-in.' });
    }

    // Growth plans — most have one, at-risk ones don't (part of their risk signature)
    if (!atRisk) {
      push('growthplan.opened', daysAgo(60 + idx), { personId: person.id, planId: uid('plan') });
    }

    // Conflicts — at-risk people have more
    if (atRisk) {
      push('conflict.logged', daysAgo(20), { person1Id: person.id, person2Id: people[(idx + 2) % people.length].id, note: 'Disagreement over scope.' });
      push('conflict.logged', daysAgo(45), { person1Id: person.id, person2Id: people[(idx + 3) % people.length].id, note: 'Friction in planning meeting.' });
    }
  });

  // --- Collaboration graph (for informal power-network detection) ---
  // Deliberately make one non-manager (Carlos Mendez, SRE) a high-centrality hub.
  const byName = (n: string) => people.find((p) => p.name === n)!;
  const hub = byName('Carlos Mendez');
  people.forEach((p) => {
    if (p.id === hub.id) return;
    const weight = rnd() > 0.3 ? 2 + Math.round(rnd() * 3) : 1;
    push('collab.logged', daysAgo(Math.floor(rnd() * 60)), { personAId: hub.id, personBId: p.id, weight });
  });
  // A few more ordinary collaboration edges
  for (let i = 0; i < 10; i++) {
    const a = people[Math.floor(rnd() * people.length)];
    const b = people[Math.floor(rnd() * people.length)];
    if (a.id === b.id) continue;
    push('collab.logged', daysAgo(Math.floor(rnd() * 60)), { personAId: a.id, personBId: b.id, weight: 1 + Math.round(rnd() * 2) });
  }

  // --- Meetings (for meeting intelligence) ---
  const meetingTypes: Array<'status' | 'decision' | 'brainstorm'> = ['status', 'decision', 'brainstorm'];
  for (let i = 0; i < 14; i++) {
    const type = meetingTypes[Math.floor(rnd() * meetingTypes.length)];
    const attendeeCount = 2 + Math.floor(rnd() * 5);
    const attendees = Array.from({ length: attendeeCount }, () => people[Math.floor(rnd() * people.length)].id);
    const durationMinutes = [15, 30, 30, 45, 60][Math.floor(rnd() * 5)];
    const decisionsCount = type === 'status' ? Math.floor(rnd() * 2) : Math.floor(rnd() * 4);
    push('meeting.logged', daysAgo(Math.floor(rnd() * 60)), { attendees, durationMinutes, decisionsCount, type });
  }

  // --- Historical departures (for the flight-risk signature model) ---
  departed.forEach((p, i) => {
    const departureDate = daysAgo(30 + i * 45);
    // Pre-departure behavioral trail (60-90 days before departure): low mood, high load, cadence slip
    for (let d = 150 + i * 10; d >= 30 + i * 45; d -= 7) {
      const mood = Math.max(1, 3.2 + (rnd() - 0.5) * 1.2);
      const load = Math.min(10, 8.1 + (rnd() - 0.5) * 1.0);
      push('pulse.logged', daysAgo(d), { personId: p.id, mood: Math.round(mood * 10) / 10, load: Math.round(load * 10) / 10 });
    }
    push('oneonone.logged', daysAgo(60 + i * 45), { personId: p.id, notes: 'Last recorded 1:1 before departure.' });
    push('feedback.logged', daysAgo(50 + i * 45), { personId: p.id, polarity: 'negative', note: 'Disengagement observed.' });
    push('hr.attrition.logged', departureDate, { personId: p.id });
  });

  return { events, people: [...people, ...departed] };
}
