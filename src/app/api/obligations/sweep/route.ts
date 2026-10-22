import { sweepObligationDeadlines } from "@/lib/obligations";

export const dynamic = "force-dynamic";

export async function POST() {
  const changes = await sweepObligationDeadlines();
  return Response.json({ changes });
}
