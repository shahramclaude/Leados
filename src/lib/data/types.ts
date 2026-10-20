// Shared wire types for the typed fetch layer. These mirror the DB row
// shapes but are declared independently of `@/db/schema` so client bundles
// never pull in `drizzle-orm`/`pg` transitively (see docs/FRONTEND.md,
// "server/client boundary"). Keep in sync with src/db/schema.ts by hand for
// now — Part 14 generates this file from the OpenAPI spec instead.

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  correlationId: string;
}

export interface ApiOk<T> {
  data: T;
}

export type NotificationStatus = "unread" | "read" | "archived";
export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  domain: string;
  severity: number;
  status: NotificationStatus;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventDTO {
  id: string;
  type: string;
  domain: string;
  severity: number;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export type RosterStatus = "active" | "leave" | "offboarded";
export interface RosterDTO {
  id: string;
  name: string;
  role: string;
  team: string;
  email: string;
  status: RosterStatus;
  flightRisk: number;
  createdAt: string;
}

export type FindingStatus = "open" | "resolved";
export interface FindingDTO {
  id: string;
  title: string;
  summary: string;
  domain: string;
  team: string;
  severity: number;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
}
