// Part 08 — fixed/variable cost split registry.
// Each P&L cost category is tagged with how it behaves relative to volume so
// the Driver Tree and board pack can show "if volume moves X%, cost moves
// ~Y%" without re-deriving it ad hoc. `driverNodeId` points at the DAG node
// (defined in `financialModel.ts`) carrying that category's dollar amount.

export type CostCategoryId =
  | "cogsHosting"
  | "cogsServicesDelivery"
  | "cogsCustomerSuccess"
  | "smHeadcount"
  | "smPrograms"
  | "rndHeadcount"
  | "gaHeadcount"
  | "gaOther";

export type Classification = "variable" | "fixed" | "semi-variable";

export interface CostCategoryMeta {
  id: CostCategoryId;
  label: string;
  statementLine: "cogs" | "sm" | "rnd" | "ga";
  classification: Classification;
  driverNodeId: string;
  rationale: string;
}

export const COST_CATEGORIES: CostCategoryMeta[] = [
  {
    id: "cogsHosting",
    label: "Hosting / infrastructure",
    statementLine: "cogs",
    classification: "variable",
    driverNodeId: "cogsHostingAmount",
    rationale: "Scales directly with active customer count ($/customer/month driver).",
  },
  {
    id: "cogsServicesDelivery",
    label: "Services delivery cost",
    statementLine: "cogs",
    classification: "variable",
    driverNodeId: "cogsServicesDeliveryAmount",
    rationale: "Modeled as a cost-rate fraction of services revenue delivered that month.",
  },
  {
    id: "cogsCustomerSuccess",
    label: "Customer Success headcount",
    statementLine: "cogs",
    classification: "semi-variable",
    driverNodeId: "cogsCustomerSuccessAmount",
    rationale: "Headcount is planned ahead of volume in discrete hires, so it is sticky between hiring decisions but trends with customer count over quarters.",
  },
  {
    id: "smHeadcount",
    label: "Sales headcount",
    statementLine: "sm",
    classification: "semi-variable",
    driverNodeId: "smHeadcountAmount",
    rationale: "Reps are hired ahead of bookings in discrete steps (sticky in-month, variable over a hiring cycle).",
  },
  {
    id: "smPrograms",
    label: "Marketing & sales programs",
    statementLine: "sm",
    classification: "variable",
    driverNodeId: "smProgramsAmount",
    rationale: "Discretionary program spend set monthly as a direct budget input.",
  },
  {
    id: "rndHeadcount",
    label: "R&D / Engineering headcount",
    statementLine: "rnd",
    classification: "fixed",
    driverNodeId: "rndHeadcountAmount",
    rationale: "Engineering headcount does not flex with monthly volume.",
  },
  {
    id: "gaHeadcount",
    label: "G&A headcount",
    statementLine: "ga",
    classification: "fixed",
    driverNodeId: "gaHeadcountAmount",
    rationale: "Back-office headcount does not flex with monthly volume.",
  },
  {
    id: "gaOther",
    label: "Other G&A (rent, insurance, tools)",
    statementLine: "ga",
    classification: "fixed",
    driverNodeId: "gaOtherAmount",
    rationale: "Contracted overhead costs, fixed in the short run.",
  },
];

export interface CostSplit {
  fixed: number;
  variable: number;
  semiVariable: number;
  total: number;
  byCategory: { id: CostCategoryId; label: string; amount: number; classification: Classification }[];
}

export function splitFixedVariable(amountByNodeId: Record<string, number>): CostSplit {
  let fixed = 0;
  let variable = 0;
  let semiVariable = 0;
  const byCategory = COST_CATEGORIES.map((c) => {
    const amount = amountByNodeId[c.driverNodeId] ?? 0;
    if (c.classification === "fixed") fixed += amount;
    else if (c.classification === "variable") variable += amount;
    else semiVariable += amount;
    return { id: c.id, label: c.label, amount, classification: c.classification };
  });
  return { fixed, variable, semiVariable, total: fixed + variable + semiVariable, byCategory };
}
