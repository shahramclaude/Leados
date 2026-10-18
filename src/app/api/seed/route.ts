import { seedDatabase } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await seedDatabase();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
