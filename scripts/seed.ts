// Seeds a small, realistic demo population so the UI and test scripts have
// something to exercise. Run with: npx tsx scripts/seed.ts
import "dotenv/config";
import { db, pool } from "../src/db";
import {
  actors,
  teams,
  people,
  events,
  oneOnOnes,
  commitments,
  growthPlans,
  skills,
  personSkills,
  roleSkills,
  collaborations,
  attritionOutcomes,
} from "../src/db/schema";
import { newId } from "../src/lib/ids";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  console.log("Clearing existing demo data...");
  await db.delete(commitments);
  await db.delete(oneOnOnes);
  await db.delete(growthPlans);
  await db.delete(personSkills);
  await db.delete(roleSkills);
  await db.delete(skills);
  await db.delete(collaborations);
  await db.delete(attritionOutcomes);
  await db.delete(events);
  await db.delete(people);
  await db.delete(teams);
  await db.delete(actors);

  console.log("Inserting actors...");
  await db.insert(actors).values([
    { id: "hr_casey", name: "Casey Nwosu", email: "casey.nwosu@leados.example", globalRole: "hr" },
    { id: "exec_taylor", name: "Taylor Brooks", email: "taylor.brooks@leados.example", globalRole: "executive" },
    { id: "mgr_dana", name: "Dana Kim", email: "dana.kim@leados.example", globalRole: "manager" },
    { id: "mgr_jordan", name: "Jordan Lee", email: "jordan.lee@leados.example", globalRole: "manager" },
    { id: "emp_alex", name: "Alex Rivera", email: "alex.rivera@leados.example", globalRole: "employee" },
    { id: "emp_priya", name: "Priya Shah", email: "priya.shah@leados.example", globalRole: "employee" },
    { id: "emp_omar", name: "Omar Haddad", email: "omar.haddad@leados.example", globalRole: "employee" },
    { id: "emp_mina", name: "Mina Chen", email: "mina.chen@leados.example", globalRole: "employee" },
    { id: "emp_sam", name: "Sam Okafor", email: "sam.okafor@leados.example", globalRole: "employee" },
    { id: "emp_jules", name: "Jules Varga", email: "jules.varga@leados.example", globalRole: "employee" },
  ]);

  console.log("Inserting teams...");
  await db.insert(teams).values([
    { id: "team_platform", name: "Platform Engineering", managerId: "mgr_dana" },
    { id: "team_product", name: "Product", managerId: "mgr_jordan" },
  ]);

  console.log("Inserting people...");
  await db.insert(people).values([
    {
      id: "emp_alex",
      teamId: "team_platform",
      managerId: "mgr_dana",
      title: "Senior Software Engineer",
      role: "Senior Engineer",
      tenureStart: daysAgo(900).toISOString().slice(0, 10),
      compaRatio: "0.97",
      location: "Remote-US",
      status: "active",
    },
    {
      id: "emp_priya",
      teamId: "team_platform",
      managerId: "mgr_dana",
      title: "Software Engineer",
      role: "Engineer",
      tenureStart: daysAgo(420).toISOString().slice(0, 10),
      compaRatio: "0.84",
      location: "Remote-US",
      status: "active",
    },
    {
      id: "emp_omar",
      teamId: "team_platform",
      managerId: "mgr_dana",
      title: "Senior Software Engineer",
      role: "Senior Engineer",
      tenureStart: daysAgo(1400).toISOString().slice(0, 10),
      compaRatio: "1.05",
      location: "Berlin",
      status: "active",
    },
    {
      id: "emp_jules",
      teamId: "team_platform",
      managerId: "mgr_dana",
      title: "Software Engineer",
      role: "Engineer",
      tenureStart: daysAgo(500).toISOString().slice(0, 10),
      compaRatio: "0.80",
      location: "Remote-US",
      status: "terminated",
      terminatedAt: daysAgo(40),
    },
    {
      id: "emp_mina",
      teamId: "team_product",
      managerId: "mgr_jordan",
      title: "Product Manager",
      role: "Product Manager",
      tenureStart: daysAgo(600).toISOString().slice(0, 10),
      compaRatio: "1.02",
      location: "NYC",
      status: "active",
    },
    {
      id: "emp_sam",
      teamId: "team_product",
      managerId: "mgr_jordan",
      title: "Product Designer",
      role: "Designer",
      tenureStart: daysAgo(250).toISOString().slice(0, 10),
      compaRatio: "0.9",
      location: "NYC",
      status: "active",
    },
    {
      id: "mgr_dana",
      teamId: "team_platform",
      managerId: "exec_taylor",
      title: "Engineering Manager",
      role: "Engineering Manager",
      tenureStart: daysAgo(1100).toISOString().slice(0, 10),
      compaRatio: "1.0",
      location: "Remote-US",
      status: "active",
    },
    {
      id: "mgr_jordan",
      teamId: "team_product",
      managerId: "exec_taylor",
      title: "Group Product Manager",
      role: "Engineering Manager",
      tenureStart: daysAgo(1300).toISOString().slice(0, 10),
      compaRatio: "1.0",
      location: "NYC",
      status: "active",
    },
  ]);

  await db.insert(attritionOutcomes).values([
    { personId: "emp_jules", leftAt: daysAgo(40).toISOString().slice(0, 10), leftVoluntary: true },
    { personId: "emp_alex", leftAt: null, leftVoluntary: null },
    { personId: "emp_priya", leftAt: null, leftVoluntary: null },
    { personId: "emp_omar", leftAt: null, leftVoluntary: null },
    { personId: "emp_mina", leftAt: null, leftVoluntary: null },
    { personId: "emp_sam", leftAt: null, leftVoluntary: null },
  ]);

  console.log("Inserting skills & role requirements...");
  const skillRows = [
    { id: "sk_backend", name: "Backend Systems", category: "engineering" },
    { id: "sk_distsys", name: "Distributed Systems", category: "engineering" },
    { id: "sk_leadership", name: "Leadership & Mentoring", category: "management" },
    { id: "sk_stakeholder", name: "Stakeholder Communication", category: "management" },
    { id: "sk_product", name: "Product Strategy", category: "product" },
    { id: "sk_data", name: "Data Analysis", category: "product" },
    { id: "sk_design", name: "Design Systems", category: "design" },
    { id: "sk_research", name: "User Research", category: "design" },
  ];
  await db.insert(skills).values(skillRows);

  await db.insert(roleSkills).values([
    { id: newId("rs"), role: "Senior Engineer", skillId: "sk_backend", requiredLevel: 4 },
    { id: newId("rs"), role: "Senior Engineer", skillId: "sk_distsys", requiredLevel: 3 },
    { id: newId("rs"), role: "Senior Engineer", skillId: "sk_leadership", requiredLevel: 2 },
    { id: newId("rs"), role: "Engineering Manager", skillId: "sk_leadership", requiredLevel: 4 },
    { id: newId("rs"), role: "Engineering Manager", skillId: "sk_backend", requiredLevel: 3 },
    { id: newId("rs"), role: "Engineering Manager", skillId: "sk_stakeholder", requiredLevel: 3 },
    { id: newId("rs"), role: "Product Manager", skillId: "sk_product", requiredLevel: 4 },
    { id: newId("rs"), role: "Product Manager", skillId: "sk_stakeholder", requiredLevel: 3 },
    { id: newId("rs"), role: "Product Manager", skillId: "sk_data", requiredLevel: 2 },
    { id: newId("rs"), role: "Designer", skillId: "sk_design", requiredLevel: 4 },
    { id: newId("rs"), role: "Designer", skillId: "sk_research", requiredLevel: 3 },
  ]);

  await db.insert(personSkills).values([
    { id: newId("psk"), personId: "emp_alex", skillId: "sk_backend", level: 4, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_alex", skillId: "sk_distsys", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_alex", skillId: "sk_leadership", level: 3, source: "declared", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_priya", skillId: "sk_backend", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_priya", skillId: "sk_distsys", level: 2, source: "declared", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_priya", skillId: "sk_leadership", level: 1, source: "declared", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_omar", skillId: "sk_backend", level: 5, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_omar", skillId: "sk_distsys", level: 4, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_omar", skillId: "sk_leadership", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_mina", skillId: "sk_product", level: 4, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_mina", skillId: "sk_stakeholder", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_mina", skillId: "sk_data", level: 3, source: "declared", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_sam", skillId: "sk_design", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "emp_sam", skillId: "sk_research", level: 2, source: "declared", evidenceEventIds: [] },
    { id: newId("psk"), personId: "mgr_dana", skillId: "sk_leadership", level: 4, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "mgr_dana", skillId: "sk_backend", level: 3, source: "observed", evidenceEventIds: [] },
    { id: newId("psk"), personId: "mgr_dana", skillId: "sk_stakeholder", level: 4, source: "observed", evidenceEventIds: [] },
  ]);

  console.log("Inserting events...");
  const evt = async (type: string, entityType: "person", entityId: string, payload: Record<string, unknown>, occurredAt: Date, actorId?: string) => {
    await db.insert(events).values({
      id: newId("evt"),
      type,
      entityType,
      entityId,
      payload,
      actorId: actorId ?? null,
      occurredAt,
      recordedAt: occurredAt,
    });
  };

  for (const p of ["emp_alex", "emp_priya", "emp_omar", "emp_mina", "emp_sam", "emp_jules", "mgr_dana", "mgr_jordan"]) {
    await evt("PERSON_HIRED", "person", p, { title: "Hired" }, daysAgo(900));
    await evt("CONSENT_GRANTED", "person", p, { scope: "people_analytics" }, daysAgo(899));
  }
  await evt("MANAGER_CHANGED", "person", "emp_priya", { managerId: "mgr_dana" }, daysAgo(70));
  await evt("COMPA_RATIO_UPDATED", "person", "emp_priya", { compaRatio: 0.84 }, daysAgo(200));
  await evt("SKILL_OBSERVED", "person", "emp_alex", { skillId: "sk_backend" }, daysAgo(30));
  await evt("SKILL_OBSERVED", "person", "emp_priya", { skillId: "sk_backend" }, daysAgo(200));

  console.log("Inserting 1:1s and commitments...");
  async function seedOneOnOnes(managerId: string, employeeId: string, heldDaysAgoList: number[], follow: ("kept" | "slipped" | "open")[]) {
    for (let i = 0; i < heldDaysAgoList.length; i++) {
      const id = newId("o3");
      const heldAt = daysAgo(heldDaysAgoList[i]);
      await db.insert(oneOnOnes).values({
        id,
        managerId,
        employeeId,
        scheduledAt: heldAt,
        heldAt,
        status: "held",
        agendaJson: [{ id: newId("ag"), text: "Priorities check-in", addedBy: managerId }],
        sharedNotesJson: [{ text: "Discussed current sprint priorities." }],
        privateNotesJson: [{ text: "Manager prep: keep an eye on workload." }],
      });
      await evt("ONE_ON_ONE_HELD", "person", employeeId, { oneOnOneId: id }, heldAt, managerId);
      const status = follow[i] ?? "open";
      const commitId = newId("cmt");
      await db.insert(commitments).values({
        id: commitId,
        oneOnOneId: id,
        ownerId: employeeId,
        description: "Follow up on sprint deliverable",
        status,
        createdAt: heldAt,
        resolvedAt: status === "open" ? null : heldAt,
      });
      await evt("COMMITMENT_CREATED", "person", employeeId, { commitmentId: commitId }, heldAt, managerId);
      if (status !== "open") {
        await evt("COMMITMENT_RESOLVED", "person", employeeId, { commitmentId: commitId, status }, heldAt, employeeId);
      }
    }
  }

  // Alex: healthy cadence, strong follow-through.
  await seedOneOnOnes("mgr_dana", "emp_alex", [10, 24, 38], ["kept", "kept", "kept"]);
  // Priya: stale cadence, mixed follow-through — higher flight-risk signal.
  await seedOneOnOnes("mgr_dana", "emp_priya", [95, 140], ["slipped", "slipped"]);
  // Omar: healthy.
  await seedOneOnOnes("mgr_dana", "emp_omar", [8, 22], ["kept", "kept"]);
  // Mina / Sam: moderate.
  await seedOneOnOnes("mgr_jordan", "emp_mina", [14, 30], ["kept", "slipped"]);
  await seedOneOnOnes("mgr_jordan", "emp_sam", [60], ["open"]);

  console.log("Inserting growth plans...");
  await db.insert(growthPlans).values([
    {
      id: newId("gp"),
      personId: "emp_alex",
      title: "Path to Engineering Manager",
      targetSkillId: "sk_leadership",
      milestonesJson: [
        { id: newId("ms"), title: "Lead a cross-team initiative", status: "done", evidenceEventIds: [] },
        { id: newId("ms"), title: "Mentor two engineers", status: "in_progress", evidenceEventIds: [] },
      ],
      updatedAt: daysAgo(20),
    },
    {
      id: newId("gp"),
      personId: "emp_priya",
      title: "Deepen distributed systems depth",
      targetSkillId: "sk_distsys",
      milestonesJson: [{ id: newId("ms"), title: "Own an on-call rotation", status: "planned", evidenceEventIds: [] }],
      updatedAt: daysAgo(210),
    },
  ]);
  await evt("GROWTH_PLAN_CREATED", "person", "emp_alex", { title: "Path to Engineering Manager" }, daysAgo(60));

  console.log("Inserting collaboration metadata...");
  const collabPairs: [string, string, string][] = [
    ["emp_alex", "emp_priya", "project"],
    ["emp_alex", "emp_omar", "review"],
    ["emp_priya", "emp_omar", "meeting"],
    ["mgr_dana", "emp_alex", "one_on_one"],
    ["mgr_dana", "emp_priya", "one_on_one"],
    ["mgr_dana", "emp_omar", "one_on_one"],
    ["emp_mina", "emp_sam", "project"],
    ["mgr_jordan", "emp_mina", "one_on_one"],
  ];
  for (const [a, b, ctx] of collabPairs) {
    for (let i = 0; i < 4; i++) {
      await db.insert(collaborations).values({
        id: newId("collab"),
        personId: a,
        counterpartId: b,
        context: ctx,
        occurredAt: daysAgo(i * 6 + 1),
        durationMinutes: ctx === "one_on_one" ? 30 : 45,
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
