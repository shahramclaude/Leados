import { getPriorityQueue, getUpcoming } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [priorityQueue, upcoming] = await Promise.all([getPriorityQueue(), getUpcoming()]);
  return cachedJson({ priorityQueue, upcoming });
}
