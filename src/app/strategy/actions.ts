"use server";

import { revalidatePath } from "next/cache";
import { optimizePortfolio } from "@/lib/strategy";
import { appendAuditEvent } from "@/lib/auditLog";

export async function optimizePortfolioAction() {
  const result = await optimizePortfolio();
  await appendAuditEvent({
    actorKind: "system",
    actorId: "portfolio-optimizer",
    action: "optimize-portfolio",
    target: "quarterly-portfolio",
    payload: { selected: result.selected.length, dropped: result.dropped.length, totalValue: result.totalValue },
  });
  revalidatePath("/strategy");
}
