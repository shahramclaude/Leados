import { db } from '@/db'
import { leados_people } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const people = await db
    .select()
    .from(leados_people)
    .where(eq(leados_people.archived, false))
  return Response.json(people)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, role, cadence_days, start_date, reports_to } = body
  if (!name) return Response.json({ error: 'name required' }, { status: 400 })
  const [person] = await db
    .insert(leados_people)
    .values({ name, role, cadence_days: cadence_days ?? 14, start_date, reports_to })
    .returning()
  return Response.json(person, { status: 201 })
}
