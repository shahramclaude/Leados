import { z } from "zod";
import { BaseEntitySchema } from "./base";

export const ENTITY_TYPE_BUDGET = "budget" as const;
export const ENTITY_TYPE_ACCOUNT = "account" as const;
export const ENTITY_TYPE_TRANSACTION = "transaction" as const;

export const BudgetSchema = BaseEntitySchema.extend({
  name: z.string().min(1),
  fiscalYear: z.number().int(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  ownerId: z.string().uuid(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const AccountSchema = BaseEntitySchema.extend({
  budgetId: z.string().uuid(),
  name: z.string().min(1),
  allocatedAmount: z.number().nonnegative(),
  spentAmount: z.number().nonnegative().default(0),
});
export type Account = z.infer<typeof AccountSchema>;

export const TransactionSchema = BaseEntitySchema.extend({
  accountId: z.string().uuid(),
  amount: z.number(),
  currency: z.string().length(3),
  description: z.string().default(""),
  postedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export function budgetProjectionColumns(data: Budget) {
  return { ownerId: data.ownerId, parentId: null as string | null, status: String(data.fiscalYear) };
}
export function accountProjectionColumns(data: Account) {
  return { ownerId: null as string | null, parentId: data.budgetId, status: null as string | null };
}
export function transactionProjectionColumns(data: Transaction) {
  return { ownerId: null as string | null, parentId: data.accountId, status: null as string | null };
}
