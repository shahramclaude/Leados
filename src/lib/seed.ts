import type { LeadosEvent, LeadosEventPayload, LeadosEventType } from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Generates the full seed event log for the People Intelligence Engine demo.
 * Counts (person-related event types used below):
 *   person.added              (15)
 *   person.updated             (1)
 *   person.oneone.logged      (~46)
 *   person.pulse.logged       (~70)
 *   person.flight.signal       (2)
 *   person.commitment.made    (~24)
 *   person.commitment.resolved(~14)
 *   person.goal.set           (~18)
 *   person.goal.progress      (~14)
 *   person.goal.closed         (3)
 *   person.skill.added        (~16)
 *   person.performance.logged (~30)
 *   person.succession.nominated (2)
 *   person.ooo.logged         (~16)
 * => 14 distinct person-related event types are emitted by this seed.
 */
export function buildSeedEvents(): LeadosEvent[] {
  const now = new Date();
  let n = 0;
  const events: LeadosEvent[] = [];
  const push = <T extends LeadosEventPayload>(type: LeadosEventType, payload: T, timestamp: string) => {
    events.push({ id: `seed-${++n}`, type, timestamp, payload });
  };
  const daysAgo = (d: number) => new Date(now.getTime() - d * MS_PER_DAY).toISOString();

  // ─── Org chart ───────────────────────────────────────────────
  const org = [
    { id: 'p1', name: 'Jordan Lee', title: 'Chief Executive Officer', reportsTo: null as string | null, tenureDays: 1640 },
    { id: 'p2', name: 'Avery Chen', title: 'VP Engineering', reportsTo: 'p1', tenureDays: 1170 },
    { id: 'p3', name: 'Morgan Diaz', title: 'VP Go-To-Market', reportsTo: 'p1', tenureDays: 1095 },
    { id: 'p4', name: 'Sam Patel', title: 'Staff Engineer', reportsTo: 'p2', tenureDays: 950 },
    { id: 'p5', name: 'Riley Kim', title: 'Engineering Manager', reportsTo: 'p2', tenureDays: 770 },
    { id: 'p6', name: 'Taylor Brooks', title: 'Senior Engineer', reportsTo: 'p2', tenureDays: 660 },
    { id: 'p7', name: 'Jamie Fox', title: 'Software Engineer', reportsTo: 'p2', tenureDays: 540 },
    { id: 'p8', name: 'Casey Nguyen', title: 'Software Engineer', reportsTo: 'p2', tenureDays: 730 },
    { id: 'p9', name: 'Drew Alvarez', title: 'Platform Engineer', reportsTo: 'p2', tenureDays: 440 },
    { id: 'p10', name: 'Harper Wells', title: 'Associate Engineer', reportsTo: 'p2', tenureDays: 110 },
    { id: 'p11', name: 'Reese Bennett', title: 'Software Engineer', reportsTo: 'p2', tenureDays: 400 },
    { id: 'p12', name: 'Noor Haddad', title: 'Senior Engineer', reportsTo: 'p2', tenureDays: 580 },
    { id: 'p13', name: 'Alex Rivera', title: 'Sales Lead', reportsTo: 'p3', tenureDays: 870 },
    { id: 'p14', name: 'Quinn Osei', title: 'Account Executive', reportsTo: 'p3', tenureDays: 470 },
    { id: 'p15', name: 'Priya Shah', title: 'Marketing Manager', reportsTo: 'p3', tenureDays: 690 },
  ];

  for (const p of org) {
    push('person.added', { personId: p.id, name: p.name, title: p.title, reportsTo: p.reportsTo }, daysAgo(p.tenureDays));
  }
  // One org change: Harper Wells's title was corrected shortly after joining.
  push('person.updated', { personId: 'p10', title: 'Associate Engineer' }, daysAgo(95));

  // ─── Helpers for recurring records ─────────────────────────
  const oneOne = (
    personId: string,
    d: number,
    notes: string,
    sentiment: -1 | 0 | 1,
    topics: string[],
    actionItems: string[] = [],
    resolved = true,
  ) =>
    push(
      'person.oneone.logged',
      { personId, date: daysAgo(d), notes, sentiment, topics, actionItems, actionItemsResolved: resolved },
      daysAgo(d),
    );

  const pulse = (personId: string, d: number, mood: 1 | 2 | 3 | 4 | 5, notes = '') =>
    push('person.pulse.logged', { personId, date: daysAgo(d), mood, notes }, daysAgo(d));

  const perf = (personId: string, d: number, period: string, score: number, reviewer: string) =>
    push(
      'person.performance.logged',
      { personId, period, score: score as any, reviewer, date: daysAgo(d) },
      daysAgo(d),
    );

  const skill = (personId: string, d: number, s: string) =>
    push('person.skill.added', { personId, skill: s, date: daysAgo(d) }, daysAgo(d));

  const goalSet = (personId: string, id: string, d: number, text: string, targetDate?: string) =>
    push('person.goal.set', { personId, goalId: id, text, targetDate }, daysAgo(d));

  const goalProgress = (personId: string, id: string, d: number, progress: number) =>
    push('person.goal.progress', { personId, goalId: id, progress, date: daysAgo(d) }, daysAgo(d));

  const goalClosed = (personId: string, id: string, d: number, outcome: 'achieved' | 'abandoned') =>
    push('person.goal.closed', { personId, goalId: id, outcome, date: daysAgo(d) }, daysAgo(d));

  const commitmentMade = (personId: string, id: string, d: number, text: string, byDaysOut: number) =>
    push('person.commitment.made', { personId, commitmentId: id, text, byDate: daysAgo(d - byDaysOut) }, daysAgo(d));

  const commitmentResolved = (personId: string, id: string, d: number) =>
    push('person.commitment.resolved', { personId, commitmentId: id, resolvedDate: daysAgo(d) }, daysAgo(d));

  const ooo = (personId: string, d: number) => push('person.ooo.logged', { personId, date: daysAgo(d) }, daysAgo(d));

  // ─── Jordan Lee (CEO) — healthy, no successor named ─────────
  oneOne('p1', 10, 'Reviewed strategic plan progress and board prep materials. Alignment is strong across the leadership team.', 1, ['Strategic Plan', 'Board Prep']);
  oneOne('p1', 24, 'Discussed Q3 roadmap trade-offs and the board narrative for growth.', 1, ['Strategic Plan', 'Board Prep']);
  pulse('p1', 7, 4);
  pulse('p1', 14, 4);
  pulse('p1', 21, 5);
  perf('p1', 95, 'H1', 9, 'Board');
  ooo('p1', 55);
  for (let i = 1; i <= 3; i++) commitmentMade('p1', `c-p1-${i}`, 50 - i * 10, `Finalize fundraising milestone ${i}`, 20);
  commitmentResolved('p1', 'c-p1-1', 20);
  commitmentResolved('p1', 'c-p1-2', 15);

  // ─── Avery Chen (p2, VP Eng) — 9 directs → overloaded driver ─
  oneOne('p2', 9, 'Checked in on the platform migration and the load across the eng org. Avery flagged feeling stretched thin running nine direct reports but is managing.', 0, ['Strategic Plan', 'Platform Migration', 'Q3 Roadmap']);
  oneOne('p2', 23, 'Discussed hiring plan to add a manager layer and relieve some of the overload. Good energy otherwise.', 1, ['Platform Migration', 'Q3 Roadmap']);
  oneOne('p2', 40, 'Roadmap review — on track. No concerns raised.', 1, ['Platform Migration', 'Q3 Roadmap']);
  pulse('p2', 7, 3);
  pulse('p2', 14, 3);
  pulse('p2', 21, 4);
  perf('p2', 100, 'H1', 8, 'Jordan Lee');
  perf('p2', 280, '2023-H2', 8, 'Jordan Lee');
  skill('p2', 60, 'Org Design');
  ooo('p2', 70);
  for (let i = 1; i <= 2; i++) commitmentMade('p2', `c-p2-${i}`, 40 - i * 10, `Hire engineering manager #${i}`, 30);
  commitmentResolved('p2', 'c-p2-1', 10);

  // ─── Sam Patel (p4) — CRITICAL flight risk ──────────────────
  oneOne('p4', 90, 'Checked in on the platform migration workstream and code quality initiative. Sam is engaged and roadmap ownership is clear.', 0, ['Platform Migration', 'Code Quality']);
  oneOne('p4', 63, 'Sam raised that comp feels below market rate for a staff-level scope, and the equity refresh has not kept pace. Logged a compensation review as a follow-up.', -1, ['Platform Migration', 'Code Quality']);
  oneOne('p4', 49, 'Sam shared that a recruiter reached out and they have agreed to an interview next week. Also repeated that pay feels below market rate given scope.', -1, ['Platform Migration', 'Code Quality']);
  oneOne('p4', 35, 'Sam said they are seriously considering leaving and have another offer on the table. We discussed notice period expectations if they decide on moving on.', -1, ['Platform Migration', 'Code Quality']);
  pulse('p4', 7, 1);
  pulse('p4', 14, 2);
  pulse('p4', 21, 1);
  pulse('p4', 35, 3);
  push('person.flight.signal', { personId: 'p4', date: daysAgo(20), note: 'Manager overheard reference call being scheduled.' }, daysAgo(20));
  push('person.flight.signal', { personId: 'p4', date: daysAgo(5), note: 'Sam asked HR about accrued PTO payout policy.' }, daysAgo(5));
  perf('p4', 100, 'H1', 7, 'Avery Chen');
  perf('p4', 280, '2023-H2', 7, 'Avery Chen');
  skill('p4', 400, 'Distributed Systems');
  goalSet('p4', 'g-p4-1', 80, 'Lead platform migration cutover', daysAgo(0));
  goalProgress('p4', 'g-p4-1', 40, 60);
  for (let i = 1; i <= 2; i++) commitmentMade('p4', `c-p4-${i}`, 30 - i * 5, `Migration runbook section ${i}`, 10);

  // ─── Riley Kim (p5) — burnout risk ───────────────────────────
  oneOne('p5', 45, 'Quarterly planning. Riley is on top of oncall rotation and mentoring plan.', 0, ['Oncall Rotation', 'Mentoring', 'Code Quality']);
  oneOne('p5', 20, 'Riley said they feel exhausted and are working most weekends just to stay afloat; workload is not sustainable right now.', -1, ['Oncall Rotation', 'Code Quality']);
  oneOne('p5', 6, 'Riley reiterated feeling stretched thin and that they can\'t keep up with the current on-call load without help.', -1, ['Oncall Rotation', 'Mentoring']);
  pulse('p5', 3, 2);
  pulse('p5', 10, 2);
  pulse('p5', 17, 2);
  pulse('p5', 24, 3);
  perf('p5', 100, 'H1', 7, 'Avery Chen');
  for (let i = 1; i <= 6; i++) commitmentMade('p5', `c-p5-${i}`, 28 - i * 3, `On-call process fix #${i}`, 10);
  commitmentResolved('p5', 'c-p5-1', 10);
  // 5 of 6 remain unresolved and overdue → burnout driver

  // ─── Taylor Brooks (p6) — Star: high perf, high potential ───
  oneOne('p6', 6, 'Deep conversation about career growth and the next level for Taylor. We discussed a stretch assignment leading the migration architecture, additional learning investment, and a development plan toward a staff title. Taylor is energized and sees a clear career path here, with real opportunity to grow technically and as a mentor to the rest of the platform pod. We agreed on concrete skills to build over the next two quarters and a timeline to revisit promotion readiness.', 1, ['Platform Migration', 'Mentoring', 'Q3 Roadmap'], ['Draft staff promo packet', 'Shadow architecture review'], true);
  oneOne('p6', 20, 'Reviewed migration architecture proposal — excellent work, strong technical leadership on display.', 1, ['Platform Migration', 'Mentoring']);
  oneOne('p6', 34, 'Discussed mentoring load for junior engineers and the Q3 roadmap deliverables.', 1, ['Platform Migration', 'Q3 Roadmap']);
  pulse('p6', 5, 5);
  pulse('p6', 12, 4);
  pulse('p6', 19, 5);
  perf('p6', 100, 'H1', 7, 'Avery Chen');
  perf('p6', 280, '2023-H2', 8, 'Avery Chen');
  perf('p6', 10, 'H2-checkin', 9, 'Avery Chen');
  skill('p6', 150, 'System Architecture');
  skill('p6', 90, 'Technical Mentoring');
  skill('p6', 40, 'Distributed Tracing');
  ooo('p6', 60);
  push('person.succession.nominated', { incumbentId: 'p2', nomineeId: 'p6', role: 'VP Engineering', nominatorId: 'p1', readiness: 0.6, date: daysAgo(15) }, daysAgo(15));
  goalSet('p6', 'g-p6-1', 100, 'Lead platform migration architecture', daysAgo(10));
  goalProgress('p6', 'g-p6-1', 20, 85);

  // ─── Jamie Fox (p7) — comp frustration ───────────────────────
  oneOne('p7', 55, 'Jamie feels underpaid relative to peers and mentioned market rate benchmarking they found online.', -1, ['Code Quality', 'Oncall Rotation']);
  oneOne('p7', 33, 'Jamie said they deserve more given recent scope increase and asked about a compensation review.', -1, ['Code Quality']);
  oneOne('p7', 12, 'Jamie again raised that pay feels below market rate; otherwise solid week of delivery.', 0, ['Oncall Rotation', 'Code Quality']);
  pulse('p7', 6, 3);
  pulse('p7', 13, 3);
  pulse('p7', 20, 3);
  perf('p7', 100, 'H1', 6, 'Avery Chen');
  perf('p7', 280, '2023-H2', 6, 'Avery Chen');
  ooo('p7', 45);

  // ─── Casey Nguyen (p8) — stale goals ──────────────────────────
  oneOne('p8', 18, 'Standard check-in, steady progress on roadmap items.', 0, ['Q3 Roadmap', 'Mentoring']);
  oneOne('p8', 32, 'Reviewed sprint deliverables, no blockers.', 0, ['Q3 Roadmap']);
  pulse('p8', 6, 3);
  pulse('p8', 13, 3);
  perf('p8', 100, 'H1', 6, 'Avery Chen');
  ooo('p8', 80);
  goalSet('p8', 'g-p8-1', 120, 'Complete internal certification track', daysAgo(200));
  goalProgress('p8', 'g-p8-1', 95, 30); // silent since
  goalSet('p8', 'g-p8-2', 110, 'Improve test coverage to 80%', daysAgo(0));
  goalProgress('p8', 'g-p8-2', 80, 35); // silent since

  // ─── Drew Alvarez (p9) — isolated in network ─────────────────
  oneOne('p9', 11, 'Progress on legacy system cleanup continues steadily and independently.', 0, ['Legacy System Cleanup']);
  oneOne('p9', 25, 'Drew is heads-down on the legacy cleanup project, working mostly solo.', 0, ['Legacy System Cleanup']);
  pulse('p9', 6, 4);
  pulse('p9', 13, 4);
  perf('p9', 100, 'H1', 6, 'Avery Chen');
  ooo('p9', 50);

  // ─── Harper Wells (p10) — new hire ────────────────────────────
  oneOne('p10', 8, 'Onboarding check-in. Ramping on code quality standards, positive first impressions.', 1, ['Onboarding', 'Code Quality']);
  pulse('p10', 4, 4);
  pulse('p10', 11, 4);

  // ─── Reese Bennett (p11) — solid/mid performer ────────────────
  oneOne('p11', 9, 'Steady contributor on oncall rotation and roadmap work. Discussed growth into a senior scope next year.', 1, ['Oncall Rotation', 'Q3 Roadmap']);
  oneOne('p11', 27, 'Good quarter, no concerns.', 1, ['Oncall Rotation']);
  pulse('p11', 6, 4);
  pulse('p11', 13, 4);
  perf('p11', 100, 'H1', 6, 'Avery Chen');
  ooo('p11', 65);
  skill('p11', 120, 'Performance Profiling');

  // ─── Noor Haddad (p12) — high potential, nominated successor ─
  oneOne('p12', 7, 'Discussed growth opportunities and a stretch assignment leading the platform migration tooling; Noor is interested in the next level and asked about the career path toward a Director scope.', 1, ['Platform Migration', 'Mentoring', 'Succession Planning'], ['Share director readiness rubric'], true);
  oneOne('p12', 21, 'Reviewed mentoring impact and Q3 roadmap contributions. Strong quarter.', 1, ['Mentoring', 'Platform Migration']);
  pulse('p12', 5, 5);
  pulse('p12', 12, 4);
  perf('p12', 100, 'H1', 8, 'Avery Chen');
  perf('p12', 15, 'H2-checkin', 9, 'Avery Chen');
  skill('p12', 160, 'Technical Leadership');
  skill('p12', 100, 'System Architecture');
  skill('p12', 30, 'Roadmap Planning');
  ooo('p12', 75);
  push('person.succession.nominated', { incumbentId: 'p2', nomineeId: 'p12', role: 'Director of Engineering', nominatorId: 'p1', readiness: 0.5, date: daysAgo(12) }, daysAgo(12));

  // ─── GTM team ──────────────────────────────────────────────
  oneOne('p3', 12, 'Pipeline review and Q3 targets check-in. Strategic plan alignment solid.', 1, ['Strategic Plan', 'Pipeline Review', 'Q3 Targets']);
  oneOne('p3', 26, 'Renewals tracking well against plan.', 1, ['Pipeline Review', 'Customer Renewals']);
  pulse('p3', 6, 4);
  pulse('p3', 13, 4);
  perf('p3', 100, 'H1', 8, 'Jordan Lee');
  ooo('p3', 58);

  oneOne('p13', 10, 'Pipeline review — strong quarter, renewals on track.', 1, ['Pipeline Review', 'Customer Renewals', 'Q3 Targets']);
  oneOne('p13', 24, 'Discussed account strategy for key renewals.', 1, ['Pipeline Review', 'Customer Renewals']);
  pulse('p13', 6, 4);
  pulse('p13', 13, 4);
  perf('p13', 100, 'H1', 7, 'Morgan Diaz');
  ooo('p13', 66);

  oneOne('p14', 25, 'Pipeline coverage a bit light this cycle; discussed prospecting cadence.', 0, ['Pipeline Review', 'Customer Renewals']);
  oneOne('p14', 48, 'Good energy, ramping well on renewals motion.', 1, ['Customer Renewals']);
  pulse('p14', 8, 3);
  pulse('p14', 15, 3);
  perf('p14', 100, 'H1', 6, 'Morgan Diaz');

  oneOne('p15', 14, 'Messaging refresh launched successfully; Q3 targets on pace.', 1, ['Messaging Refresh', 'Q3 Targets']);
  oneOne('p15', 29, 'Campaign retro — solid results, some learnings on timing.', 1, ['Messaging Refresh']);
  pulse('p15', 7, 4);
  pulse('p15', 14, 5);
  perf('p15', 100, 'H1', 7, 'Morgan Diaz');
  ooo('p15', 72);
  goalSet('p15', 'g-p15-1', 60, 'Launch new positioning across channels', daysAgo(0));
  goalClosed('p15', 'g-p15-1', 20, 'achieved');

  return events;
}
