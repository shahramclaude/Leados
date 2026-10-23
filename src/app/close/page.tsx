import { db } from "@/db";
import { closeTasks, reconciliations } from "@/db/schema";
import { benfordFirstDigitCheck, canSignOff, evaluateReconciliation } from "@/lib/calc/close";
import { Badge, Card, EmptyRow, FormRow, SubmitButton, Td, Th, inputClass } from "@/components/ui";
import { formatDateTime, formatUsd } from "@/lib/format";
import { createCloseTask, createReconciliation, signOffCloseTask } from "@/app/actions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const [tasks, recons] = await Promise.all([
    db.select().from(closeTasks).orderBy(closeTasks.sequence),
    db.select().from(reconciliations).orderBy(desc(reconciliations.id)),
  ]);

  const benford = benfordFirstDigitCheck(recons.map((r) => Math.abs(parseFloat(r.sourceBalance))));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Financial Close (Part 124)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Close calendar with evidence-gated sign-off, and reconciliations enforcing the identity{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">source − GL = Σ reconciling items</code>.
        </p>
      </div>

      <Card title="Close calendar">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Seq</Th>
              <Th>Entity</Th>
              <Th>Task</Th>
              <Th>Owner</Th>
              <Th>SLA (h)</Th>
              <Th>Status</Th>
              <Th>Evidence</Th>
              <Th>Sign off</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <EmptyRow colSpan={8}>No close tasks yet.</EmptyRow>}
            {tasks.map((t) => {
              const signoff = canSignOff({ id: t.id, sequence: t.sequence, status: t.status, evidenceRef: t.evidenceRef });
              return (
                <tr key={t.id}>
                  <Td>{t.sequence}</Td>
                  <Td>{t.entity}</Td>
                  <Td>{t.taskName}</Td>
                  <Td>{t.owner}</Td>
                  <Td>{t.slaHours}</Td>
                  <Td><Badge status={t.status} /></Td>
                  <Td>{t.evidenceRef ?? "—"}</Td>
                  <Td>
                    {t.status === "signed-off" ? (
                      <span className="text-xs text-slate-400">{formatDateTime(t.signedOffAt)}</span>
                    ) : (
                      <form action={signOffCloseTask} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <input name="evidenceRef" placeholder="evidence ref" className={`${inputClass} w-28`} />
                        <input name="signedOffBy" placeholder="signer" className={`${inputClass} w-20`} />
                        <button className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700" type="submit">
                          Sign off
                        </button>
                      </form>
                    )}
                    {!signoff.allowed && t.status !== "signed-off" && (
                      <p className="mt-1 text-[11px] text-rose-600">{signoff.reason}</p>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createCloseTask} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5">
          <FormRow label="Entity"><input name="entity" required className={inputClass} /></FormRow>
          <FormRow label="Task"><input name="taskName" required className={inputClass} /></FormRow>
          <FormRow label="Owner"><input name="owner" required className={inputClass} /></FormRow>
          <FormRow label="Sequence"><input name="sequence" type="number" defaultValue={1} className={inputClass} /></FormRow>
          <FormRow label="SLA hours"><input name="slaHours" type="number" defaultValue={24} className={inputClass} /></FormRow>
          <div className="col-span-2 sm:col-span-5"><SubmitButton>Add close task</SubmitButton></div>
        </form>
      </Card>

      <Card title="Reconciliations" subtitle="Identity verified per account; exceptions surface, never hide.">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Period</Th>
              <Th>Source</Th>
              <Th>GL</Th>
              <Th>Reconciling items</Th>
              <Th>Residual</Th>
              <Th>Status</Th>
              <Th>Preparer</Th>
            </tr>
          </thead>
          <tbody>
            {recons.length === 0 && <EmptyRow colSpan={8}>No reconciliations yet.</EmptyRow>}
            {recons.map((r) => {
              const evalResult = evaluateReconciliation({
                sourceBalance: parseFloat(r.sourceBalance),
                glBalance: parseFloat(r.glBalance),
                reconcilingItemsTotal: parseFloat(r.reconcilingItemsTotal),
                toleranceUsd: parseFloat(r.toleranceUsd),
              });
              return (
                <tr key={r.id}>
                  <Td>{r.accountId}</Td>
                  <Td>{r.period}</Td>
                  <Td>{formatUsd(r.sourceBalance)}</Td>
                  <Td>{formatUsd(r.glBalance)}</Td>
                  <Td>{formatUsd(r.reconcilingItemsTotal)}</Td>
                  <Td>{formatUsd(evalResult.residual)}</Td>
                  <Td><Badge status={evalResult.status} /></Td>
                  <Td>{r.preparer}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createReconciliation} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <FormRow label="Account ID"><input name="accountId" required className={inputClass} /></FormRow>
          <FormRow label="Period"><input name="period" required placeholder="2026-02" className={inputClass} /></FormRow>
          <FormRow label="Source balance"><input name="sourceBalance" type="number" step="0.01" required className={inputClass} /></FormRow>
          <FormRow label="GL balance"><input name="glBalance" type="number" step="0.01" required className={inputClass} /></FormRow>
          <FormRow label="Reconciling items total"><input name="reconcilingItemsTotal" type="number" step="0.01" defaultValue={0} className={inputClass} /></FormRow>
          <FormRow label="Tolerance (USD)"><input name="toleranceUsd" type="number" step="0.01" defaultValue={1} className={inputClass} /></FormRow>
          <FormRow label="Preparer"><input name="preparer" required className={inputClass} /></FormRow>
          <div className="col-span-2 sm:col-span-4"><SubmitButton>Add reconciliation</SubmitButton></div>
        </form>
      </Card>

      <Card title="Benford's-law check on source balances" subtitle="A flag for review — never an accusation.">
        <p className="text-sm text-slate-600">
          Sample size: {benford.sampleSize}. Deviation score: {benford.deviationScore.toFixed(3)} (lower is closer
          to the expected first-digit distribution).
        </p>
        <table className="mt-3 w-full border-collapse text-center">
          <thead>
            <tr><Th>Digit</Th>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <Th key={d}>{d}</Th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <Td>Observed</Td>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <Td key={d}>{(benford.observed[d] * 100).toFixed(0)}%</Td>)}
            </tr>
            <tr>
              <Td>Expected</Td>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <Td key={d}>{(benford.expected[d] * 100).toFixed(0)}%</Td>)}
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
