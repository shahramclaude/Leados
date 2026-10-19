import { markAllNotificationsRead } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export async function PATCH() {
  await markAllNotificationsRead();
  return Response.json({ ok: true });
}
