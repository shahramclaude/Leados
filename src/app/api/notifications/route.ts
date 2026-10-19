import { listNotifications } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const notifications = await listNotifications();
  return Response.json({ notifications });
}
