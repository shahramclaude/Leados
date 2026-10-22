import { listFindings } from "@/lib/findings";

export const dynamic = "force-dynamic";

export async function GET() {
  const findings = await listFindings();
  return Response.json({ findings });
}
