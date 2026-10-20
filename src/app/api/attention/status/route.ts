// GET /api/attention/status — explainable snapshot of the attention engine:
// current cognitive load, fatigue, circadian/quiet-hours state, today's
// interrupt budget spend, and the adaptive batching policy currently in
// effect. Powers the "visible spend" UI and the Now cockpit's explanations.

import { getCurrentUserId } from "@/lib/auth";
import { getCognitiveLoad } from "@/lib/attention/cognitiveLoad";
import { getCircadianState } from "@/lib/attention/circadian";
import { getBudgetState } from "@/lib/attention/budget";
import { getAdaptivePolicy } from "@/lib/attention/attentionOpt";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const now = new Date();

  const [load, circadian, budget, adaptive] = await Promise.all([
    getCognitiveLoad(userId, now),
    getCircadianState(userId, now),
    getBudgetState(userId, now),
    getAdaptivePolicy(userId, now),
  ]);

  return Response.json({
    cognitiveLoad: load,
    circadian,
    budget,
    adaptive,
    generatedAt: now.toISOString(),
  });
}
