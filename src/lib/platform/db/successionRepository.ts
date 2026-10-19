import { db } from "@/db";
import { people, successionCandidates, successionRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Readiness } from "../../domain/types";
import type { RoleCoverageInputs, SuccessionCandidateInput } from "../../domain/people/succession";

export const successionRepository = {
  async listRoles() {
    return db.select().from(successionRoles);
  },

  async getRoleById(id: number) {
    const [row] = await db.select().from(successionRoles).where(eq(successionRoles.id, id)).limit(1);
    return row ?? null;
  },

  async createRole(input: {
    title: string;
    teamId: number | null;
    criticality: "low" | "medium" | "high" | "critical";
    incumbentId: number | null;
  }) {
    const [row] = await db.insert(successionRoles).values(input).returning();
    return row;
  },

  async listCandidates(roleId: number): Promise<SuccessionCandidateInput[]> {
    const rows = await db
      .select({
        personId: successionCandidates.personId,
        readiness: successionCandidates.readiness,
        confidence: successionCandidates.confidence,
        evidence: successionCandidates.evidence,
        gapPlan: successionCandidates.gapPlan,
        displayName: people.displayName,
      })
      .from(successionCandidates)
      .innerJoin(people, eq(people.id, successionCandidates.personId))
      .where(eq(successionCandidates.roleId, roleId));

    return rows.map((r) => ({
      personId: r.personId,
      displayName: r.displayName,
      readiness: r.readiness as Readiness,
      confidence: Number(r.confidence),
      evidence: (r.evidence as string[]) ?? [],
      gapPlan: r.gapPlan,
    }));
  },

  async upsertCandidate(input: {
    roleId: number;
    personId: number;
    readiness: Readiness;
    confidence: number;
    evidence: string[];
    gapPlan: string | null;
  }) {
    const [row] = await db
      .insert(successionCandidates)
      .values({
        roleId: input.roleId,
        personId: input.personId,
        readiness: input.readiness,
        confidence: String(input.confidence),
        evidence: input.evidence,
        gapPlan: input.gapPlan,
      })
      .returning();
    return row;
  },

  /** Builds the full set of inputs computeCoverageRisk/buildRoleBoard need for a role. */
  async buildCoverageInputs(
    roleId: number,
    incumbentFlightRisk: number | null,
  ): Promise<RoleCoverageInputs | null> {
    const role = await successionRepository.getRoleById(roleId);
    if (!role) return null;
    const candidates = await successionRepository.listCandidates(roleId);
    return {
      roleId: role.id,
      title: role.title,
      teamId: role.teamId,
      criticality: role.criticality as RoleCoverageInputs["criticality"],
      incumbentId: role.incumbentId,
      incumbentFlightRisk,
      candidates,
    };
  },
};
