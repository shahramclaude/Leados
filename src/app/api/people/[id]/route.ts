import { db } from '@/db'
import { leados_people } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const [updated] = await db
    .update(leados_people)
    .set({
      ...(body.name         !== undefined && { name: body.name }),
      ...(body.role         !== undefined && { role: body.role }),
      ...(body.cadence_days !== undefined && { cadence_days: body.cadence_days }),
      ...(body.archived     !== undefined && { archived: body.archived }),
    })
    .where(eq(leados_people.id, id))
    .returning()
  if (!updated) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(updated)
}
