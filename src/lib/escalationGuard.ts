// Social-risk guard (Phase 5, attack #2): what happens when a follow-up would
// otherwise be routed to, or about, someone more senior than its initiator?
//
// Rule: a nudge about a commitment is ALWAYS addressed to the promisor
// themself first (a self-reminder), never auto-escalated past them. If a
// promisee wants to chase someone senior, the system will only ever produce a
// gentle, human-sent draft *for the promisee* to send — it will never
// auto-send up the hierarchy, and it never drops the tone to "escalation"
// register when powerLevel(target) < powerLevel(initiator) (lower number =
// more senior here).

export type PowerContext = {
  initiatorPowerLevel: number;
  targetPowerLevel: number;
};

export function outranks(ctx: PowerContext): boolean {
  return ctx.targetPowerLevel < ctx.initiatorPowerLevel;
}

export type EscalationDecision = {
  allowAutoSend: boolean;
  tone: "self_reminder" | "gentle_checkin" | "escalation";
  reason: string;
};

export function guardEscalation(ctx: PowerContext, isSelfReminder: boolean): EscalationDecision {
  if (isSelfReminder) {
    return { allowAutoSend: false, tone: "self_reminder", reason: "always drafted to the promisor as a self-reminder first; still requires a tap to send (T1)" };
  }
  if (outranks(ctx)) {
    return {
      allowAutoSend: false,
      tone: "gentle_checkin",
      reason: "target outranks initiator — tone is forced to a gentle check-in draft for the initiator to send manually; auto-send and escalation framing are both disabled regardless of action-class tier",
    };
  }
  return {
    allowAutoSend: false, // still T1 by default even laterally/downward; tier/grant decide the rest upstream
    tone: "gentle_checkin",
    reason: "no power asymmetry detected; default gentle tone, still a human-approved draft",
  };
}
