// Single-tenant bootstrap constant. Every table already carries org_id so
// the platform is multi-tenant-ready; this app ships with one seeded
// organization and every query scopes to it explicitly (never implicitly).
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
