import { getDashboardStats } from "@/lib/dashboardStats";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getDashboardStats();
  return Response.json(stats);
}
