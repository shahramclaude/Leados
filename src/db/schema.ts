// Drizzle ORM schema for the Financial Intelligence OS (Part 6).
//
// Tables added in this slice:
//  - people            : headcount roster used for cost attribution
//  - financial_events  : burn / revenue / expense / funding / P&L ledger
//  - finance_assumptions: singleton row holding the current cash balance and
//                         baseline revenue assumptions used to seed the
//                         Monte Carlo runway simulation
import { boolean, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const domainEnum = pgEnum("domain", [
  "engineering",
  "product",
  "design",
  "sales",
  "marketing",
  "operations",
  "finance",
  "people",
  "other",
]);

export const financialEventTypeEnum = pgEnum("financial_event_type", [
  "burn",
  "revenue",
  "expense",
  "funding",
  "pl_summary",
]);

export const people = pgTable("people", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  domain: domainEnum("domain").notNull(),
  team: text("team").notNull(),
  // Fully-loaded monthly cost in USD. Nullable — when absent, financialOS
  // falls back to the role-based median estimate (ROLE_COST_MAP).
  monthlySalary: numeric("monthly_salary", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financialEvents = pgTable("financial_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  type: financialEventTypeEnum("type").notNull(),
  domain: domainEnum("domain"),
  team: text("team"),
  // Positive dollar amount. Sign/direction is implied by `type`
  // (revenue/funding = inflow, burn/expense = outflow).
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  description: text("description").notNull().default(""),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financeAssumptions = pgTable("finance_assumptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  currentCashBalance: numeric("current_cash_balance", { precision: 14, scale: 2 }).notNull(),
  baselineMonthlyRevenue: numeric("baseline_monthly_revenue", { precision: 14, scale: 2 }).notNull(),
  baselineRevenueGrowthRate: numeric("baseline_revenue_growth_rate", { precision: 6, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
