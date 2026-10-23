import { listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const users = await listUsers();
  return Response.json({ users });
}
