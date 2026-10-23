import { db } from "@/db";
import {
  minutes as minutesTable,
  resolutions,
  resolutionVotes,
  resolutionImplementationLinks,
  oversightMilestones,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { SearchableMinutes } from "@/components/governance/SearchableMinutes";

export const dynamic = "force-dynamic";

export default async function MinutesAndResolutionsPage() {
  const minutesRows = await db.select().from(minutesTable);
  const resolutionRows = await db.select().from(resolutions);

  const resolutionsFull = await Promise.all(
    resolutionRows.map(async (r) => {
      const votes = await db
        .select()
        .from(resolutionVotes)
        .where(eq(resolutionVotes.resolutionId, r.id));
      const links = await db
        .select()
        .from(resolutionImplementationLinks)
        .where(eq(resolutionImplementationLinks.resolutionId, r.id));
      const milestones = await db
        .select()
        .from(oversightMilestones)
        .where(eq(oversightMilestones.resolutionId, r.id));
      return {
        id: r.id,
        meetingId: r.meetingId,
        text: r.text,
        type: r.type,
        status: r.status,
        votes: votes.map((v) => ({
          directorId: v.directorId,
          vote: v.vote,
          conflictDeclared: v.conflictDeclared,
        })),
        links: links.map((l) => ({ taskId: l.taskId })),
        milestones: milestones.map((m) => ({
          id: m.id,
          status: m.status,
          milestoneDate: m.milestoneDate.toISOString(),
        })),
      };
    }),
  );

  const minutesData = minutesRows.map((m) => ({
    id: m.id,
    meetingId: m.meetingId,
    generatedSummary: m.generatedSummary,
    finalized: m.finalized,
    finalizedByTier: m.finalizedByTier,
    verbatimExcerpts: (m.verbatimExcerpts as MinutesRowExcerpt[]) ?? [],
    hash: m.hash,
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Minutes &amp; Resolutions</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Minutes keep manually-entered verbatim excerpts separate from the generated narrative
        summary. Finalization is a hard stop restricted to the company secretary or chair — see
        Part 55&apos;s <code>finalizeMinutes</code>.
      </p>
      <div className="mt-6">
        <SearchableMinutes minutes={minutesData} resolutions={resolutionsFull} />
      </div>
    </main>
  );
}

type MinutesRowExcerpt = { speaker: string; quote: string; timestampLabel: string };
