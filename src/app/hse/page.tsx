import { db } from "@/db";
import { hseIncidents } from "@/db/schema";
import { isRegulatoryReportable, statutoryReportDueAt } from "@/lib/calc/hse";
import { Badge, Card, EmptyRow, FormRow, SubmitButton, Td, Th, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { closeIncident, createIncident } from "@/app/actions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HsePage() {
  const incidents = await db.select().from(hseIncidents).orderBy(desc(hseIncidents.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Health, Safety & Environment (Part 127)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Anonymous reports never persist a reporter identity. A root cause of &ldquo;human error&rdquo; alone is
          rejected until a system-contributing factor is named.
        </p>
      </div>

      <Card title="Incidents">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Kind</Th><Th>Severity</Th><Th>Location</Th><Th>Reporter</Th><Th>Statutory due</Th><Th>Status</Th><Th>Close</Th></tr>
          </thead>
          <tbody>
            {incidents.length === 0 && <EmptyRow colSpan={7}>No incidents yet.</EmptyRow>}
            {incidents.map((i) => {
              const due = statutoryReportDueAt(i.occurredAt, i.severity);
              return (
                <tr key={i.id}>
                  <Td>{i.kind}</Td>
                  <Td>
                    {i.severity}
                    {isRegulatoryReportable(i.severity) && <span className="ml-1 text-[10px] text-rose-600">reportable</span>}
                  </Td>
                  <Td>{i.location}</Td>
                  <Td>{i.anonymous ? <Badge status="true" label="Anonymous" /> : i.reporterName ?? "—"}</Td>
                  <Td>{due ? formatDateTime(due) : "n/a"}</Td>
                  <Td><Badge status={i.status} /></Td>
                  <Td>
                    {i.status === "closed" ? (
                      <span className="text-xs text-slate-400">Closed</span>
                    ) : i.status === "rejected-root-cause" ? (
                      <span className="text-xs text-rose-600">Blocked — revise root cause</span>
                    ) : (
                      <form action={closeIncident} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={i.id} />
                        <input name="correctiveAction" placeholder="corrective action" className={`${inputClass} w-40`} required />
                        <button className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700" type="submit">
                          Close
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createIncident} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <FormRow label="Kind">
            <select name="kind" className={inputClass} defaultValue="near-miss">
              <option value="near-miss">Near-miss</option>
              <option value="injury">Injury</option>
              <option value="environmental">Environmental</option>
              <option value="process-safety">Process safety</option>
            </select>
          </FormRow>
          <FormRow label="Severity (1-5)"><input name="severity" type="number" min={1} max={5} defaultValue={1} className={inputClass} /></FormRow>
          <FormRow label="Location"><input name="location" required className={inputClass} /></FormRow>
          <FormRow label="Occurred at"><input name="occurredAt" type="datetime-local" className={inputClass} /></FormRow>
          <FormRow label="Anonymous">
            <select name="anonymous" className={inputClass} defaultValue="">
              <option value="">No</option>
              <option value="on">Yes</option>
            </select>
          </FormRow>
          <FormRow label="Reporter name (ignored if anonymous)"><input name="reporterName" className={inputClass} /></FormRow>
          <FormRow label="Root cause is 'human error' alone">
            <select name="rootCauseIsHumanErrorOnly" className={inputClass} defaultValue="">
              <option value="">No</option>
              <option value="on">Yes</option>
            </select>
          </FormRow>
          <FormRow label="System-contributing factor (required if above is yes)">
            <input name="systemContributingFactor" className={inputClass} />
          </FormRow>
          <div className="col-span-2 sm:col-span-4"><SubmitButton>Report incident</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
