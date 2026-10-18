// Client-safe constants — do NOT import `db` or any server-only module here.
export const DOMAINS = ["people", "finance", "sales", "ops", "strategy", "gov"] as const;
export type Domain = (typeof DOMAINS)[number];
