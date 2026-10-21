import { getAuditSince } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since") ?? undefined;
  const rows = await getAuditSince(since, 100);
  return Response.json({ items: rows, serverTime: new Date().toISOString() });
}
