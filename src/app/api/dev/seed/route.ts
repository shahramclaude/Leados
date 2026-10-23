import { seedAll } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const report = await seedAll();
    return Response.json({ ok: true, report });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
