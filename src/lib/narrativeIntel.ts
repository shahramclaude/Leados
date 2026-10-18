// Predictive Narrative Intelligence — original TypeScript implementing the
// functional ideas in the task's pasted "Part 7" brief (communication
// effectiveness by audience, auto-generated communication strategy). Unverified
// external spec — no "narrative.outcome" concept was found in the real repo.
import type { AppState } from "./types";

export const narrativeIntel = {
  computeNarrativeEffectiveness(P: AppState) {
    const outcomes = P.events.filter((e) => e.type === "narrative.outcome");
    if (outcomes.length < 3) {
      return {
        insufficient: true,
        n: outcomes.length,
        message: "Need ≥ 3 narrative.outcome events to compute effectiveness.",
        label: "Log narrative outcomes after key presentations and communications.",
      };
    }

    const byAudience: Record<string, typeof outcomes> = {};
    outcomes.forEach((o) => {
      const a = o.data.audience;
      if (!byAudience[a]) byAudience[a] = [];
      byAudience[a].push(o);
    });

    const audienceStats = Object.entries(byAudience).map(([audience, events]) => {
      const reactions = events.flatMap((e) => e.data.reactions || []);
      const aligned = reactions.filter((r: any) => r.type === "aligned").length;
      const confused = reactions.filter((r: any) => r.type === "confused").length;
      const resistant = reactions.filter((r: any) => r.type === "resistant").length;
      const approvals = events.filter((e) => e.data.decisionOutcome === "approved").length;
      return {
        audience, n: events.length,
        alignmentRate: reactions.length ? Math.round((aligned / reactions.length) * 100) : null,
        confusionRate: reactions.length ? Math.round((confused / reactions.length) * 100) : null,
        resistanceRate: reactions.length ? Math.round((resistant / reactions.length) * 100) : null,
        decisionApprovalRate: events.length ? Math.round((approvals / events.length) * 100) : null,
      };
    });

    const learnings = outcomes
      .filter((o) => o.data.messagingLearning)
      .map((o) => ({ learning: o.data.messagingLearning as string, audience: o.data.audience as string, date: o.ts }));

    const highConfusion = [...audienceStats].filter((a) => a.confusionRate !== null).sort((a, b) => (b.confusionRate! - a.confusionRate!))[0];

    return {
      insufficient: false,
      audienceStats, learnings, highConfusion,
      recommendation:
        highConfusion && highConfusion.confusionRate! > 30
          ? `${highConfusion.audience} audience shows ${highConfusion.confusionRate}% confusion rate. ` +
            `Next communication: lead with the conclusion, not the analysis. State the ask in the first sentence.`
          : null,
      label: `Narrative effectiveness from ${outcomes.length} narrative.outcome events. Labeled: reactions are self-reported observations, not measured data.`,
    };
  },

  generateCommunicationStrategy(audienceType: string, messageGoal: string, P: AppState) {
    const effectiveness = this.computeNarrativeEffectiveness(P);
    const audienceStat = !effectiveness.insufficient
      ? effectiveness.audienceStats?.find((a) => a.audience === audienceType)
      : undefined;

    const structureRecommendation = (() => {
      if (audienceStat?.confusionRate != null && audienceStat.confusionRate > 30) {
        return "PYRAMID: lead with the conclusion, then evidence, then details — this audience has historically been confused by bottom-up structure.";
      }
      if (audienceStat?.resistanceRate != null && audienceStat.resistanceRate > 30) {
        return "ACKNOWLEDGE_FIRST: name the tension or concern up front, then address it — meeting resistance early reduces it.";
      }
      return "STANDARD: situation → complication → resolution (McKinsey pyramid principle).";
    })();

    const lengthRecommendation =
      audienceType === "board" ? "< 20 min, ≤ 10 slides" :
      audienceType === "team" ? "20–30 min, story format" :
      audienceType === "investor" ? "< 15 min, metrics-led" : "Standard";

    const knownLearnings = (!effectiveness.insufficient ? effectiveness.learnings : [])
      ?.filter((l) => l.audience === audienceType)
      .slice(-3)
      .map((l) => l.learning) || [];

    const preMortem =
      `Before delivering, assume it failed — what most likely went wrong? For this audience: ` +
      (audienceStat?.confusionRate != null && audienceStat.confusionRate > 30
        ? "probably clarity of the ask."
        : audienceStat?.resistanceRate != null && audienceStat.resistanceRate > 30
        ? "probably emotional buy-in."
        : "probably relevance to their immediate priorities.");

    return {
      strategy: {
        audience: audienceType, goal: messageGoal, structureRecommendation, lengthRecommendation,
        openingLine: `State this in the opening: "${messageGoal}" — not buried, not implied.`,
        knownLearnings, preMortem,
      },
      label: `Communication strategy from narrative history. n=${audienceStat?.n ?? 0} historical communications to this audience.`,
    };
  },
};
