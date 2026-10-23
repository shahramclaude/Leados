import { db } from "@/db";
import { cashPositions, covenants } from "@/db/schema";
import { cashReconciliationResidual, evaluateCovenant } from "@/lib/calc/treasury";
import { Badge, Card, EmptyRow, FormRow, SubmitButton, Td, Th, inputClass } from "@/components/ui";
import { formatDate, formatPct, formatUsd } from "@/lib/format";
import { createCashPosition, createCovenant } from "@/app/actions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
  const [cashRows, covenantRows] = await Promise.all([
    db.select().from(cashPositions).orderBy(desc(cashPositions.id)),
    db.select().from(covenants).orderBy(desc(covenants.id)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Treasury & Capital Allocation (Part 138)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cash positions enforce <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">book − bank = outstanding items</code>,
          and covenant headroom is computed from an explicit direction rather than assumed.
        </p>
      </div>

      <Card title="Cash positions">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Entity</Th><Th>Currency</Th><Th>Book</Th><Th>Bank</Th><Th>Outstanding items</Th><Th>Residual</Th><Th>As of</Th></tr>
          </thead>
          <tbody>
            {cashRows.length === 0 && <EmptyRow colSpan={7}>No cash positions yet.</EmptyRow>}
            {cashRows.map((c) => {
              const residual = cashReconciliationResidual(
                parseFloat(c.bookBalance),
                parseFloat(c.bankBalance),
                parseFloat(c.outstandingItemsTotal),
              );
              return (
                <tr key={c.id}>
                  <Td>{c.entity}</Td>
                  <Td>{c.currency}</Td>
                  <Td>{formatUsd(c.bookBalance)}</Td>
                  <Td>{formatUsd(c.bankBalance)}</Td>
                  <Td>{formatUsd(c.outstandingItemsTotal)}</Td>
                  <Td><Badge status={residual === 0 ? "matched" : "exception"} label={formatUsd(residual)} /></Td>
                  <Td>{formatDate(c.asOf)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createCashPosition} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5">
          <FormRow label="Entity"><input name="entity" required className={inputClass} /></FormRow>
          <FormRow label="Currency"><input name="currency" defaultValue="USD" className={inputClass} /></FormRow>
          <FormRow label="Book balance"><input name="bookBalance" type="number" step="0.01" required className={inputClass} /></FormRow>
          <FormRow label="Bank balance"><input name="bankBalance" type="number" step="0.01" required className={inputClass} /></FormRow>
          <FormRow label="Outstanding items total"><input name="outstandingItemsTotal" type="number" step="0.01" defaultValue={0} className={inputClass} /></FormRow>
          <FormRow label="As of"><input name="asOf" type="date" required className={inputClass} /></FormRow>
          <div className="col-span-2 sm:col-span-5"><SubmitButton>Add cash position</SubmitButton></div>
        </form>
      </Card>

      <Card title="Covenants">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Agreement</Th><Th>Kind</Th><Th>Direction</Th><Th>Threshold</Th><Th>Current</Th><Th>Headroom</Th><Th>Status</Th><Th>Test date</Th></tr>
          </thead>
          <tbody>
            {covenantRows.length === 0 && <EmptyRow colSpan={8}>No covenants yet.</EmptyRow>}
            {covenantRows.map((c) => {
              const result = evaluateCovenant(c.direction as "max" | "min", parseFloat(c.thresholdValue), parseFloat(c.currentValue));
              return (
                <tr key={c.id}>
                  <Td>{c.agreementRef}</Td>
                  <Td>{c.covenantKind}</Td>
                  <Td>{c.direction}</Td>
                  <Td>{parseFloat(c.thresholdValue).toFixed(2)}</Td>
                  <Td>{parseFloat(c.currentValue).toFixed(2)}</Td>
                  <Td>{formatPct(result.headroomPct)}</Td>
                  <Td><Badge status={result.status} /></Td>
                  <Td>{formatDate(c.testDate)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createCovenant} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-6">
          <FormRow label="Agreement ref"><input name="agreementRef" required className={inputClass} /></FormRow>
          <FormRow label="Kind">
            <select name="covenantKind" className={inputClass} defaultValue="leverage">
              <option value="leverage">Leverage</option>
              <option value="interest-cover">Interest cover</option>
              <option value="liquidity">Liquidity</option>
              <option value="custom">Custom</option>
            </select>
          </FormRow>
          <FormRow label="Direction">
            <select name="direction" className={inputClass} defaultValue="max">
              <option value="max">Max (current ≤ threshold)</option>
              <option value="min">Min (current ≥ threshold)</option>
            </select>
          </FormRow>
          <FormRow label="Threshold"><input name="thresholdValue" type="number" step="0.0001" required className={inputClass} /></FormRow>
          <FormRow label="Current value"><input name="currentValue" type="number" step="0.0001" required className={inputClass} /></FormRow>
          <FormRow label="Test date"><input name="testDate" type="date" required className={inputClass} /></FormRow>
          <div className="col-span-2 sm:col-span-6"><SubmitButton>Add covenant</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
