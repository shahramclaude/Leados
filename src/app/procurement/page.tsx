import { db } from "@/db";
import { contracts, invoices } from "@/db/schema";
import {
  bankChangePaymentAllowed,
  enumeratedRiskClauses,
  invoiceMatchStatus,
  renewalAlertStatus,
} from "@/lib/calc/procurement";
import { Badge, Card, EmptyRow, FormRow, SubmitButton, Td, Th, inputClass } from "@/components/ui";
import { formatDate, formatUsd } from "@/lib/format";
import { approveDualControl, createContract, createInvoice, markContractDecision } from "@/app/actions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProcurementPage() {
  const [contractRows, invoiceRows] = await Promise.all([
    db.select().from(contracts).orderBy(desc(contracts.id)),
    db.select().from(invoices).orderBy(desc(invoices.id)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Source-to-Pay & Contract Lifecycle (Part 125)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Renewal notice-date math, three-way invoice matching, and dual-control on bank-detail changes.
        </p>
      </div>

      <Card title="Contracts" subtitle="Renewal alerts fire from the notice deadline, not the renewal date itself.">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Counterparty</Th><Th>Type</Th><Th>Value</Th><Th>Renewal date</Th><Th>Notice deadline</Th><Th>Status</Th><Th>Risk clauses</Th><Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {contractRows.length === 0 && <EmptyRow colSpan={8}>No contracts yet.</EmptyRow>}
            {contractRows.map((c) => {
              const alert = renewalAlertStatus(c.renewalDate, c.noticeDays, c.decisionMade);
              return (
                <tr key={c.id}>
                  <Td>{c.counterparty}</Td>
                  <Td>{c.contractType}</Td>
                  <Td>{formatUsd(c.valueUsd)}</Td>
                  <Td>{formatDate(c.renewalDate)}</Td>
                  <Td>{alert.noticeDeadlineIso} ({alert.daysToDeadline}d)</Td>
                  <Td><Badge status={alert.status} /></Td>
                  <Td className="max-w-[12rem]">
                    <div className="flex flex-wrap gap-1">
                      {(c.riskClauses ?? "").split(",").filter(Boolean).map((rc) => (
                        <span key={rc} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">{rc}</span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {c.decisionMade ? (
                      <span className="text-xs text-slate-400">Decided</span>
                    ) : (
                      <form action={markContractDecision}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700" type="submit">
                          Mark decided
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createContract} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <FormRow label="Counterparty"><input name="counterparty" required className={inputClass} /></FormRow>
          <FormRow label="Type"><input name="contractType" required className={inputClass} /></FormRow>
          <FormRow label="Value (USD)"><input name="valueUsd" type="number" step="0.01" defaultValue={0} className={inputClass} /></FormRow>
          <FormRow label="Renewal date"><input name="renewalDate" type="date" required className={inputClass} /></FormRow>
          <FormRow label="Notice days"><input name="noticeDays" type="number" defaultValue={30} className={inputClass} /></FormRow>
          <FormRow label="Auto-renew">
            <select name="autoRenew" className={inputClass} defaultValue="on">
              <option value="on">Yes</option>
              <option value="">No</option>
            </select>
          </FormRow>
          <FormRow label="Risk clauses (comma-separated)">
            <input name="riskClauses" placeholder={enumeratedRiskClauses()[0]} className={inputClass} />
          </FormRow>
          <div className="col-span-2 sm:col-span-4"><SubmitButton>Add contract</SubmitButton></div>
        </form>

        <p className="mt-3 text-xs text-slate-400">
          {enumeratedRiskClauses().length} enumerated risk-clause types tracked: {enumeratedRiskClauses().join(", ")}.
        </p>
      </Card>

      <Card title="Invoices" subtitle="Three-way match with tolerance; bank-change requests require dual control.">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Vendor</Th><Th>PO</Th><Th>Receipt</Th><Th>Invoice</Th><Th>Match</Th><Th>Bank change</Th><Th>Payment</Th></tr>
          </thead>
          <tbody>
            {invoiceRows.length === 0 && <EmptyRow colSpan={7}>No invoices yet.</EmptyRow>}
            {invoiceRows.map((inv) => {
              const match = invoiceMatchStatus(
                inv.poAmount ? parseFloat(inv.poAmount) : null,
                inv.receiptAmount ? parseFloat(inv.receiptAmount) : null,
                parseFloat(inv.invoiceAmount),
                parseFloat(inv.toleranceUsd),
              );
              const canPay = bankChangePaymentAllowed(inv.bankChangeRequested, inv.dualControlApproved);
              return (
                <tr key={inv.id}>
                  <Td>{inv.vendor}</Td>
                  <Td>{inv.poAmount ? formatUsd(inv.poAmount) : "—"}</Td>
                  <Td>{inv.receiptAmount ? formatUsd(inv.receiptAmount) : "—"}</Td>
                  <Td>{formatUsd(inv.invoiceAmount)}</Td>
                  <Td><Badge status={match} /></Td>
                  <Td>{inv.bankChangeRequested ? <Badge status="true" label="Requested" /> : <Badge status="false" label="None" />}</Td>
                  <Td>
                    {!inv.bankChangeRequested ? (
                      <span className="text-xs text-emerald-700">Clear to pay</span>
                    ) : canPay ? (
                      <span className="text-xs text-emerald-700">Dual control approved — clear to pay</span>
                    ) : (
                      <form action={approveDualControl}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500" type="submit">
                          Approve dual control
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createInvoice} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-6">
          <FormRow label="Vendor"><input name="vendor" required className={inputClass} /></FormRow>
          <FormRow label="PO amount"><input name="poAmount" type="number" step="0.01" className={inputClass} /></FormRow>
          <FormRow label="Receipt amount"><input name="receiptAmount" type="number" step="0.01" className={inputClass} /></FormRow>
          <FormRow label="Invoice amount"><input name="invoiceAmount" type="number" step="0.01" required className={inputClass} /></FormRow>
          <FormRow label="Tolerance (USD)"><input name="toleranceUsd" type="number" step="0.01" defaultValue={5} className={inputClass} /></FormRow>
          <FormRow label="Bank change requested">
            <select name="bankChangeRequested" className={inputClass} defaultValue="">
              <option value="">No</option>
              <option value="on">Yes</option>
            </select>
          </FormRow>
          <div className="col-span-2 sm:col-span-6"><SubmitButton>Add invoice</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
