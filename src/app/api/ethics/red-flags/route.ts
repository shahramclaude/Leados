import { RED_FLAG_DEFINITIONS } from "@/lib/ethics/redFlags";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    redFlags: RED_FLAG_DEFINITIONS,
    note:
      "Red flags raise mandatory review steps with an explanation. They never silently block a decision — " +
      "a human must see and address the reasoning above.",
  });
}
