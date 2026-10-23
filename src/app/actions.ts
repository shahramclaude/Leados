"use server";

import { db } from "@/db";
import {
  cashPositions,
  charterPromises,
  closeTasks,
  contracts,
  covenants,
  hseIncidents,
  invoices,
  itsmTickets,
  reconciliations,
} from "@/db/schema";
import { sanitizeReporterName, validateRootCause } from "@/lib/calc/hse";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function num(formData: FormData, key: string, fallback = 0): number {
  const v = formData.get(key);
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

// --------------------------------------------------------------------------
// Close (Part 124)
// --------------------------------------------------------------------------
export async function createCloseTask(formData: FormData) {
  await db.insert(closeTasks).values({
    entity: str(formData, "entity"),
    taskName: str(formData, "taskName"),
    sequence: num(formData, "sequence", 1),
    owner: str(formData, "owner"),
    slaHours: num(formData, "slaHours", 24),
  });
  revalidatePath("/close");
}

export async function signOffCloseTask(formData: FormData) {
  const id = num(formData, "id");
  const evidenceRef = str(formData, "evidenceRef");
  const [task] = await db.select().from(closeTasks).where(eq(closeTasks.id, id));
  if (!task) return;
  if (!evidenceRef) {
    // Evidence-less sign-off is blocked at the server boundary, not just the UI.
    return;
  }
  await db
    .update(closeTasks)
    .set({
      evidenceRef,
      status: "signed-off",
      signedOffBy: str(formData, "signedOffBy") || "unassigned",
      signedOffAt: new Date(),
    })
    .where(eq(closeTasks.id, id));
  revalidatePath("/close");
}

export async function createReconciliation(formData: FormData) {
  await db.insert(reconciliations).values({
    accountId: str(formData, "accountId"),
    period: str(formData, "period"),
    sourceBalance: String(num(formData, "sourceBalance")),
    glBalance: String(num(formData, "glBalance")),
    reconcilingItemsTotal: String(num(formData, "reconcilingItemsTotal")),
    toleranceUsd: String(num(formData, "toleranceUsd", 1)),
    preparer: str(formData, "preparer"),
  });
  revalidatePath("/close");
}

// --------------------------------------------------------------------------
// Source-to-pay (Part 125)
// --------------------------------------------------------------------------
export async function createContract(formData: FormData) {
  await db.insert(contracts).values({
    counterparty: str(formData, "counterparty"),
    contractType: str(formData, "contractType"),
    valueUsd: String(num(formData, "valueUsd")),
    renewalDate: str(formData, "renewalDate"),
    noticeDays: num(formData, "noticeDays", 30),
    autoRenew: bool(formData, "autoRenew"),
    riskClauses: str(formData, "riskClauses"),
  });
  revalidatePath("/procurement");
}

export async function markContractDecision(formData: FormData) {
  const id = num(formData, "id");
  await db.update(contracts).set({ decisionMade: true }).where(eq(contracts.id, id));
  revalidatePath("/procurement");
}

export async function createInvoice(formData: FormData) {
  const poAmountRaw = formData.get("poAmount");
  const receiptAmountRaw = formData.get("receiptAmount");
  await db.insert(invoices).values({
    vendor: str(formData, "vendor"),
    poAmount: poAmountRaw ? String(num(formData, "poAmount")) : null,
    receiptAmount: receiptAmountRaw ? String(num(formData, "receiptAmount")) : null,
    invoiceAmount: String(num(formData, "invoiceAmount")),
    toleranceUsd: String(num(formData, "toleranceUsd", 5)),
    bankChangeRequested: bool(formData, "bankChangeRequested"),
  });
  revalidatePath("/procurement");
}

export async function approveDualControl(formData: FormData) {
  const id = num(formData, "id");
  await db.update(invoices).set({ dualControlApproved: true }).where(eq(invoices.id, id));
  revalidatePath("/procurement");
}

// --------------------------------------------------------------------------
// ITSM (Part 126)
// --------------------------------------------------------------------------
export async function createTicket(formData: FormData) {
  const slaOverrideRaw = formData.get("slaHours");
  await db.insert(itsmTickets).values({
    category: str(formData, "category"),
    requester: str(formData, "requester"),
    priority: num(formData, "priority", 3),
    slaHours: slaOverrideRaw ? num(formData, "slaHours") : null,
  });
  revalidatePath("/itsm");
}

export async function pauseTicket(formData: FormData) {
  const id = num(formData, "id");
  const hours = num(formData, "hours", 1);
  await db
    .update(itsmTickets)
    .set({ pausedHours: sql`${itsmTickets.pausedHours} + ${hours}` })
    .where(eq(itsmTickets.id, id));
  revalidatePath("/itsm");
}

export async function resolveTicket(formData: FormData) {
  const id = num(formData, "id");
  await db.update(itsmTickets).set({ status: "resolved", resolvedAt: new Date() }).where(eq(itsmTickets.id, id));
  revalidatePath("/itsm");
}

// --------------------------------------------------------------------------
// HSE (Part 127)
// --------------------------------------------------------------------------
export async function createIncident(formData: FormData) {
  const anonymous = bool(formData, "anonymous");
  const rootCauseIsHumanErrorOnly = bool(formData, "rootCauseIsHumanErrorOnly");
  const systemContributingFactor = str(formData, "systemContributingFactor") || null;

  // Storage-layer anonymity enforcement: never persist a reporter name when
  // the report is anonymous, regardless of what the form submitted.
  const reporterName = sanitizeReporterName(anonymous, str(formData, "reporterName") || null);

  const validation = validateRootCause(rootCauseIsHumanErrorOnly, systemContributingFactor);

  await db.insert(hseIncidents).values({
    kind: str(formData, "kind"),
    severity: num(formData, "severity", 1),
    location: str(formData, "location"),
    occurredAt: new Date(str(formData, "occurredAt") || Date.now()),
    anonymous,
    reporterName,
    rootCauseIsHumanErrorOnly,
    systemContributingFactor,
    status: validation.valid ? "open" : "rejected-root-cause",
  });
  revalidatePath("/hse");
}

export async function closeIncident(formData: FormData) {
  const id = num(formData, "id");
  const correctiveAction = str(formData, "correctiveAction");
  const [incident] = await db.select().from(hseIncidents).where(eq(hseIncidents.id, id));
  if (!incident) return;
  if (incident.status === "rejected-root-cause") {
    // Cannot close until the root cause is revised with a system-contributing factor.
    return;
  }
  await db.update(hseIncidents).set({ correctiveAction, status: "closed" }).where(eq(hseIncidents.id, id));
  revalidatePath("/hse");
}

// --------------------------------------------------------------------------
// Treasury (Part 138)
// --------------------------------------------------------------------------
export async function createCashPosition(formData: FormData) {
  await db.insert(cashPositions).values({
    entity: str(formData, "entity"),
    currency: str(formData, "currency") || "USD",
    bookBalance: String(num(formData, "bookBalance")),
    bankBalance: String(num(formData, "bankBalance")),
    outstandingItemsTotal: String(num(formData, "outstandingItemsTotal")),
    asOf: str(formData, "asOf"),
  });
  revalidatePath("/treasury");
}

export async function createCovenant(formData: FormData) {
  await db.insert(covenants).values({
    agreementRef: str(formData, "agreementRef"),
    covenantKind: str(formData, "covenantKind"),
    direction: str(formData, "direction") || "max",
    thresholdValue: String(num(formData, "thresholdValue")),
    currentValue: String(num(formData, "currentValue")),
    testDate: str(formData, "testDate"),
  });
  revalidatePath("/treasury");
}

// --------------------------------------------------------------------------
// Capstone (Part 139)
// --------------------------------------------------------------------------
export async function toggleCharterPromise(formData: FormData) {
  const id = num(formData, "id");
  const [promise] = await db.select().from(charterPromises).where(eq(charterPromises.id, id));
  if (!promise) return;
  await db.update(charterPromises).set({ verified: !promise.verified }).where(eq(charterPromises.id, id));
  revalidatePath("/capstone");
}

// --------------------------------------------------------------------------
// Demo seed — populates every module with representative data from a clean DB.
// --------------------------------------------------------------------------
export async function seedDemoData() {
  const existing = await db.select({ id: closeTasks.id }).from(closeTasks).limit(1);
  if (existing.length > 0) return;

  await db.insert(closeTasks).values([
    { entity: "Acme Holdings", taskName: "Bank reconciliation — operating account", sequence: 1, owner: "A. Reyes", slaHours: 24, evidenceRef: "recon-1001", status: "signed-off", signedOffBy: "A. Reyes", signedOffAt: new Date() },
    { entity: "Acme Holdings", taskName: "Accrue payroll liabilities", sequence: 2, owner: "B. Chen", slaHours: 12, status: "in-progress" },
    { entity: "Acme EU BV", taskName: "Intercompany elimination", sequence: 3, owner: "C. Dubois", slaHours: 18, status: "blocked" },
  ]);

  await db.insert(reconciliations).values([
    { accountId: "1000-OPERATING", period: "2026-01", sourceBalance: "482310.55", glBalance: "480310.55", reconcilingItemsTotal: "2000.00", toleranceUsd: "1", preparer: "A. Reyes" },
    { accountId: "1010-PAYROLL", period: "2026-01", sourceBalance: "99500.00", glBalance: "100500.00", reconcilingItemsTotal: "-600.00", toleranceUsd: "1", preparer: "B. Chen" },
  ]);

  await db.insert(contracts).values([
    { counterparty: "Northwind Cloud Services", contractType: "SaaS subscription", valueUsd: "240000", renewalDate: "2026-02-10", noticeDays: 60, autoRenew: true, riskClauses: "auto-escalation,price-escalation-uncapped" },
    { counterparty: "Fabrikam Logistics", contractType: "Master services agreement", valueUsd: "1200000", renewalDate: "2027-06-01", noticeDays: 90, autoRenew: true, riskClauses: "unlimited-liability" },
  ]);

  await db.insert(invoices).values([
    { vendor: "Northwind Cloud Services", poAmount: "20000", receiptAmount: "20000", invoiceAmount: "20015", toleranceUsd: "25" },
    { vendor: "Contoso Facilities", poAmount: "5000", receiptAmount: "5000", invoiceAmount: "7200", toleranceUsd: "25" },
    { vendor: "Unknown Vendor LLC", poAmount: "15000", receiptAmount: "15000", invoiceAmount: "15010", toleranceUsd: "25", bankChangeRequested: true },
  ]);

  await db.insert(itsmTickets).values([
    { category: "Access request", requester: "jsmith", priority: 3, status: "open" },
    { category: "Outage", requester: "ops-bot", priority: 1, status: "open", pausedHours: 0 },
    { category: "Hardware", requester: "kpatel", priority: 4, status: "resolved", resolvedAt: new Date() },
  ]);

  await db.insert(hseIncidents).values([
    { kind: "near-miss", severity: 2, location: "Plant 3 — Loading Dock", occurredAt: new Date(), anonymous: true, reporterName: null, status: "open" },
    { kind: "injury", severity: 4, location: "Plant 1 — Line 2", occurredAt: new Date(), anonymous: false, reporterName: "Supervisor on duty", rootCauseIsHumanErrorOnly: true, systemContributingFactor: null, status: "rejected-root-cause" },
  ]);

  await db.insert(cashPositions).values([
    { entity: "Acme Holdings", currency: "USD", bookBalance: "1250000", bankBalance: "1200000", outstandingItemsTotal: "50000", asOf: "2026-01-31" },
    { entity: "Acme EU BV", currency: "EUR", bookBalance: "430000", bankBalance: "428000", outstandingItemsTotal: "1500", asOf: "2026-01-31" },
  ]);

  await db.insert(covenants).values([
    { agreementRef: "Term Loan A", covenantKind: "leverage", direction: "max", thresholdValue: "4.00", currentValue: "3.65", testDate: "2026-01-31" },
    { agreementRef: "Revolver", covenantKind: "interest-cover", direction: "min", thresholdValue: "2.50", currentValue: "2.10", testDate: "2026-01-31" },
  ]);

  await db.insert(charterPromises).values([
    { statement: "Every reconciliation enforces source − GL = Σ reconciling items within tolerance.", promiseClass: "does", enforcement: "src/lib/calc/close.ts#evaluateReconciliation", verified: true, dimension: "trust" },
    { statement: "Evidence-less close-task sign-off is never permitted.", promiseClass: "never-does", enforcement: "src/app/actions.ts#signOffCloseTask", verified: true, dimension: "trust" },
    { statement: "A bank-detail change is never paid without dual control.", promiseClass: "never-does", enforcement: "src/lib/calc/procurement.ts#bankChangePaymentAllowed", verified: true, dimension: "trust" },
    { statement: "SLA clocks pause while a ticket waits on the requester.", promiseClass: "does", enforcement: "src/lib/calc/itsm.ts#evaluateSla", verified: true, dimension: "automation" },
    { statement: "An anonymous HSE report never persists a reporter identity.", promiseClass: "never-does", enforcement: "src/lib/calc/hse.ts#sanitizeReporterName", verified: true, dimension: "dignity" },
    { statement: "'Human error' alone is never accepted as a closed root cause.", promiseClass: "never-does", enforcement: "src/lib/calc/hse.ts#validateRootCause", verified: true, dimension: "dignity" },
    { statement: "Benford's-law checks flag manual-entry distributions; they never accuse.", promiseClass: "does", enforcement: "src/lib/calc/close.ts#benfordFirstDigitCheck", verified: true, dimension: "trust" },
    { statement: "Covenant headroom is computed from an explicit max/min direction, never assumed.", promiseClass: "does", enforcement: "src/lib/calc/treasury.ts#evaluateCovenant", verified: true, dimension: "intelligence" },
    { statement: "Cash reconciliation enforces book − bank = outstanding items.", promiseClass: "does", enforcement: "src/lib/calc/treasury.ts#cashReconciliationResidual", verified: true, dimension: "trust" },
    { statement: "At least 15 contract risk-clause types are enumerated and trackable.", promiseClass: "does", enforcement: "src/lib/calc/procurement.ts#enumeratedRiskClauses", verified: true, dimension: "universality" },
    { statement: "Maturity levels render 'not-assessed' when no evidence exists, rather than a guessed level.", promiseClass: "does", enforcement: "src/lib/maturity.ts#assessMaturity", verified: true, dimension: "operability" },
    { statement: "Every module is reachable from navigation with no hidden setup steps.", promiseClass: "does", enforcement: "src/app/layout.tsx", verified: true, dimension: "operability" },
  ]);

  revalidatePath("/", "layout");
}
