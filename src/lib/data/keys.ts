// Central query-key factory. Every query and every mutation's invalidation
// list is built from these functions so a key never drifts between the two
// (see invalidationMap.ts). Keys are plain arrays so react-query's prefix
// matching ("invalidate everything under ['notifications']") works for free.
export const queryKeys = {
  events: {
    all: ["events"] as const,
    list: (domain?: string) => ["events", "list", domain ?? "all"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (status?: string) => ["notifications", "list", status ?? "all"] as const,
  },
  roster: {
    all: ["roster"] as const,
    list: (team?: string, search?: string) => ["roster", "list", team ?? "all", search ?? ""] as const,
  },
  findings: {
    all: ["findings"] as const,
    list: (filters: Record<string, string | number | undefined>) =>
      ["findings", "list", JSON.stringify(filters)] as const,
  },
};
