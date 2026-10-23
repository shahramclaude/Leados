// Part 23 (stub — source file not present in this snapshot): Rights Engine.
//
// Minimal shape used by the delegation authority check: does a given ROLE
// have the right to perform a given action class / task type?

export type RightsRule = {
  role: string;
  actionClassKey: string;
  allowed: boolean;
  ruleRef: string;
};

export function defaultRightsRules(): RightsRule[] {
  return [
    { role: "manager", actionClassKey: "approve.budget_request", allowed: true, ruleRef: "R-23.4 managers approve budget" },
    { role: "director", actionClassKey: "approve.budget_request", allowed: true, ruleRef: "R-23.4 managers approve budget" },
    { role: "ic", actionClassKey: "approve.budget_request", allowed: false, ruleRef: "R-23.4 managers approve budget" },
    { role: "manager", actionClassKey: "publish.customer_comms", allowed: true, ruleRef: "R-23.7 external comms authority" },
    { role: "director", actionClassKey: "publish.customer_comms", allowed: true, ruleRef: "R-23.7 external comms authority" },
    { role: "ic", actionClassKey: "publish.customer_comms", allowed: false, ruleRef: "R-23.7 external comms authority" },
    { role: "ic", actionClassKey: "draft.internal_task", allowed: true, ruleRef: "R-23.1 default IC authority" },
    { role: "manager", actionClassKey: "draft.internal_task", allowed: true, ruleRef: "R-23.1 default IC authority" },
    { role: "director", actionClassKey: "draft.internal_task", allowed: true, ruleRef: "R-23.1 default IC authority" },
  ];
}

export function findRule(
  rules: RightsRule[],
  role: string,
  actionClassKey: string,
): RightsRule | undefined {
  return rules.find((r) => r.role === role && r.actionClassKey === actionClassKey);
}
