import { z } from "zod";

// Every domain entity carries this envelope: orgId (tenancy), version
// (optimistic concurrency), validFrom/validTo (bitemporal valid-time), plus
// soft-delete via deletedAt. This file is pure — no DB, no I/O — so it can be
// unit-tested and reused by both the server and (eventually) client code.

export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
});
export type BaseEntity = z.infer<typeof BaseEntitySchema>;
