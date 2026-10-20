// Projector: financeBurn — one row per org, the org's current cash position.
// Consumes: finance.burn_updated, finance.invoice_raised, finance.expense_recorded.
// Entity key: orgId (singleton per org — finance burn is an org-level fact,
// not per-invoice/expense; those roll up into counters here).
import type { Projector } from "../engine";

export type FinanceBurnState = {
  orgId: string;
  monthlyBurnUsd: number | null;
  cashOnHandUsd: number | null;
  runwayMonths: number | null;
  totalInvoicedUsd: number;
  totalExpensesUsd: number;
};

const initial: FinanceBurnState = {
  orgId: "",
  monthlyBurnUsd: null,
  cashOnHandUsd: null,
  runwayMonths: null,
  totalInvoicedUsd: 0,
  totalExpensesUsd: 0,
};

export const financeBurnProjector: Projector<FinanceBurnState> = {
  name: "financeBurn",
  interestedIn: ["finance.burn_updated", "finance.invoice_raised", "finance.expense_recorded"],
  initial,
  apply(state, e) {
    switch (e.type) {
      case "finance.burn_updated": {
        const p = e.payload as { monthlyBurnUsd: number; cashOnHandUsd: number; runwayMonths: number };
        return {
          ...state,
          orgId: e.entityId,
          monthlyBurnUsd: p.monthlyBurnUsd,
          cashOnHandUsd: p.cashOnHandUsd,
          runwayMonths: p.runwayMonths,
        };
      }
      case "finance.invoice_raised": {
        const p = e.payload as { amountUsd: number };
        return { ...state, orgId: e.entityId, totalInvoicedUsd: state.totalInvoicedUsd + p.amountUsd };
      }
      case "finance.expense_recorded": {
        const p = e.payload as { amountUsd: number };
        return { ...state, orgId: e.entityId, totalExpensesUsd: state.totalExpensesUsd + p.amountUsd };
      }
      default:
        return state;
    }
  },
};
