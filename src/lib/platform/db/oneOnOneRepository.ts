import { db } from "@/db";
import { oneOnOnes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { Commitment, OneOnOne, TalkingPointSuggestion, Viewer } from "../../domain/types";
import { canView, effectiveRole } from "../../domain/people/privacy";

type Row = typeof oneOnOnes.$inferSelect;

function toDomain(row: Row): OneOnOne {
  return {
    id: row.id,
    personId: row.personId,
    managerId: row.managerId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status as OneOnOne["status"],
    sharedAgenda: (row.sharedAgenda as string[]) ?? [],
    talkingPointSuggestions: (row.talkingPointSuggestions as TalkingPointSuggestion[]) ?? [],
    commitments: (row.commitments as Commitment[]) ?? [],
    sharedSummary: row.sharedSummary,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export interface CreateOneOnOneInput {
  personId: number;
  managerId: number;
  scheduledAt: string;
  sharedAgenda?: string[];
  talkingPointSuggestions?: TalkingPointSuggestion[];
}

export const oneOnOneRepository = {
  async listForPerson(personId: number): Promise<OneOnOne[]> {
    const rows = await db
      .select()
      .from(oneOnOnes)
      .where(eq(oneOnOnes.personId, personId))
      .orderBy(desc(oneOnOnes.scheduledAt));
    return rows.map(toDomain);
  },

  async getById(id: number): Promise<OneOnOne | null> {
    const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, id)).limit(1);
    return row ? toDomain(row) : null;
  },

  /**
   * Returns the manager's private notes for a 1:1 ONLY if the viewer is the
   * authoring manager or HR. This is the server-side enforcement point the
   * standing order requires — there is deliberately no code path that
   * returns `privateManagerNotes` to anyone else, including the employee
   * the 1:1 is about or an exec.
   */
  async getPrivateNotes(id: number, viewer: Viewer): Promise<string | null> {
    const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, id)).limit(1);
    if (!row) return null;
    const role = effectiveRole(viewer, row.personId);
    const isAuthoringManager = viewer.id === row.managerId;
    if (role === "hr" || isAuthoringManager) {
      return row.privateManagerNotes;
    }
    return null;
  },

  async create(input: CreateOneOnOneInput): Promise<OneOnOne> {
    const [row] = await db
      .insert(oneOnOnes)
      .values({
        personId: input.personId,
        managerId: input.managerId,
        scheduledAt: new Date(input.scheduledAt),
        sharedAgenda: input.sharedAgenda ?? [],
        talkingPointSuggestions: input.talkingPointSuggestions ?? [],
        commitments: [],
      })
      .returning();
    return toDomain(row);
  },

  async complete(
    id: number,
    patch: { sharedSummary?: string; commitments?: Commitment[]; privateManagerNotes?: string },
  ): Promise<OneOnOne | null> {
    const [row] = await db
      .update(oneOnOnes)
      .set({
        status: "completed",
        completedAt: new Date(),
        ...(patch.sharedSummary !== undefined ? { sharedSummary: patch.sharedSummary } : {}),
        ...(patch.commitments !== undefined ? { commitments: patch.commitments } : {}),
        ...(patch.privateManagerNotes !== undefined
          ? { privateManagerNotes: patch.privateManagerNotes }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(oneOnOnes.id, id))
      .returning();
    return row ? toDomain(row) : null;
  },

  async updateCommitment(id: number, commitmentId: string, status: "done" | "missed"): Promise<OneOnOne | null> {
    const existing = await oneOnOneRepository.getById(id);
    if (!existing) return null;
    const commitments = existing.commitments.map((c) =>
      c.id === commitmentId ? { ...c, status, completedAt: new Date().toISOString() } : c,
    );
    const [row] = await db
      .update(oneOnOnes)
      .set({ commitments, updatedAt: new Date() })
      .where(eq(oneOnOnes.id, id))
      .returning();
    return row ? toDomain(row) : null;
  },
};

/** Field-level check used by API routes rendering a 1:1 to a given viewer. */
export function canViewPrivateNotes(viewer: Viewer, subjectId: number): boolean {
  return canView(viewer, subjectId, "privateManagerNotes");
}
