// Naming-history note: earlier planning referred to both `financialOS.ts` and
// `financeEngine.ts`. Consolidated into one module (`financialOS.ts`) so there
// is a single source of truth for the driver-based model, as the mission for
// this part requires. This file is kept as a thin compatibility re-export so
// any code/docs referencing `financeEngine` still resolve correctly.
export * from "@/lib/financialOS";
