import { seed } from '@/db/seed'

export const dynamic = 'force-dynamic'

export async function POST() {
  const result = await seed()
  return Response.json(result)
}
