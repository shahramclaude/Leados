import Link from "next/link";
import { db } from "@/db";
import {
  boardMeetings,
  boardPacks,
  resolutions,
  oversightMilestones,
  informationRequests,
} from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  materials_due: "bg-amber-100 text-amber-800",
  pack_assembled: "bg-blue-100 text-blue-800",
  convened: "bg-indigo-100 text-indigo-800",
  minutes_finalized: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-600",
  complete: "bg-emerald-100 text-emerald-800",
  red_flag: "bg-rose-100 text-rose-800",
  pending: "bg-slate-100 text-slate-700",
};

function Pill({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[value] ?? "bg-slate-100 text-slate-700"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export default async function BoardPortalPage() {
  const meetings = await db.select().from(boardMeetings).orderBy(desc(boardMeetings.scheduledAt));
  const packs = await db.select().from(boardPacks).orderBy(desc(boardPacks.id));
  const allResolutions = await db.select().from(resolutions).orderBy(desc(resolutions.id));
  const milestones = await db
    .select()
    .from(oversightMilestones)
    .orderBy(oversightMilestones.milestoneDate);
  const infoRequests = await db
    .select()
    .from(informationRequests)
    .orderBy(desc(informationRequests.createdAt));

  const packsByMeeting = new Map(packs.map((p) => [p.meetingId, p]));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Board Portal</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Packs carry a numbers-freeze timestamp once assembled, a mandatory risk/controls +
        compliance-attestations section (Part 29), and a completeness red-flag check. Full packs
        are only readable by chair, director, and company-secretary tiers — see the{" "}
        <Link href="/governance/access-matrix" className="underline">
          access matrix
        </Link>
        .
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Board cycle: meetings &amp; packs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Meeting</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Materials deadline</th>
                <th className="px-4 py-3">Escalation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pack</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meetings.map((m) => {
                const pack = packsByMeeting.get(m.id);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">#{m.id}</td>
                    <td className="px-4 py-3 text-slate-600">{m.tier}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(m.scheduledAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(m.materialsDeadline)}</td>
                    <td className="px-4 py-3 text-slate-600">{m.escalationLevel}</td>
                    <td className="px-4 py-3">
                      <Pill value={m.status} />
                    </td>
                    <td className="px-4 py-3">
                      {pack ? (
                        <Link href={`/board/packs/${pack.id}`} className="underline">
                          <Pill value={pack.completenessStatus} />
                        </Link>
                      ) : (
                        <span className="text-slate-400">none</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {meetings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                    No meetings scheduled yet. Run <code>npm run verify</code> to seed a full cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Resolution tracker</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Text</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allResolutions.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/governance/minutes#resolution-${r.id}`} className="underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.text}</td>
                  <td className="px-4 py-3 text-slate-600">{r.type}</td>
                  <td className="px-4 py-3">
                    <Pill value={r.status} />
                  </td>
                </tr>
              ))}
              {allResolutions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No resolutions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Oversight calendar</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Milestone date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.map((ms) => (
                <tr key={ms.id}>
                  <td className="px-4 py-3 text-slate-600">#{ms.resolutionId}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(ms.milestoneDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{ms.description}</td>
                  <td className="px-4 py-3">
                    <Pill value={ms.status} />
                  </td>
                </tr>
              ))}
              {milestones.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No oversight milestones scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-lg font-semibold text-slate-900">Information requests</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {infoRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-600">{r.subject}</td>
                  <td className="px-4 py-3 text-slate-600">{r.targetTier}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(r.dueDate)}</td>
                  <td className="px-4 py-3">
                    <Pill value={r.status} />
                  </td>
                </tr>
              ))}
              {infoRequests.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    No information requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
