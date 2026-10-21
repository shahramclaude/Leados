// Naming-history note: financial intelligence (runway reads, tornado, variance
// drill-down) lives in `financialOS.ts`; cross-cutting synthesis lives in
// `strategicIntelligence.ts`. Re-exported here for compatibility with the
// shorter module name used in earlier planning.
export * from "@/lib/financialOS";
export { stateOfTheBusiness, decisionsNeededThisWeek } from "@/lib/strategicIntelligence";
