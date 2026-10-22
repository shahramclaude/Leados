// Part 08 — GET: model version history (immutable snapshots recorded
// whenever a board pack is generated or a driver override changes the DAG).

import { listModelVersions } from "@/lib/finance/modelVersion";

export const dynamic = "force-dynamic";

export async function GET() {
  const versions = await listModelVersions(30);
  return Response.json({ versions });
}
