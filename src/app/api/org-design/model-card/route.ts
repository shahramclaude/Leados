import { currentModelCard } from "@/lib/org-design/modelCard";

export const dynamic = "force-dynamic";

export async function GET() {
  const card = await currentModelCard();
  return Response.json({ card });
}
