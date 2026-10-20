// App layer: orchestration only. No direct Drizzle/db imports — this
// module talks to Postgres exclusively through the repository layer, and
// never contains business rules (those live in src/lib/domain).
import { organizationRepository } from "@/lib/platform/repositories/organizationRepository";
import { eventRepository } from "@/lib/platform/repositories/eventRepository";
import { systemIdGenerator } from "@/lib/platform/id";

export interface CreateOrganizationInput {
  name: string;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Organization name is required");
  }

  const id = systemIdGenerator.newId();
  const organization = await organizationRepository.create({ id, name: trimmedName });

  await eventRepository.append({
    id: systemIdGenerator.newId(),
    eventType: "organization.created",
    eventVersion: 1,
    payload: { organizationId: organization.id, name: organization.name },
  });

  return organization;
}
