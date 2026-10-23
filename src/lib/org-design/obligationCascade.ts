// Obligation cascade engine (Part 53 lineage): change-of-control triggers.
//
// Pure function over plain obligation records so it can be fixture-tested
// without the database (see scripts/verify.ts gate 4).

export type ObligationLike = {
  id: number;
  type: string;
  triggerCondition: string; // "change_of_control" | "phase:announce" | "phase:integrate"
  status: string; // dormant | triggered | fulfilled | breached
};

export type DealPhase = "diligence" | "announce" | "integrate" | "complete";

const PHASE_ORDER: DealPhase[] = ["diligence", "announce", "integrate", "complete"];

/**
 * Change-of-control obligations fire as soon as the deal reaches "announce"
 * (signing/announcement is the conventional change-of-control moment) and
 * stay triggered through later phases. Phase-scoped obligations fire exactly
 * when the deal reaches that phase.
 */
export function obligationsToFire(obligations: ObligationLike[], newPhase: DealPhase): ObligationLike[] {
  const phaseIndex = PHASE_ORDER.indexOf(newPhase);
  return obligations.filter((o) => {
    if (o.status === "triggered" || o.status === "fulfilled") return false; // idempotent
    if (o.triggerCondition === "change_of_control") {
      return phaseIndex >= PHASE_ORDER.indexOf("announce");
    }
    if (o.triggerCondition.startsWith("phase:")) {
      const targetPhase = o.triggerCondition.split(":")[1] as DealPhase;
      return PHASE_ORDER.indexOf(targetPhase) <= phaseIndex;
    }
    return false;
  });
}

export function dueDateForObligation(type: string, closeDate: Date): Date {
  const offsetDaysByType: Record<string, number> = {
    change_of_control: 30,
    notice_period: 60,
    vendor_contract: 45,
    benefit_continuation: 90,
  };
  const offset = offsetDaysByType[type] ?? 30;
  const due = new Date(closeDate.getTime());
  due.setDate(due.getDate() + offset);
  return due;
}
