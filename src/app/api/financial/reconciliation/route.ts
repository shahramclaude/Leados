import { reconcile } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await reconcile();
  return Response.json(result, { status: result.value.pass ? 200 : 409 });
}
