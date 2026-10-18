import { seedDemoData, clearAllData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const result = await seedDemoData();
  return Response.json(result);
}

export async function DELETE(): Promise<Response> {
  await clearAllData();
  return Response.json({ cleared: true });
}
