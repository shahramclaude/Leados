import { leaderRepository } from "@/lib/platform/repositories/leaderRepository";

export async function listLeaders() {
  return leaderRepository.list();
}
