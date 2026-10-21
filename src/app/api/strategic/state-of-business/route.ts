import { stateOfTheBusiness } from "@/lib/strategicIntelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await stateOfTheBusiness();
  return Response.json(result);
}
