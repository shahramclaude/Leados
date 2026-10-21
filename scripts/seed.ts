// Deterministic seeding for reproducible "org worlds" (small/medium/large),
// used by every later part's tests. Re-running this script with the same
// `--size` and `--slug` is a no-op at the event-store level: entity ids and
// idempotency keys are derived purely from the seeded PRNG, so repeat runs
// replay the original events instead of duplicating them (see Phase 3,
// Idempotency).
//
// Usage: npx tsx scripts/seed.ts --size=small [--slug=leados-demo-small]

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import { createPrng, type Prng } from "../src/lib/platform/prng";
import { SYSTEM_ACTOR, type OrgContext } from "../src/lib/platform/orgContext";
import {
  orgUnitRepository,
  personRepository,
  roleRepository,
  skillRepository,
  objectiveRepository,
  keyResultRepository,
  decisionRepository,
  findingRepository,
  hypothesisRepository,
  riskRepository,
  initiativeRepository,
  budgetRepository,
  accountRepository,
  transactionRepository,
  policyRepository,
} from "../src/lib/platform/repositories";

type SizeConfig = {
  orgUnits: number;
  people: number;
  roles: number;
  skills: number;
  objectives: number;
  decisions: number;
  findings: number;
  hypotheses: number;
  risks: number;
  initiatives: number;
};

const SIZE_CONFIGS: Record<string, SizeConfig> = {
  small: { orgUnits: 3, people: 8, roles: 5, skills: 10, objectives: 4, decisions: 3, findings: 3, hypotheses: 2, risks: 3, initiatives: 2 },
  medium: { orgUnits: 8, people: 24, roles: 12, skills: 20, objectives: 12, decisions: 8, findings: 10, hypotheses: 6, risks: 8, initiatives: 6 },
  large: { orgUnits: 20, people: 80, roles: 25, skills: 35, objectives: 30, decisions: 20, findings: 24, hypotheses: 15, risks: 18, initiatives: 15 },
};

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const EPOCH = new Date("2024-01-01T00:00:00.000Z").getTime();

function tick(counter: { n: number }): string {
  counter.n += 1;
  return new Date(EPOCH + counter.n * 60_000).toISOString();
}

async function ensureOrg(slug: string, name: string, prng: Prng): Promise<string> {
  const existing = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1);
  if (existing.length > 0) return existing[0].id;
  const id = prng.uuid();
  await db.insert(schema.orgs).values({ id, name, slug });
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const size = args.size ?? "small";
  const config = SIZE_CONFIGS[size];
  if (!config) throw new Error(`unknown --size=${size}; expected small|medium|large`);
  const slug = args.slug ?? `leados-demo-${size}`;

  const prng = createPrng(`leados:${slug}`);
  const orgId = await ensureOrg(slug, `LEADOS Demo (${size})`, prng);
  const ctx: OrgContext = { orgId, actor: SYSTEM_ACTOR };
  const clock = { n: 0 };

  console.log(`Seeding org ${slug} (${orgId}) with size=${size}...`);

  const orgUnitIds: string[] = [];
  for (let i = 0; i < config.orgUnits; i++) {
    const id = prng.uuid();
    const parentOrgUnitId = i === 0 ? null : orgUnitIds[prng.int(orgUnitIds.length)];
    const kind = i === 0 ? "company" : (prng.pick(["division", "department", "team"]) as "division" | "department" | "team");
    await orgUnitRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: tick(clock), validTo: null, deletedAt: null, name: `${kind}-${i}`, parentOrgUnitId, kind },
      idempotencyKey: `seed:create:org_unit:${id}`,
      occurredAt: tick(clock),
    });
    orgUnitIds.push(id);
  }

  const skillIds: string[] = [];
  for (let i = 0; i < config.skills; i++) {
    const id = prng.uuid();
    await skillRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: tick(clock), validTo: null, deletedAt: null, name: `Skill ${i}`, category: prng.pick(["technical", "leadership", "domain"]) },
      idempotencyKey: `seed:create:skill:${id}`,
      occurredAt: tick(clock),
    });
    skillIds.push(id);
  }

  const roleIds: string[] = [];
  for (let i = 0; i < config.roles; i++) {
    const id = prng.uuid();
    await roleRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        title: `Role ${i}`,
        orgUnitId: orgUnitIds[prng.int(orgUnitIds.length)],
        skillIds: prng.shuffle(skillIds).slice(0, prng.intBetween(1, 3)),
      },
      idempotencyKey: `seed:create:role:${id}`,
      occurredAt: tick(clock),
    });
    roleIds.push(id);
  }

  const personIds: string[] = [];
  for (let i = 0; i < config.people; i++) {
    const id = prng.uuid();
    await personRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        displayName: `Person ${i}`,
        email: `person${i}@${slug}.example`,
        orgUnitId: orgUnitIds[prng.int(orgUnitIds.length)],
        roleIds: prng.shuffle(roleIds).slice(0, prng.intBetween(1, 2)),
        status: "active",
      },
      idempotencyKey: `seed:create:person:${id}`,
      occurredAt: tick(clock),
    });
    personIds.push(id);
  }

  const objectiveIds: string[] = [];
  for (let i = 0; i < config.objectives; i++) {
    const id = prng.uuid();
    const cascadeParentId = i > 1 && prng.bool(0.4) ? objectiveIds[prng.int(objectiveIds.length)] : null;
    await objectiveRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        title: `Objective ${i}`,
        description: `Deterministically seeded objective ${i}`,
        cascadeParentId,
        ownerId: personIds[prng.int(personIds.length)],
        status: prng.pick(["draft", "active", "at_risk"]),
      },
      idempotencyKey: `seed:create:objective:${id}`,
      occurredAt: tick(clock),
    });
    objectiveIds.push(id);

    const krCount = prng.intBetween(1, 3);
    for (let k = 0; k < krCount; k++) {
      const krId = prng.uuid();
      const baseline = prng.intBetween(0, 50);
      const target = baseline + prng.intBetween(10, 100);
      await keyResultRepository.create(ctx, {
        entity: {
          id: krId,
          orgId,
          version: 0,
          validFrom: tick(clock),
          validTo: null,
          deletedAt: null,
          objectiveId: id,
          title: `KR ${i}.${k}`,
          baseline,
          target,
          current: baseline + prng.int(target - baseline),
          unit: prng.pick(["%", "count", "$k"]),
          confidence: Math.round(prng.next() * 100) / 100,
        },
        idempotencyKey: `seed:create:key_result:${krId}`,
        occurredAt: tick(clock),
      });
    }
  }

  for (let i = 0; i < config.decisions; i++) {
    const id = prng.uuid();
    const options = [`Option A${i}`, `Option B${i}`, `Option C${i}`];
    const decided = prng.bool(0.6);
    await decisionRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        question: `Decision question ${i}?`,
        options,
        chosen: decided ? prng.pick(options) : null,
        decidedAt: decided ? tick(clock) : null,
        reviewAt: null,
        expectedOutcome: `Expected outcome ${i}`,
        actualOutcome: null,
        ownerId: personIds[prng.int(personIds.length)],
      },
      idempotencyKey: `seed:create:decision:${id}`,
      occurredAt: tick(clock),
    });
  }

  for (let i = 0; i < config.findings; i++) {
    const id = prng.uuid();
    await findingRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        title: `Finding ${i}`,
        severity: prng.intBetween(1, 5),
        evidenceRefs: [`doc://seed/${i}`],
        confidenceClass: prng.pick(["low", "medium", "high"]),
        ownerId: personIds[prng.int(personIds.length)],
      },
      idempotencyKey: `seed:create:finding:${id}`,
      occurredAt: tick(clock),
    });
  }

  for (let i = 0; i < config.hypotheses; i++) {
    const id = prng.uuid();
    const resolved = prng.bool(0.3);
    await hypothesisRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        statement: `Hypothesis ${i}`,
        prior: Math.round(prng.next() * 100) / 100,
        posterior: resolved ? Math.round(prng.next() * 100) / 100 : null,
        resolutionCriteria: `Resolves when metric ${i} crosses threshold`,
        ownerId: personIds[prng.int(personIds.length)],
      },
      idempotencyKey: `seed:create:hypothesis:${id}`,
      occurredAt: tick(clock),
    });
  }

  for (let i = 0; i < config.risks; i++) {
    const id = prng.uuid();
    await riskRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        title: `Risk ${i}`,
        likelihood: Math.round(prng.next() * 100) / 100,
        impact: Math.round(prng.next() * 100) / 100,
        velocity: prng.pick(["slow", "moderate", "fast"]),
        owner: personIds[prng.int(personIds.length)],
        mitigations: [`Mitigation ${i}.1`],
      },
      idempotencyKey: `seed:create:risk:${id}`,
      occurredAt: tick(clock),
    });
  }

  const budgetId = prng.uuid();
  await budgetRepository.create(ctx, {
    entity: {
      id: budgetId,
      orgId,
      version: 0,
      validFrom: tick(clock),
      validTo: null,
      deletedAt: null,
      name: "Annual Operating Budget",
      fiscalYear: 2024,
      totalAmount: 1_000_000,
      currency: "USD",
      ownerId: personIds[0],
    },
    idempotencyKey: `seed:create:budget:${budgetId}`,
    occurredAt: tick(clock),
  });

  const accountIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = prng.uuid();
    await accountRepository.create(ctx, {
      entity: { id, orgId, version: 0, validFrom: tick(clock), validTo: null, deletedAt: null, budgetId, name: `Account ${i}`, allocatedAmount: 100_000, spentAmount: 0 },
      idempotencyKey: `seed:create:account:${id}`,
      occurredAt: tick(clock),
    });
    accountIds.push(id);
  }

  for (let i = 0; i < accountIds.length * 2; i++) {
    const id = prng.uuid();
    await transactionRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        accountId: accountIds[i % accountIds.length],
        amount: prng.intBetween(100, 5000),
        currency: "USD",
        description: `Seed transaction ${i}`,
        postedAt: tick(clock),
      },
      idempotencyKey: `seed:create:transaction:${id}`,
      occurredAt: tick(clock),
    });
  }

  for (let i = 0; i < config.initiatives; i++) {
    const id = prng.uuid();
    await initiativeRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        title: `Initiative ${i}`,
        portfolio: prng.pick(["growth", "efficiency", "trust"]),
        budgetRef: budgetId,
        milestones: [{ name: `Milestone ${i}.1`, dueAt: tick(clock), completedAt: null }],
        ownerId: personIds[prng.int(personIds.length)],
      },
      idempotencyKey: `seed:create:initiative:${id}`,
      occurredAt: tick(clock),
    });
  }

  for (let i = 0; i < 2; i++) {
    const id = prng.uuid();
    await policyRepository.create(ctx, {
      entity: {
        id,
        orgId,
        version: 0,
        validFrom: tick(clock),
        validTo: null,
        deletedAt: null,
        name: `Policy ${i}`,
        description: `Seeded policy ${i}`,
        rules: [{ key: "max_discount_pct", value: 10 }],
        status: "active",
        ownerId: personIds[0],
      },
      idempotencyKey: `seed:create:policy:${id}`,
      occurredAt: tick(clock),
    });
  }

  const totalEvents = (await db.select().from(schema.events).where(eq(schema.events.orgId, orgId))).length;
  console.log(`Done. org=${orgId} totalEvents=${totalEvents}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

void randomUUID; // kept for parity with other scripts that need true randomness outside the seeded path
