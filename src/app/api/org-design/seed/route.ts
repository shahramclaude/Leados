import { seedAll } from "@/lib/org-design/seedData";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedAll();
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
