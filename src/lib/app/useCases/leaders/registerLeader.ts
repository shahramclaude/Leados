// App layer: orchestrates the domain engine (pure) with the repository
// layer (I/O). This is the canonical example of the Part 00 architecture
// law — see ARCHITECTURE.md.
import { computeReadiness, type ReadinessInputs } from "@/lib/domain/leadership/readinessEngine";
import { leaderRepository } from "@/lib/platform/repositories/leaderRepository";
import { organizationRepository } from "@/lib/platform/repositories/organizationRepository";
import { eventRepository } from "@/lib/platform/repositories/eventRepository";
import { systemIdGenerator } from "@/lib/platform/id";

export interface RegisterLeaderInput {
  organizationId: string;
  name: string;
  role: string;
  email: string;
  readinessInputs: ReadinessInputs;
}

export async function registerLeader(input: RegisterLeaderInput) {
  const organization = await organizationRepository.findById(input.organizationId);
  if (!organization) {
    throw new Error(`Unknown organization: ${input.organizationId}`);
  }

  const name = input.name.trim();
  const role = input.role.trim();
  const email = input.email.trim().toLowerCase();

  if (!name || !role || !email) {
    throw new Error("Leader name, role and email are required");
  }

  const readiness = computeReadiness(input.readinessInputs);
  const id = systemIdGenerator.newId();

  const leader = await leaderRepository.create({
    id,
    organizationId: organization.id,
    name,
    role,
    email,
    readinessScore: readiness.score,
    readinessBand: readiness.band,
  });

  await eventRepository.append({
    id: systemIdGenerator.newId(),
    eventType: "leader.registered",
    eventVersion: 1,
    payload: {
      leaderId: leader.id,
      organizationId: organization.id,
      readinessScore: readiness.score,
      readinessBand: readiness.band,
      rationale: readiness.rationale,
    },
  });

  return { leader, readiness };
}
