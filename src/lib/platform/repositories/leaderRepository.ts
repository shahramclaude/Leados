// Repository layer: the ONLY module (besides other repositories) allowed
// to import the Drizzle `db` client and the `leaders` table.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leaders } from "@/db/schema";

export interface LeaderRecord {
  id: string;
  organizationId: string;
  name: string;
  role: string;
  email: string;
  readinessScore: string | null;
  readinessBand: string | null;
  createdAt: Date;
}

export interface CreateLeaderInput {
  id: string;
  organizationId: string;
  name: string;
  role: string;
  email: string;
  readinessScore: number;
  readinessBand: string;
}

export const leaderRepository = {
  async create(input: CreateLeaderInput): Promise<LeaderRecord> {
    const [row] = await db
      .insert(leaders)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        name: input.name,
        role: input.role,
        email: input.email,
        readinessScore: String(input.readinessScore),
        readinessBand: input.readinessBand,
      })
      .returning();
    return row;
  },

  async list(): Promise<LeaderRecord[]> {
    return db.select().from(leaders).orderBy(leaders.createdAt);
  },

  async findById(id: string): Promise<LeaderRecord | undefined> {
    const [row] = await db.select().from(leaders).where(eq(leaders.id, id)).limit(1);
    return row;
  },

  async count(): Promise<number> {
    const rows = await db.select().from(leaders);
    return rows.length;
  },
};
