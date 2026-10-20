// Repository layer: the ONLY module (besides other repositories) allowed
// to import the Drizzle `db` client and the `organizations` table. Every
// other layer reaches Postgres through functions exported here.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

export interface OrganizationRecord {
  id: string;
  name: string;
  createdAt: Date;
}

export const organizationRepository = {
  async create(input: { id: string; name: string }): Promise<OrganizationRecord> {
    const [row] = await db
      .insert(organizations)
      .values({ id: input.id, name: input.name })
      .returning();
    return row;
  },

  async findById(id: string): Promise<OrganizationRecord | undefined> {
    const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return row;
  },

  async list(): Promise<OrganizationRecord[]> {
    return db.select().from(organizations).orderBy(organizations.createdAt);
  },

  async count(): Promise<number> {
    const rows = await db.select().from(organizations);
    return rows.length;
  },
};
