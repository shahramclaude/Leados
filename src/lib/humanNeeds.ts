// Part 09 reconstruction: a small self-determination-theory-flavoured needs
// taxonomy LEADOS uses to keep coaching and manager-nudge language humane
// rather than purely metrics-driven. Not present to read in this sandbox
// (src/lib was empty); reconstructed minimally per the standing order.

export type HumanNeed = "autonomy" | "competence" | "relatedness";

export const HUMAN_NEEDS: Record<HumanNeed, { label: string; coachingCue: string }> = {
  autonomy: {
    label: "Autonomy",
    coachingCue: "Whose choice is this, and how much of it is genuinely theirs?",
  },
  competence: {
    label: "Competence",
    coachingCue: "What evidence would tell them they're getting better at this?",
  },
  relatedness: {
    label: "Relatedness",
    coachingCue: "Who else needs to be part of this for it to feel safe to try?",
  },
};

/** Used to keep nudges and coaching prompts phrased as support, not surveillance. */
export function needAwareFraming(need: HumanNeed): string {
  return HUMAN_NEEDS[need].coachingCue;
}
