import { db } from "@/db";
import { people, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { GoalRecord, Person, SkillRecord, Team } from "../../domain/types";

function tenureMonths(hireDate: string, asOf: Date = new Date()): number {
  const hired = new Date(hireDate);
  return Math.max(
    0,
    (asOf.getFullYear() - hired.getFullYear()) * 12 + (asOf.getMonth() - hired.getMonth()),
  );
}

type PersonRow = typeof people.$inferSelect;

function toDomain(row: PersonRow): Person {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    title: row.title,
    teamId: row.teamId,
    managerId: row.managerId,
    hireDate: String(row.hireDate),
    location: row.location,
    employmentStatus: row.employmentStatus,
    compaRatio: row.compaRatio == null ? null : Number(row.compaRatio),
    skills: (row.skills as SkillRecord[]) ?? [],
    goals: (row.goals as GoalRecord[]) ?? [],
    tenureMonths: tenureMonths(String(row.hireDate)),
  };
}

export interface CreatePersonInput {
  displayName: string;
  email: string;
  title: string;
  teamId: number | null;
  managerId: number | null;
  hireDate: string;
  location: string;
  compaRatio?: number | null;
  skills?: SkillRecord[];
  goals?: GoalRecord[];
}

export const peopleRepository = {
  async getById(id: number): Promise<Person | null> {
    const [row] = await db.select().from(people).where(eq(people.id, id)).limit(1);
    return row ? toDomain(row) : null;
  },

  async list(): Promise<Person[]> {
    const rows = await db.select().from(people);
    return rows.map(toDomain);
  },

  async listByManager(managerId: number): Promise<Person[]> {
    const rows = await db.select().from(people).where(eq(people.managerId, managerId));
    return rows.map(toDomain);
  },

  async listByTeam(teamId: number): Promise<Person[]> {
    const rows = await db.select().from(people).where(eq(people.teamId, teamId));
    return rows.map(toDomain);
  },

  async create(input: CreatePersonInput): Promise<Person> {
    const [row] = await db
      .insert(people)
      .values({
        displayName: input.displayName,
        email: input.email,
        title: input.title,
        teamId: input.teamId,
        managerId: input.managerId,
        hireDate: input.hireDate,
        location: input.location,
        compaRatio: input.compaRatio != null ? String(input.compaRatio) : null,
        skills: input.skills ?? [],
        goals: input.goals ?? [],
      })
      .returning();
    return toDomain(row);
  },

  async update(id: number, patch: Partial<CreatePersonInput>): Promise<Person | null> {
    const [row] = await db
      .update(people)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.teamId !== undefined ? { teamId: patch.teamId } : {}),
        ...(patch.managerId !== undefined ? { managerId: patch.managerId } : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.compaRatio !== undefined
          ? { compaRatio: patch.compaRatio != null ? String(patch.compaRatio) : null }
          : {}),
        ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
        ...(patch.goals !== undefined ? { goals: patch.goals } : {}),
        updatedAt: new Date(),
      })
      .where(eq(people.id, id))
      .returning();
    return row ? toDomain(row) : null;
  },
};

type TeamRow = typeof teams.$inferSelect;

function teamToDomain(row: TeamRow): Team {
  return { id: row.id, name: row.name, department: row.department, leadId: row.leadId };
}

export const teamsRepository = {
  async list(): Promise<Team[]> {
    const rows = await db.select().from(teams);
    return rows.map(teamToDomain);
  },
  async getById(id: number): Promise<Team | null> {
    const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return row ? teamToDomain(row) : null;
  },
  async create(input: { name: string; department: string; leadId: number | null }): Promise<Team> {
    const [row] = await db.insert(teams).values(input).returning();
    return teamToDomain(row);
  },
};
