// Ethical red-flag registry. Each detector is a pure function over a
// decision record (+ small context) that either returns a detection or null.
// Detections NEVER block the underlying decision by themselves — they
// attach mandatory review steps with a plain-language explanation, per the
// "never blocking silently, always explaining" rule in the brief.

export interface RedFlagDefinition {
  code: string;
  label: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export const RED_FLAG_DEFINITIONS: RedFlagDefinition[] = [
  {
    code: "PEOPLE_DATA_NO_VISIBILITY",
    label: "People data used without subject visibility",
    description: "The decision affects people's data without those people having visibility into it.",
    severity: "high",
  },
  {
    code: "BULK_VISIBILITY_GRANT",
    label: "Bulk visibility of individuals granted",
    description: "The decision grants bulk visibility into many individuals at once rather than individual, scoped access.",
    severity: "high",
  },
  {
    code: "UNILATERAL_HIGH_POWER",
    label: "High-power action without dual control",
    description: "The decision is a high-power (T4) action that has not been routed through the two-person rule.",
    severity: "high",
  },
  {
    code: "IRREVERSIBLE_HIGH_IMPACT",
    label: "Irreversible and high impact",
    description: "The decision is both irreversible and assessed as high impact, which warrants extra scrutiny before proceeding.",
    severity: "high",
  },
  {
    code: "SUPPRESSED_DISSENT",
    label: "Dissent hidden from the record",
    description: "Recorded dissent on this decision has been marked hidden rather than remaining visible.",
    severity: "high",
  },
  {
    code: "COI_PROXIMITY_UNRESOLVED",
    label: "Unresolved conflict-of-interest proximity",
    description: "A declared conflict of interest places the declarant within 2 relationship hops of this decision's outcome, with no recusal on file.",
    severity: "medium",
  },
];

export interface RedFlagContext {
  stakeholderCount?: number;
  isT4Action?: boolean;
  dualControlSatisfied?: boolean;
  unresolvedProximityWarnings?: number;
}

export interface DecisionLike {
  involvesPeopleData: boolean;
  subjectsHaveVisibility: boolean;
  visibilityScope: string;
  reversibility: string;
  impact: string;
  dissentHidden: boolean;
}

export interface RedFlagDetection {
  code: string;
  label: string;
  severity: string;
  explanation: string;
}

type Detector = (decision: DecisionLike, ctx: RedFlagContext) => RedFlagDetection | null;

const BULK_VISIBILITY_THRESHOLD = 20;

const detectors: Record<string, Detector> = {
  PEOPLE_DATA_NO_VISIBILITY: (d) => {
    if (d.involvesPeopleData && !d.subjectsHaveVisibility) {
      return {
        code: "PEOPLE_DATA_NO_VISIBILITY",
        label: "People data used without subject visibility",
        severity: "high",
        explanation:
          "This decision involves processing people's data, and those people have not been given " +
          "visibility into it. Required step: provide a visibility/notice mechanism before proceeding, " +
          "or document an explicit, time-bound, reviewed exception.",
      };
    }
    return null;
  },
  BULK_VISIBILITY_GRANT: (d, ctx) => {
    const count = ctx.stakeholderCount ?? 0;
    if (d.visibilityScope === "bulk" || count >= BULK_VISIBILITY_THRESHOLD) {
      return {
        code: "BULK_VISIBILITY_GRANT",
        label: "Bulk visibility of individuals granted",
        severity: "high",
        explanation:
          `This decision grants visibility scoped as "bulk"${count ? ` affecting ${count} stakeholders` : ""}. ` +
          "Required step: confirm least-privilege scoping is justified and route through dual control if it " +
          "is a recognized T4 action (e.g. bulk people-data export).",
      };
    }
    return null;
  },
  UNILATERAL_HIGH_POWER: (_d, ctx) => {
    if (ctx.isT4Action && !ctx.dualControlSatisfied) {
      return {
        code: "UNILATERAL_HIGH_POWER",
        label: "High-power action without dual control",
        severity: "high",
        explanation:
          "This is a T4 (highest power tier) action and dual control has not yet been satisfied. " +
          "Required step: route through the two-person rule before execution; a single actor may not complete it.",
      };
    }
    return null;
  },
  IRREVERSIBLE_HIGH_IMPACT: (d) => {
    if (d.reversibility === "irreversible" && d.impact === "high") {
      return {
        code: "IRREVERSIBLE_HIGH_IMPACT",
        label: "Irreversible and high impact",
        severity: "high",
        explanation:
          "This decision cannot be undone and is assessed as high impact. Required step: obtain an " +
          "independent second review and document a pre-mortem before proceeding.",
      };
    }
    return null;
  },
  SUPPRESSED_DISSENT: (d) => {
    if (d.dissentHidden) {
      return {
        code: "SUPPRESSED_DISSENT",
        label: "Dissent hidden from the record",
        severity: "high",
        explanation:
          "Dissent recorded against this decision has been marked hidden. Required step: restore dissent " +
          "visibility — dissent must remain visible in the decision record regardless of outcome.",
      };
    }
    return null;
  },
  COI_PROXIMITY_UNRESOLVED: (_d, ctx) => {
    if ((ctx.unresolvedProximityWarnings ?? 0) > 0) {
      return {
        code: "COI_PROXIMITY_UNRESOLVED",
        label: "Unresolved conflict-of-interest proximity",
        severity: "medium",
        explanation:
          `${ctx.unresolvedProximityWarnings} unresolved proximity warning(s) exist for this decision. ` +
          "Required step: the declarant should recuse or the proximity should be explicitly reviewed and cleared.",
      };
    }
    return null;
  },
};

export function runRedFlagDetectors(decision: DecisionLike, ctx: RedFlagContext): RedFlagDetection[] {
  return Object.values(detectors)
    .map((fn) => fn(decision, ctx))
    .filter((d): d is RedFlagDetection => d !== null);
}
