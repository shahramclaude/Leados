import { db } from '@/db'
import { leados_events, leados_people } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { project } from '@/lib/engine'

export const dynamic = 'force-dynamic'
// Revalidate every 10 seconds via Next.js fetch cache when called server-side
export const revalidate = 10

export async function GET() {
  const [events, people] = await Promise.all([
    db.select().from(leados_events).orderBy(desc(leados_events.ts)),
    db.select().from(leados_people).where(eq(leados_people.archived, false)),
  ])

  // Map DB rows to engine interface
  const mappedEvents = events.map(e => ({
    id: e.id,
    type: e.type,
    domain: e.domain,
    ts: new Date(e.ts),
    data: e.data as Record<string, unknown>,
  }))

  const mappedPeople = people.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    reports_to: p.reports_to,
    cadence_days: p.cadence_days,
    archived: p.archived,
  }))

  const state = project(mappedEvents, mappedPeople)
  return Response.json(state)
}
