import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireUserId } from "@/app/api/adaptation/_util";
import { DOMAINS, type Domain } from "@/lib/familiarity";
import { defaultOrderFor, factsForDomain } from "@/lib/adaptation/seedFacts";
import { adaptPresentation } from "@/lib/adaptation/presentationAdapter";
import {
  getLearnedProfile,
  getOrCreateProfileRow,
  getUsageCountsByFact,
  logAppliedActions,
} from "@/lib/state/profileStore";

export const dynamic = "force-dynamic";

/** Usage-weighted candidate order: most-viewed facts first, falling back to the neutral default rank. */
function usageWeightedOrder(neutralOrder: string[], usageCounts: Record<string, number>): string[] | undefined {
  const hasSignal = neutralOrder.some((id) => (usageCounts[id] ?? 0) > 0);
  if (!hasSignal) return undefined;
  return [...neutralOrder].sort((a, b) => {
    const ua = usageCounts[a] ?? 0;
    const ub = usageCounts[b] ?? 0;
    if (ua !== ub) return ub - ua;
    return neutralOrder.indexOf(a) - neutralOrder.indexOf(b);
  });
}

export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) return badRequest("userId is required");

  const domainParam = req.nextUrl.searchParams.get("domain");
  if (!domainParam || !DOMAINS.includes(domainParam as Domain)) {
    return badRequest("domain must be one of finance|people|risk|tech");
  }
  const domain = domainParam as Domain;
  const standardViewForced = req.nextUrl.searchParams.get("standard") === "1";

  const [profileRow, learned, usageCounts] = await Promise.all([
    getOrCreateProfileRow(userId),
    getLearnedProfile(userId),
    getUsageCountsByFact(userId, domain),
  ]);

  const facts = factsForDomain(domain);
  const neutralOrder = defaultOrderFor(facts);
  const candidateOrder = usageWeightedOrder(neutralOrder, usageCounts);

  const result = adaptPresentation(facts, {
    domain,
    expertise: learned.expertise[domain],
    style: learned.effectiveStyle,
    densityModeOverride: profileRow.densityModeOverride,
    adaptationPaused: profileRow.adaptationPaused,
    standardViewForced,
    usageWeightedOrder: candidateOrder,
  });

  await logAppliedActions(userId, result.actions);

  const orderedFacts = result.order
    .map((id) => result.facts.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return NextResponse.json({
    ok: true,
    domain,
    densityMode: result.densityMode,
    layout: result.layout,
    facts: orderedFacts,
    actions: result.actions,
    expertise: learned.expertise[domain],
    style: learned.effectiveStyle,
  });
}
