// Idempotent local dev seed for Part 5 — People & Organization Intelligence.
// Run with `npm run db:seed` after `npm run db:push`.
//
// Creates two teams, six people spanning self/manager/hr/exec/peer roles,
// a realistic event history (hires, growth conversations, a compensation
// review, skill evidence, a manager change), a couple of 1:1s with
// commitments, a growth plan, a succession role + candidates, consent
// records, and collaboration metadata (meetings/messages — no content).

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows: existing } = await pool.query("select count(*)::int as count from people");
  if (existing[0].count > 0) {
    console.log(`Seed skipped: people table already has ${existing[0].count} row(s).`);
    await pool.end();
    return;
  }

  console.log("Seeding LEADOS people-intelligence demo data...");

  const { rows: [platformTeam] } = await pool.query(
    `insert into teams (name, department) values ('Platform Engineering', 'Engineering') returning id`,
  );
  const { rows: [peopleOpsTeam] } = await pool.query(
    `insert into teams (name, department) values ('People Ops', 'People') returning id`,
  );

  async function insertPerson(p) {
    const { rows: [row] } = await pool.query(
      `insert into people (display_name, email, title, team_id, manager_id, hire_date, location, compa_ratio, skills, goals)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [p.displayName, p.email, p.title, p.teamId, p.managerId, p.hireDate, p.location, p.compaRatio, JSON.stringify(p.skills ?? []), JSON.stringify(p.goals ?? [])],
    );
    return row.id;
  }

  const alexId = await insertPerson({
    displayName: "Alex Chen",
    email: "alex.chen@leados.example",
    title: "VP Engineering",
    teamId: platformTeam.id,
    managerId: null,
    hireDate: "2019-03-01",
    location: "Remote - US",
    compaRatio: 1.12,
    skills: [{ skill: "Org design", level: 5 }],
    goals: [{ title: "Grow platform org to 40 engineers", status: "on_track" }],
  });

  const priyaId = await insertPerson({
    displayName: "Priya Shah",
    email: "priya.shah@leados.example",
    title: "Engineering Manager, Platform",
    teamId: platformTeam.id,
    managerId: alexId,
    hireDate: "2021-06-15",
    location: "Remote - US",
    compaRatio: 1.04,
    skills: [{ skill: "People management", level: 4 }],
    goals: [{ title: "Ship v2 platform migration", status: "on_track" }],
  });

  const danaId = await insertPerson({
    displayName: "Dana Kim",
    email: "dana.kim@leados.example",
    title: "Senior Software Engineer",
    teamId: platformTeam.id,
    managerId: priyaId,
    hireDate: "2022-02-01",
    location: "Remote - US",
    compaRatio: 0.91,
    skills: [
      { skill: "Distributed systems", level: 4 },
      { skill: "TypeScript", level: 5 },
    ],
    goals: [
      { title: "Lead the event-schema migration", status: "at_risk" },
      { title: "Mentor two junior engineers", status: "on_track" },
    ],
  });

  const samId = await insertPerson({
    displayName: "Sam Okafor",
    email: "sam.okafor@leados.example",
    title: "Software Engineer",
    teamId: platformTeam.id,
    managerId: priyaId,
    hireDate: "2023-09-11",
    location: "Remote - EU",
    compaRatio: 1.0,
    skills: [{ skill: "TypeScript", level: 3 }],
    goals: [{ title: "Own on-call runbook rewrite", status: "on_track" }],
  });

  const taylorId = await insertPerson({
    displayName: "Taylor Nguyen",
    email: "taylor.nguyen@leados.example",
    title: "Software Engineer I",
    teamId: platformTeam.id,
    managerId: priyaId,
    hireDate: "2025-12-01",
    location: "Remote - US",
    compaRatio: 1.0,
    skills: [{ skill: "TypeScript", level: 2 }],
    goals: [{ title: "Complete onboarding checklist", status: "on_track" }],
  });

  const jordanId = await insertPerson({
    displayName: "Jordan Rivera",
    email: "jordan.rivera@leados.example",
    title: "HR Business Partner",
    teamId: peopleOpsTeam.id,
    managerId: null,
    hireDate: "2020-01-10",
    location: "Remote - US",
    compaRatio: 1.02,
    skills: [{ skill: "Employee relations", level: 5 }],
    goals: [{ title: "Roll out transparency-report UX", status: "on_track" }],
  });

  async function recordEvent(type, version, subjectId, actorId, payload, occurredAt) {
    await pool.query(
      `insert into events (type, version, payload, subject_id, actor_id, occurred_at) values ($1,$2,$3,$4,$5,$6)`,
      [type, version, JSON.stringify(payload), subjectId, actorId, occurredAt ?? new Date()],
    );
  }

  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

  await recordEvent("person.hired", 1, danaId, null, { personId: danaId, title: "Senior Software Engineer", teamId: platformTeam.id, managerId: priyaId, hireDate: "2022-02-01" }, daysAgo(700));
  await recordEvent("person.manager_changed", 1, danaId, alexId, { personId: danaId, fromManagerId: alexId, toManagerId: priyaId }, daysAgo(120));
  await recordEvent("person.compensation_reviewed", 1, danaId, jordanId, { personId: danaId, compaRatio: 0.91 }, daysAgo(200));
  await recordEvent("person.skill_evidenced", 1, danaId, priyaId, { personId: danaId, skill: "Distributed systems", level: 4, evidence: "Led the Q4 schema migration." }, daysAgo(210));
  await recordEvent("person.growth_conversation_held", 1, danaId, priyaId, { personId: danaId, managerId: priyaId, topics: ["staff-engineer path"] }, daysAgo(150));

  await recordEvent("person.hired", 1, samId, null, { personId: samId, title: "Software Engineer", teamId: platformTeam.id, managerId: priyaId, hireDate: "2023-09-11" }, daysAgo(500));
  await recordEvent("person.growth_conversation_held", 1, samId, priyaId, { personId: samId, managerId: priyaId, topics: ["on-call ownership"] }, daysAgo(20));

  await recordEvent("person.hired", 1, taylorId, null, { personId: taylorId, title: "Software Engineer I", teamId: platformTeam.id, managerId: priyaId, hireDate: "2025-12-01" }, daysAgo(45));

  // Collaboration metadata — meetings and messages, no content.
  for (let i = 0; i < 8; i += 1) {
    await recordEvent(
      "collaboration.meeting_logged",
      1,
      null,
      priyaId,
      { meetingId: `platform-standup-${i}`, participantIds: [priyaId, danaId, samId, taylorId], organizerId: priyaId, durationMinutes: 15, recurring: true, occurredAt: daysAgo(i * 7).toISOString() },
      daysAgo(i * 7),
    );
  }
  await recordEvent("collaboration.meeting_logged", 1, null, priyaId, { meetingId: "onboard-taylor-1", participantIds: [priyaId, taylorId], organizerId: priyaId, durationMinutes: 45, recurring: false, occurredAt: daysAgo(40).toISOString() }, daysAgo(40));
  await recordEvent("collaboration.message_logged", 1, null, danaId, { fromId: danaId, toId: jordanId, channel: "chat", occurredAt: daysAgo(10).toISOString() }, daysAgo(10));
  await recordEvent("collaboration.message_logged", 1, null, samId, { fromId: samId, toId: jordanId, channel: "chat", occurredAt: daysAgo(9).toISOString() }, daysAgo(9));

  // 1:1s with commitments (one completed with private manager notes, one upcoming).
  const commitmentsDone = [
    { id: "c1", text: "Draft staff-engineer narrative", owner: "person", dueDate: daysAgo(90).toISOString(), status: "done", completedAt: daysAgo(85).toISOString() },
    { id: "c2", text: "Schedule skip-level with Alex", owner: "manager", dueDate: daysAgo(80).toISOString(), status: "missed", completedAt: daysAgo(70).toISOString() },
  ];
  const { rows: [oneOnOne1] } = await pool.query(
    `insert into one_on_ones (person_id, manager_id, scheduled_at, status, shared_agenda, talking_point_suggestions, commitments, private_manager_notes, shared_summary, completed_at)
     values ($1,$2,$3,'completed',$4,$5,$6,$7,$8,$9) returning id`,
    [
      danaId,
      priyaId,
      daysAgo(95),
      JSON.stringify(["Career growth", "Migration status"]),
      JSON.stringify([{ topic: "Career growth check-in", reason: "No growth conversation recorded in 90+ days at the time.", sourceSignal: "growth_conversation_recency" }]),
      JSON.stringify(commitmentsDone),
      "Dana seems energized by the migration but worried about visibility to leadership. Worth a skip-level.",
      "Discussed staff-engineer path and the Q4 migration. Dana will draft a promotion narrative.",
      daysAgo(90),
    ],
  );
  await recordEvent("oneonone.completed", 1, danaId, priyaId, { oneOnOneId: oneOnOne1.id, personId: danaId, managerId: priyaId, commitmentCount: 2 }, daysAgo(90));

  await pool.query(
    `insert into one_on_ones (person_id, manager_id, scheduled_at, status, shared_agenda, talking_point_suggestions, commitments)
     values ($1,$2,$3,'scheduled',$4,$5,$6)`,
    [
      danaId,
      priyaId,
      daysAgo(-3),
      JSON.stringify(["Migration retro"]),
      JSON.stringify([{ topic: "Revisit missed commitments", reason: "1 commitment(s) from prior 1:1s were missed.", sourceSignal: "commitment_follow_through" }]),
      JSON.stringify([]),
    ],
  );

  // Growth plan + milestone.
  const { rows: [plan] } = await pool.query(
    `insert into growth_plans (person_id, title, status) values ($1,'Path to Staff Engineer','active') returning id`,
    [danaId],
  );
  await pool.query(
    `insert into growth_milestones (plan_id, title, skill, target_date, completed_at, evidence)
     values ($1,'Lead a cross-team technical review','Technical leadership',$2,$3,$4)`,
    [plan.id, "2026-03-01", daysAgo(210), JSON.stringify(["Led the Q4 schema migration design review."])],
  );
  await pool.query(
    `insert into growth_milestones (plan_id, title, skill, target_date)
     values ($1,'Publish an internal RFC','Technical writing',$2)`,
    [plan.id, "2026-04-15"],
  );

  // Succession: Engineering Manager, Platform.
  const { rows: [role] } = await pool.query(
    `insert into succession_roles (title, team_id, criticality, incumbent_id) values ($1,$2,'critical',$3) returning id`,
    ["Engineering Manager, Platform", platformTeam.id, priyaId],
  );
  await pool.query(
    `insert into succession_candidates (role_id, person_id, readiness, confidence, evidence, gap_plan)
     values ($1,$2,'ready_later',0.65,$3,$4)`,
    [role.id, danaId, JSON.stringify(["Led the Q4 schema migration.", "Mentors two junior engineers."]), "Needs direct-report management experience; consider a team-lead rotation."],
  );
  await pool.query(
    `insert into succession_candidates (role_id, person_id, readiness, confidence, evidence, gap_plan)
     values ($1,$2,'develop',0.3,$3,$4)`,
    [role.id, samId, JSON.stringify(["Owns the on-call runbook rewrite."]), "Early career; needs 18+ months before management readiness."],
  );

  // Consent records.
  await pool.query(
    `insert into consent_records (person_id, notice_version, scope, granted) values ($1,'2026-01-people-analytics-v1','flight-risk-scoring', true)`,
    [danaId],
  );
  await recordEvent("consent.recorded", 1, danaId, danaId, { personId: danaId, scope: "flight-risk-scoring", noticeVersion: "2026-01-people-analytics-v1", granted: true }, daysAgo(200));

  console.log("Seed complete:", { teams: [platformTeam.id, peopleOpsTeam.id], people: { alexId, priyaId, danaId, samId, taylorId, jordanId }, role: role.id, plan: plan.id });
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
