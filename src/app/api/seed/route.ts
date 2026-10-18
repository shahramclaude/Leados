import { seed } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  await seed();
  return Response.json({ ok: true });
}
