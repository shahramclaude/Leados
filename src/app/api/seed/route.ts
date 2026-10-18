import { seed } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seed();
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
