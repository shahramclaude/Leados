import { listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = await listNotifications(searchParams);
  return Response.json(page);
}
