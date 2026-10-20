import { listRuns } from "@/lib/app/automation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = await listRuns(searchParams);
  return Response.json(page);
}
