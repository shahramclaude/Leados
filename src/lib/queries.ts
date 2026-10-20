import { db } from "@/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Shared read queries used by BOTH the API route handlers and the server
// components that render the cockpit. Centralising them here means the SQL
// (and its index usage) only exists in one place instead of drifting between
// `/api/events` and whatever a server component does inline — eliminates a
// classic source of N+1 / inconsistent-pagination bugs.
// ---------------------------------------------------------------------------

export type EventRow = {
  id: number;
  occurred_at: string;
  type: string;
  severity: string;
  source: string;
  entity_id: string | null;
  value: string;
};

export type EventsPageParams = {
  limit: number;
  cursor?: { occurredAt: string; id: number } | null;
  type?: string | null;
  severity?: string | null;
};

export async function getEventsPage(params: EventsPageParams) {
  const conditions: ReturnType<typeof sql>[] = [];
  if (params.type) conditions.push(sql`type = ${params.type}`);
  if (params.severity) conditions.push(sql`severity = ${params.severity}`);
  if (params.cursor) {
    conditions.push(sql`(occurred_at, id) < (${params.cursor.occurredAt}::timestamptz, ${params.cursor.id})`);
  }
  const whereClause = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

  const result = await db.execute<EventRow>(sql`
    select id, occurred_at, type, severity, source, entity_id, value
    from events
    ${whereClause}
    order by occurred_at desc, id desc
    limit ${params.limit}
  `);

  const rows = result.rows;
  const last = rows[rows.length - 1];
  return { items: rows, nextCursor: last ? { occurredAt: last.occurred_at, id: last.id } : null };
}

export type NotificationRow = {
  id: number;
  created_at: string;
  title: string;
  body: string;
  severity: string;
  read: boolean;
};

export async function getNotificationsPage(params: {
  limit: number;
  cursor?: { createdAt: string; id: number } | null;
  since?: string | null;
}) {
  const conditions: ReturnType<typeof sql>[] = [];
  if (params.cursor) {
    conditions.push(sql`(created_at, id) < (${params.cursor.createdAt}::timestamptz, ${params.cursor.id})`);
  }
  if (params.since) conditions.push(sql`created_at > ${params.since}::timestamptz`);
  const whereClause = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

  const result = await db.execute<NotificationRow>(sql`
    select id, created_at, title, body, severity, read
    from notifications
    ${whereClause}
    order by created_at desc, id desc
    limit ${params.limit}
  `);
  const rows = result.rows;
  const last = rows[rows.length - 1];
  return { items: rows, nextCursor: last ? { createdAt: last.created_at, id: last.id } : null };
}

const NODE_CAP = 120;

export async function getNetworkGraph(limit = NODE_CAP) {
  const cappedLimit = Math.min(NODE_CAP, Math.max(10, limit));

  const [nodeRows, edgeRows] = await Promise.all([
    db.execute<{ id: string; name: string; kind: string; risk_score: string }>(sql`
      select id, name, kind, risk_score
      from entities
      order by risk_score desc
      limit ${cappedLimit}
    `),
    db.execute<{ id: number; source_id: string; target_id: string; kind: string; weight: string }>(sql`
      select e.id, e.source_id, e.target_id, e.kind, e.weight
      from edges e
      where e.source_id in (select id from entities order by risk_score desc limit ${cappedLimit})
        and e.target_id in (select id from entities order by risk_score desc limit ${cappedLimit})
      limit 1000
    `),
  ]);

  return {
    nodes: nodeRows.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, riskScore: Number(r.risk_score) })),
    edges: edgeRows.rows.map((r) => ({ source: r.source_id, target: r.target_id, kind: r.kind, weight: Number(r.weight) })),
  };
}
