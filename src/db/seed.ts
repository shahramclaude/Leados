// src/db/seed.ts
//
// Idempotent demo-data seeding so the People Intelligence view has
// something meaningful to show on a fresh database, without requiring a
// manual seed step. Called lazily (and cheaply, via a COUNT check) from
// the intelligence API route.

import { db } from "@/db";
import { leadosEvents, oneOnOnes, orgEdges, people } from "@/db/schema";
import { sql } from "drizzle-orm";

interface SeedPerson {
  name: string;
  role: string;
  team: string;
  manager?: string;
  email: string;
  startDate: string;
  skills: string[];
  performanceScore: number;
  promotionReadiness: number;
  growthVelocity: number;
  compensationFlag: boolean;
}

const SEED_PEOPLE: SeedPerson[] = [
  { name: "Ava Chen", role: "Engineering Manager", team: "Platform", email: "ava.chen@leados.dev", startDate: "2019-03-01", skills: ["leadership", "systems-design", "golang", "mentoring", "roadmapping"], performanceScore: 88, promotionReadiness: 70, growthVelocity: 0.7, compensationFlag: false },
  { name: "Marcus Reed", role: "Staff Engineer", team: "Platform", manager: "Ava Chen", email: "marcus.reed@leados.dev", startDate: "2018-06-15", skills: ["golang", "distributed-systems", "kubernetes", "mentoring", "security", "observability"], performanceScore: 91, promotionReadiness: 40, growthVelocity: 0.5, compensationFlag: true },
  { name: "Priya Nair", role: "Senior Engineer", team: "Platform", manager: "Ava Chen", email: "priya.nair@leados.dev", startDate: "2021-01-11", skills: ["golang", "kubernetes", "observability"], performanceScore: 76, promotionReadiness: 65, growthVelocity: 0.8, compensationFlag: false },
  { name: "Jonas Keller", role: "Engineer II", team: "Platform", manager: "Ava Chen", email: "jonas.keller@leados.dev", startDate: "2022-09-01", skills: ["golang", "ci-cd"], performanceScore: 58, promotionReadiness: 35, growthVelocity: 0.3, compensationFlag: false },
  { name: "Sofia Alvarez", role: "Product Manager", team: "Growth", email: "sofia.alvarez@leados.dev", startDate: "2020-02-20", skills: ["roadmapping", "experimentation", "analytics", "stakeholder-mgmt", "pricing"], performanceScore: 84, promotionReadiness: 75, growthVelocity: 0.75, compensationFlag: false },
  { name: "Derek Owusu", role: "Senior PM", team: "Growth", manager: "Sofia Alvarez", email: "derek.owusu@leados.dev", startDate: "2017-11-05", skills: ["roadmapping", "analytics", "pricing", "stakeholder-mgmt"], performanceScore: 72, promotionReadiness: 25, growthVelocity: 0.2, compensationFlag: true },
  { name: "Lena Novak", role: "Product Analyst", team: "Growth", manager: "Sofia Alvarez", email: "lena.novak@leados.dev", startDate: "2023-04-10", skills: ["analytics", "sql"], performanceScore: 66, promotionReadiness: 55, growthVelocity: 0.6, compensationFlag: false },
  { name: "Omar Haddad", role: "Design Lead", team: "Design", email: "omar.haddad@leados.dev", startDate: "2016-08-01", skills: ["design-systems", "leadership", "research", "prototyping", "accessibility"], performanceScore: 80, promotionReadiness: 30, growthVelocity: 0.35, compensationFlag: false },
  { name: "Yuki Tanaka", role: "Product Designer", team: "Design", manager: "Omar Haddad", email: "yuki.tanaka@leados.dev", startDate: "2022-01-17", skills: ["prototyping", "research"], performanceScore: 61, promotionReadiness: 45, growthVelocity: 0.55, compensationFlag: false },
  { name: "Grace Kim", role: "Sales Director", team: "Revenue", email: "grace.kim@leados.dev", startDate: "2015-05-19", skills: ["leadership", "negotiation", "forecasting", "enterprise-sales", "coaching"], performanceScore: 90, promotionReadiness: 20, growthVelocity: 0.25, compensationFlag: false },
  { name: "Tomas Horvat", role: "Account Executive", team: "Revenue", manager: "Grace Kim", email: "tomas.horvat@leados.dev", startDate: "2021-07-08", skills: ["negotiation", "enterprise-sales"], performanceScore: 54, promotionReadiness: 20, growthVelocity: 0.2, compensationFlag: true },
  { name: "Nadia Petrova", role: "Account Executive", team: "Revenue", manager: "Grace Kim", email: "nadia.petrova@leados.dev", startDate: "2023-10-02", skills: ["enterprise-sales"], performanceScore: 48, promotionReadiness: 30, growthVelocity: 0.4, compensationFlag: false },
];

const ONE_ON_ONE_NOTES: Record<string, string[]> = {
  "Marcus Reed": [
    "Marcus mentioned he's been reached out to by a recruiter from a competitor and is considering the opportunity seriously; says the offer from them would be a competitive offer well above market rate. He feels undervalued here and brought up that he deserves more given his scope. Energy was flat for most of the call.",
    "Still frustrated about the comp review outcome — feels he is below market compared to peers at other companies. Mentioned he is stretched thin covering two teams' on-call and it's not sustainable. No clear action items landed this time, ran out of time.",
    "Good technical discussion about the new service mesh rollout, he's excited about the architecture direction and proud of the launch last week. Some mention of being tired from the on-call rotation but overall more energized than last time. We agreed on next steps: he'll draft the RFC by Friday.",
  ],
  "Derek Owusu": [
    "Derek seems checking out lately — said he feels stuck and sees no growth path here after being passed over for the senior director role. Mentioned he's been thinking about leaving and has started a quiet job search. Very low energy on the call.",
    "Talked about the roadmap slip; he's frustrated and feels ignored when he raises concerns about resourcing. Said the politics around the reorg have been exhausting. No action items agreed.",
  ],
  "Jonas Keller": [
    "Jonas is new-ish and still ramping, mentioned he's been reading a lot and taking an online course on distributed systems to catch up, feeling motivated. We agreed he will pair with Priya on the next project as a stretch opportunity.",
  ],
  "Tomas Horvat": [
    "Tomas said he's overwhelmed with the pipeline and has been working weekends to hit quota; says he can't keep up and is exhausted. Also unclear on how comp is calculated this quarter, feels not fairly compensated versus teammates.",
    "Similar themes: overloaded, no time for the enablement training, mentioned he can't sleep before big calls. We agreed on reducing his account load by two logos as an action item.",
  ],
  "Omar Haddad": [
    "Omar is proud of the design system adoption and feels aligned with the new product direction, good momentum this quarter. Brought up wanting more clarity on a path to a VP-level role — a career conversation about what's next for him specifically.",
  ],
  "Grace Kim": [
    "Grace is energized about the new enterprise segment and feels supported by leadership. Great team spirit on her side, no concerns raised. We agreed on a follow up action item to finalize the territory plan by next week.",
  ],
};

async function tableIsEmpty(): Promise<boolean> {
  const result = await db.execute<{ count: string }>(sql`select count(*)::text as count from people`);
  const row = result.rows[0] as { count: string } | undefined;
  return !row || row.count === "0";
}

export async function ensureSeedData(): Promise<void> {
  const empty = await tableIsEmpty();
  if (!empty) return;

  const nameToId = new Map<string, number>();

  for (const p of SEED_PEOPLE) {
    const [inserted] = await db
      .insert(people)
      .values({
        name: p.name,
        role: p.role,
        team: p.team,
        managerId: null,
        email: p.email,
        startDate: p.startDate,
        status: "active",
        skills: p.skills,
        performanceScore: p.performanceScore,
        promotionReadiness: p.promotionReadiness,
        growthVelocity: p.growthVelocity,
        compensationFlag: p.compensationFlag,
      })
      .returning({ id: people.id });
    nameToId.set(p.name, inserted.id);
  }

  for (const p of SEED_PEOPLE) {
    if (p.manager && nameToId.has(p.manager)) {
      await db
        .update(people)
        .set({ managerId: nameToId.get(p.manager) })
        .where(sql`${people.id} = ${nameToId.get(p.name)}`);
    }
  }

  const today = new Date();
  for (const [name, notesList] of Object.entries(ONE_ON_ONE_NOTES)) {
    const personId = nameToId.get(name);
    if (!personId) continue;
    const managerId = SEED_PEOPLE.find((p) => p.name === name)?.manager
      ? nameToId.get(SEED_PEOPLE.find((p) => p.name === name)!.manager!)
      : null;

    for (let i = 0; i < notesList.length; i++) {
      const daysAgo = (notesList.length - i - 1) * 14;
      const date = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      await db.insert(oneOnOnes).values({
        personId,
        managerId: managerId ?? null,
        date: date.toISOString().slice(0, 10),
        notes: notesList[i],
      });
    }
  }

  // A light collaboration graph: within-team ties plus a couple of
  // cross-team bridges, and some pulse/review events for burnout +
  // performance-trend inputs.
  const idFor = (n: string) => nameToId.get(n)!;
  const edgePairs: Array<[string, string, number]> = [
    ["Ava Chen", "Marcus Reed", 0.9],
    ["Ava Chen", "Priya Nair", 0.7],
    ["Ava Chen", "Jonas Keller", 0.6],
    ["Marcus Reed", "Priya Nair", 0.5],
    ["Priya Nair", "Jonas Keller", 0.4],
    ["Sofia Alvarez", "Derek Owusu", 0.8],
    ["Sofia Alvarez", "Lena Novak", 0.6],
    ["Derek Owusu", "Lena Novak", 0.3],
    ["Omar Haddad", "Yuki Tanaka", 0.7],
    ["Grace Kim", "Tomas Horvat", 0.6],
    ["Grace Kim", "Nadia Petrova", 0.5],
    ["Tomas Horvat", "Nadia Petrova", 0.2],
    ["Marcus Reed", "Sofia Alvarez", 0.3],
    ["Ava Chen", "Grace Kim", 0.2],
  ];
  for (const [a, b, weight] of edgePairs) {
    await db.insert(orgEdges).values({ sourceId: idFor(a), targetId: idFor(b), weight });
  }

  const pulseByName: Record<string, number> = {
    "Marcus Reed": 0.35,
    "Derek Owusu": 0.3,
    "Tomas Horvat": 0.32,
    "Ava Chen": 0.8,
    "Priya Nair": 0.75,
    "Jonas Keller": 0.6,
    "Sofia Alvarez": 0.78,
    "Lena Novak": 0.7,
    "Omar Haddad": 0.72,
    "Yuki Tanaka": 0.65,
    "Grace Kim": 0.85,
    "Nadia Petrova": 0.6,
  };
  for (const [name, psi] of Object.entries(pulseByName)) {
    await db.insert(leadosEvents).values({
      personId: idFor(name),
      type: "pulse",
      psychologicalSafetyIndex: psi,
      payload: {},
    });
  }

  for (const p of SEED_PEOPLE) {
    await db.insert(leadosEvents).values({
      personId: idFor(p.name),
      type: "review",
      psychologicalSafetyIndex: null,
      payload: { rating: Math.max(0, p.performanceScore - 6) },
    });
    await db.insert(leadosEvents).values({
      personId: idFor(p.name),
      type: "review",
      psychologicalSafetyIndex: null,
      payload: { rating: p.performanceScore },
    });
  }
}
