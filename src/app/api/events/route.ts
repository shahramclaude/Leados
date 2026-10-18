import { db } from '@/db'
import { leados_events } from '@/db/schema'
import { desc, eq, isNull, and } from 'drizzle-orm'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const events = await db
    .select()
    .from(leados_events)
    .orderBy(desc(leados_events.ts))
  return Response.json(events)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, domain, data = {}, ts } = body

  if (!type || typeof type !== 'string')
    return Response.json({ error: 'type required' }, { status: 400 })
  if (!domain || typeof domain !== 'string')
    return Response.json({ error: 'domain required' }, { status: 400 })

  const [inserted] = await db
    .insert(leados_events)
    .values({ type, domain, data, ts: ts ? new Date(ts) : new Date() })
    .returning()

  // Lock after 60 seconds (append-only guarantee)
  setTimeout(async () => {
    try {
      await db
        .update(leados_events)
        .set({ locked_at: new Date() })
        .where(and(eq(leados_events.id, inserted.id), isNull(leados_events.locked_at)))
    } catch {
      // best-effort background lock; ignore failures
    }
  }, 60_000)

  return Response.json(inserted, { status: 201 })
}
