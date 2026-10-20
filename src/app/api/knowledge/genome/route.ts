import { NextResponse } from "next/server";
import { computeGenome } from "@/lib/genome";

export const dynamic = "force-dynamic";

export async function GET() {
  const genome = await computeGenome();
  return NextResponse.json(genome);
}
