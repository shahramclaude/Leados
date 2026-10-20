// Typed invalidation map: mutation name -> query-key prefixes it affects.
// Mutations call `invalidate(queryClient, "notification.updateStatus")`
// instead of hand-picking keys inline, so the mapping is auditable in one
// place (requirement C: "typed invalidation map (mutation -> affected
// queries)").
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type MutationName =
  | "notification.updateStatus"
  | "notification.readAll"
  | "finding.create"
  | "finding.updateStatus"
  | "finding.delete";

const INVALIDATION_MAP: Record<MutationName, readonly (readonly string[])[]> = {
  "notification.updateStatus": [queryKeys.notifications.all],
  "notification.readAll": [queryKeys.notifications.all],
  "finding.create": [queryKeys.findings.all],
  "finding.updateStatus": [queryKeys.findings.all],
  "finding.delete": [queryKeys.findings.all],
};

export async function invalidate(queryClient: QueryClient, mutation: MutationName): Promise<void> {
  const prefixes = INVALIDATION_MAP[mutation];
  await Promise.all(prefixes.map((key) => queryClient.invalidateQueries({ queryKey: key })));
}
