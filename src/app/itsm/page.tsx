import { db } from "@/db";
import { itsmTickets } from "@/db/schema";
import { evaluateSla, slaHoursForTicket } from "@/lib/calc/itsm";
import { Badge, Card, EmptyRow, FormRow, SubmitButton, Td, Th, inputClass } from "@/components/ui";
import { createTicket, pauseTicket, resolveTicket } from "@/app/actions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PRIORITY_LABEL: Record<number, string> = { 1: "P1 — Critical", 2: "P2 — High", 3: "P3 — Normal", 4: "P4 — Low" };

export default async function ItsmPage() {
  const tickets = await db.select().from(itsmTickets).orderBy(desc(itsmTickets.id));
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">IT Service Management (Part 126)</h1>
        <p className="mt-1 text-sm text-slate-600">
          SLA clocks derive from priority (or an explicit override) and pause while a ticket waits on the requester.
        </p>
      </div>

      <Card title="Tickets">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Category</Th><Th>Requester</Th><Th>Priority</Th><Th>SLA (h)</Th><Th>Paused (h)</Th><Th>Status</Th><Th>SLA status</Th><Th>Actions</Th></tr>
          </thead>
          <tbody>
            {tickets.length === 0 && <EmptyRow colSpan={8}>No tickets yet.</EmptyRow>}
            {tickets.map((t) => {
              const slaHours = slaHoursForTicket(t.priority, t.slaHours);
              const evalResult = evaluateSla(t.createdAt, slaHours, t.pausedHours, now, t.resolvedAt);
              return (
                <tr key={t.id}>
                  <Td>{t.category}</Td>
                  <Td>{t.requester}</Td>
                  <Td>{PRIORITY_LABEL[t.priority] ?? t.priority}</Td>
                  <Td>{slaHours}</Td>
                  <Td>{t.pausedHours}</Td>
                  <Td><Badge status={t.status} /></Td>
                  <Td>
                    {t.status === "resolved" ? (
                      <Badge status={evalResult.breached ? "exception" : "matched"} label={evalResult.breached ? "Breached" : "Met"} />
                    ) : (
                      <Badge status={evalResult.breached ? "exception" : "on-track"} label={evalResult.breached ? "Breached" : `${evalResult.hoursRemaining.toFixed(1)}h left`} />
                    )}
                  </Td>
                  <Td>
                    {t.status !== "resolved" && (
                      <div className="flex gap-1">
                        <form action={pauseTicket}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="hours" value={1} />
                          <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100" type="submit">
                            +1h pause
                          </button>
                        </form>
                        <form action={resolveTicket}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700" type="submit">
                            Resolve
                          </button>
                        </form>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <form action={createTicket} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5">
          <FormRow label="Category"><input name="category" required className={inputClass} /></FormRow>
          <FormRow label="Requester"><input name="requester" required className={inputClass} /></FormRow>
          <FormRow label="Priority">
            <select name="priority" className={inputClass} defaultValue={3}>
              <option value={1}>P1 — Critical</option>
              <option value={2}>P2 — High</option>
              <option value={3}>P3 — Normal</option>
              <option value={4}>P4 — Low</option>
            </select>
          </FormRow>
          <FormRow label="SLA override (h, optional)"><input name="slaHours" type="number" className={inputClass} /></FormRow>
          <div className="col-span-2 sm:col-span-5"><SubmitButton>Add ticket</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
