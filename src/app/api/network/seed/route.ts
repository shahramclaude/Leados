import { seedDemoEcosystem } from "@/lib/network/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDemoEcosystem();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("seed demo ecosystem failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
