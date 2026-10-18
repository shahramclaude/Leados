import { db } from './index'
import { leados_events, leados_people } from './schema'
import { sql } from 'drizzle-orm'

type NewEvent = typeof leados_events.$inferInsert

export async function seed() {
  // Idempotent: only seed if events table is empty
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leados_events)
  if (count > 0) return { skipped: true, count }

  // Insert 6 people first
  const people = await db.insert(leados_people).values([
    { name: 'Ana Ruiz',     role: 'VP Engineering',  cadence_days: 14 },
    { name: 'Bruno Serra',  role: 'Eng Manager',     cadence_days: 14 },
    { name: 'Cara Lind',    role: 'Staff Engineer',  cadence_days: 14 },
    { name: 'Dan Novak',    role: 'Sales Lead',      cadence_days: 21 },
    { name: 'Edda Kwan',    role: 'CS Lead',         cadence_days: 21 },
    { name: 'Finn Cole',    role: 'Finance Lead',    cadence_days: 14 },
  ]).returning({ id: leados_people.id, name: leados_people.name })

  const byName = Object.fromEntries(people.map(p => [p.name, p.id]))

  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000)

  // Insert seed events
  const eventRows: NewEvent[] = [
    // Ana: 3 skipped 1:1s → fires R1
    { type: 'oneonone', domain: 'people', ts: daysAgo(28),
      data: { personId: byName['Ana Ruiz'], person: 'Ana Ruiz', status: 'skipped' } },
    { type: 'oneonone', domain: 'people', ts: daysAgo(22),
      data: { personId: byName['Ana Ruiz'], person: 'Ana Ruiz', status: 'skipped' } },
    { type: 'oneonone', domain: 'people', ts: daysAgo(16),
      data: { personId: byName['Ana Ruiz'], person: 'Ana Ruiz', status: 'held'    } },
    { type: 'oneonone', domain: 'people', ts: daysAgo(8),
      data: { personId: byName['Ana Ruiz'], person: 'Ana Ruiz', status: 'skipped' } },

    // Cara: 5 held 1:1s, no recognition → fires R2
    ...Array.from({ length: 5 }, (_, i) => ({
      type: 'oneonone', domain: 'people', ts: daysAgo(55 - i * 10),
      data: { personId: byName['Cara Lind'], person: 'Cara Lind', status: 'held' }
    })),

    // Finance metrics
    { type: 'metric', domain: 'finance', ts: daysAgo(1),
      data: { key: 'runway_months', value: 5.2 } },
    { type: 'metric', domain: 'finance', ts: daysAgo(2),
      data: { key: 'burn_rate_delta_pct', value: 24 } },
    { type: 'metric', domain: 'finance', ts: daysAgo(3),
      data: { key: 'mrr_growth_pct', value: -3 } },

    // Sales metrics
    { type: 'metric', domain: 'sales', ts: daysAgo(2),
      data: { key: 'pipeline_coverage_x', value: 2.1 } },
    { type: 'metric', domain: 'sales', ts: daysAgo(4),
      data: { key: 'churn_pct', value: 2.8 } },

    // Ops
    { type: 'metric', domain: 'ops', ts: daysAgo(5),
      data: { key: 'deploy_freq_delta_pct', value: -35 } },

    // Goals
    { type: 'goal', domain: 'strategy', ts: daysAgo(20),
      data: { goalId: 'g1', title: 'Expand EU pilot',
              ownerAssigned: false, status: 'active' } },
    { type: 'goal', domain: 'strategy', ts: daysAgo(120),
      data: { goalId: 'g2', title: 'Legacy infra sunset',
              ownerAssigned: true, status: 'active' } },

    // Decisions
    { type: 'decision', domain: 'gov', ts: daysAgo(30),
      data: { decisionId: 'd1', title: 'Vendor contract renewal',
              ownerId: byName['Ana Ruiz'], owner: 'Ana Ruiz',
              openedAt: daysAgo(30), resolvedAt: null } },
    { type: 'decision', domain: 'gov', ts: daysAgo(50),
      data: { decisionId: 'd2', title: 'Pricing tier restructure',
              ownerId: byName['Bruno Serra'], owner: 'Bruno Serra',
              openedAt: daysAgo(50), resolvedAt: null } },
    { type: 'decision', domain: 'gov', ts: daysAgo(60),
      data: { decisionId: 'd3', title: 'Office lease renewal',
              ownerId: byName['Finn Cole'], owner: 'Finn Cole',
              openedAt: daysAgo(60), resolvedAt: daysAgo(40) } },
  ]

  await db.insert(leados_events).values(eventRows)

  return { seeded: true, people: people.length }
}
