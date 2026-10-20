import { organizationRepository } from "@/lib/platform/repositories/organizationRepository";

export async function listOrganizations() {
  return organizationRepository.list();
}
