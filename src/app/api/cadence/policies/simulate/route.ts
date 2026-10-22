// POST /api/cadence/policies/simulate — the Cadence Policy Editor's
// simulation preview: "this policy would have skipped 3 reviews last
// quarter — is that intended?" Runs a candidate rule (which need not be
// saved yet) against the ritual's real occurrence history.
import { NextResponse } from "next/server";
import { simulatePolicyAgainstHistory } from "@/lib/cadence/policyEngine";
import type { CadenceRule } from "@/lib/cadence/types";

export const dynamic = "force-dynamic";

interface SimulateBody {
  ritualId: string;
  rule: CadenceRule;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SimulateBody;
  if (!body.ritualId || !body.rule) {
    return NextResponse.json({ error: "ritualId and rule are required" }, { status: 400 });
  }
  const result = await simulatePolicyAgainstHistory(body.ritualId, body.rule);
  return NextResponse.json(result);
}
