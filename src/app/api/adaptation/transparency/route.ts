import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireUserId } from "@/app/api/adaptation/_util";
import { DOMAINS, type Domain } from "@/lib/familiarity";
import { defaultOrderFor, factsForDomain } from "@/lib/adaptation/seedFacts";
import { adaptPresentation, type AppliedAction } from "@/lib/adaptation/presentationAdapter";
import { getLearnedProfile, getOrCreateProfileRow, getUsageCountsByFact } from "@/lib/state/profileStore";
import { ADAPTATION_ASSURANCE_REGISTRY } from "@/lib/assurance/registry";
import { BANNED_PATTERNS } from "@/lib/adaptation/manipulationGuard";
import { computeCoverage } from "@/lib/adaptation/transparencyCoverage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) return badRequest("userId is required");

  const domainParam = req.nextUrl.searchParams.get("domain");
  if (!domainParam || !DOMAINS.includes(domainParam as Domain)) {
    return badRequest("domain must be one of finance|people|risk|tech");
  }
  const domain = domainParam as Domain;

  const [profileRow, learned, usageCounts] = await Promise.all([
    getOrCreateProfileRow(userId),
    getLearnedProfile(userId),
    getUsageCountsByFact(userId, domain),
  ]);

  const facts = factsForDomain(domain);
  const neutralOrder = defaultOrderFor(facts);
  const hasSignal = neutralOrder.some((id) => (usageCounts[id] ?? 0) > 0);
  const candidateOrder = hasSignal
    ? [...neutralOrder].sort((a, b) => (usageCounts[b] ?? 0) - (usageCounts[a] ?? 0) || neutralOrder.indexOf(a) - neutralOrder.indexOf(b))
    : undefined;

  const result = adaptPresentation(facts, {
    domain,
    expertise: learned.expertise[domain],
    style: learned.effectiveStyle,
    densityModeOverride: profileRow.densityModeOverride,
    adaptationPaused: profileRow.adaptationPaused,
    standardViewForced: false,
    usageWeightedOrder: candidateOrder,
  });

  const coverage = computeCoverage(result).map((entry) => ({
    class: entry.class,
    applied: entry.applied,
    blocked: entry.blocked,
    examples: entry.examples.map(describeAction),
    explanation: entry.explanation,
  }));

  return NextResponse.json({
    ok: true,
    domain,
    paused: profileRow.adaptationPaused,
    densityOverride: profileRow.densityModeOverride,
    coverage,
    registry: ADAPTATION_ASSURANCE_REGISTRY,
    bannedPatterns: BANNED_PATTERNS,
    defaultOrder: neutralOrder,
    appliedOrder: result.order,
  });
}

function describeAction(action: AppliedAction) {
  return {
    id: action.id,
    description: action.description,
    rationale: action.rationale ?? null,
    counterfactual: action.counterfactual ?? null,
    blocked: action.verdict.blocked,
    blockReason: action.verdict.blocked ? action.verdict.reason : null,
  };
}
