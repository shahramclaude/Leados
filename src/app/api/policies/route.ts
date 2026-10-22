import { listPolicies } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function GET() {
  const policies = await listPolicies();
  return Response.json({ policies });
}
