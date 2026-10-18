import type { CaptureType, ClassificationResult } from "@/lib/types";

// Lightweight keyword-weighted Naive-Bayes-style classifier for free text
// quick-capture input. Each category has a lexicon of indicative tokens with
// weights; the raw score per category is the sum of matched weights plus a
// small prior, then normalized with softmax so scores sum to 1 and can be
// read as a confidence. This is a deliberately simple, auditable classifier
// (not an ML black box) appropriate for routing short operator notes.

const LEXICON: Record<CaptureType, Array<{ token: RegExp; weight: number }>> = {
  one_on_one: [
    { token: /\b1:1|one.on.one|1 on 1\b/i, weight: 3 },
    { token: /\bcheck.?in\b/i, weight: 2 },
    { token: /\bfeeling|morale|burnout|stressed\b/i, weight: 1.2 },
    { token: /\bmet with|talked to|spoke with\b/i, weight: 1.5 },
    { token: /\bcareer|growth|promotion\b/i, weight: 1 },
  ],
  decision: [
    { token: /\bdecide|decision|approve|greenlight|go\/no.go\b/i, weight: 3 },
    { token: /\bshould we|proposal|recommend\b/i, weight: 1.8 },
    { token: /\bdeadline|by (eow|eod|friday|monday)\b/i, weight: 1.2 },
    { token: /\bchoose between|option [ab]\b/i, weight: 1.5 },
  ],
  metric_update: [
    { token: /\b\d+(\.\d+)?\s?(%|percent|k|m|usd|\$)\b/i, weight: 2.2 },
    { token: /\bmrr|arr|churn|nps|cac|ltv|dau|mau|conversion|runway\b/i, weight: 3 },
    { token: /\bup from|down from|increased|decreased|hit\b/i, weight: 1.3 },
    { token: /\btarget|benchmark|kpi\b/i, weight: 1 },
  ],
  incident: [
    { token: /\boutage|incident|down|breach|failed|failure|sev1|sev2\b/i, weight: 3 },
    { token: /\bbug|broken|crash|error rate\b/i, weight: 2 },
    { token: /\bcustomer impact|data loss\b/i, weight: 2.5 },
  ],
  feedback: [
    { token: /\bfeedback|suggest|complain|praised|frustrated|loved\b/i, weight: 2.5 },
    { token: /\bcustomer said|user said|they mentioned\b/i, weight: 2 },
    { token: /\bnps|survey|review\b/i, weight: 1 },
  ],
};

const PRIOR: Record<CaptureType, number> = {
  one_on_one: 0.3,
  decision: 0.3,
  metric_update: 0.3,
  incident: 0.3,
  feedback: 0.3,
};

export function classifyCapture(text: string): ClassificationResult {
  const raw: Record<CaptureType, number> = {
    one_on_one: PRIOR.one_on_one,
    decision: PRIOR.decision,
    metric_update: PRIOR.metric_update,
    incident: PRIOR.incident,
    feedback: PRIOR.feedback,
  };

  (Object.keys(LEXICON) as CaptureType[]).forEach((type) => {
    for (const { token, weight } of LEXICON[type]) {
      if (token.test(text)) raw[type] += weight;
    }
  });

  // Softmax normalization: p_i = e^(s_i) / sum(e^(s_j))
  const exps = (Object.keys(raw) as CaptureType[]).map((k) => ({ k, v: Math.exp(raw[k]) }));
  const sumExp = exps.reduce((a, b) => a + b.v, 0);
  const scores = {} as Record<CaptureType, number>;
  exps.forEach(({ k, v }) => {
    scores[k] = sumExp > 0 ? v / sumExp : 1 / exps.length;
  });

  let best: CaptureType = "feedback";
  let bestScore = -Infinity;
  (Object.keys(scores) as CaptureType[]).forEach((k) => {
    if (scores[k] > bestScore) {
      bestScore = scores[k];
      best = k;
    }
  });

  return { type: best, confidence: bestScore, scores };
}
