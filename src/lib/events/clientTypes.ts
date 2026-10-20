// LEADOS Part 01 — client-safe DTO types.
//
// These types intentionally do NOT import zod, drizzle, or anything from
// src/db — they must be importable from client components without pulling
// server-only dependencies into the browser bundle. API routes map
// `EventEnvelope` (server, src/lib/events/types.ts) onto these DTOs before
// sending JSON to the client.

export type EventDTO = {
  eventId: string;
  type: string;
  schemaVersion: number;
  orgId: string;
  actorKind: string;
  actorId: string;
  entityId: string;
  occurredAt: string;
  recordedAt: string;
  correlationId: string;
  causationId: string | null;
  source: string;
  confidence: number | null;
  payload: unknown;
};

export type EventPageDTO = {
  items: EventDTO[];
  nextCursor: string | null;
};

export type ProjectionRowDTO = {
  projectorName: string;
  entityId: string;
  orgId: string;
  state: unknown;
  updatedAt: string;
};

export type CockpitDTO = {
  orgId: string;
  generatedAt: string;
  people: {
    totalTracked: number;
    highFlightRisk: number;
  };
  finance: {
    monthlyBurnUsd: number | null;
    cashOnHandUsd: number | null;
    runwayMonths: number | null;
  };
  sales: {
    openDeals: number;
    pipelineValueUsd: number;
    atRiskCustomers: number;
  };
  strategy: {
    initiativesAtRisk: number;
  };
};

export type TodayFeedItemDTO = {
  eventId: string;
  type: string;
  occurredAt: string;
  entityId: string;
  summary: string;
};

export type DatasetLabelDTO = {
  label: "synthetic-seed" | "real" | "unknown";
  description: string;
};
