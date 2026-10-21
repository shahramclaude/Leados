import { getCascade } from "@/lib/okr";

export const dynamic = "force-dynamic";

export async function GET() {
  const cascade = await getCascade();
  return Response.json(cascade);
}
