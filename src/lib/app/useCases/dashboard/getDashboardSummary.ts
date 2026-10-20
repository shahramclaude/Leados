import { organizationRepository } from "@/lib/platform/repositories/organizationRepository";
import { leaderRepository } from "@/lib/platform/repositories/leaderRepository";
import { eventRepository } from "@/lib/platform/repositories/eventRepository";

export interface DashboardSummary {
  organizationCount: number;
  leaderCount: number;
  recentEvents: Awaited<ReturnType<typeof eventRepository.recent>>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [organizationCount, leaderCount, recentEvents] = await Promise.all([
    organizationRepository.count(),
    leaderRepository.count(),
    eventRepository.recent(10),
  ]);

  return { organizationCount, leaderCount, recentEvents };
}
