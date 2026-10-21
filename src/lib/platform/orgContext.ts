import { z } from "zod";

// Tenancy is not optional at any call site: every repository method takes an
// OrgContext, and every DB query built on top of it injects orgId. There is
// no code path in the repository layer that can run without one.

export const ActorSchema = z.object({
  kind: z.enum(["user", "agent", "system"]),
  id: z.string().min(1),
  displayName: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const OrgContextSchema = z.object({
  orgId: z.string().uuid(),
  actor: ActorSchema,
});
export type OrgContext = z.infer<typeof OrgContextSchema>;

export const SYSTEM_ACTOR: Actor = {
  kind: "system",
  id: "system",
  displayName: "LEADOS System",
};

/**
 * Extracts an OrgContext from inbound request headers for demo/admin
 * purposes. Real authn/authz (Part 0x, session-based) will replace this with
 * a verified identity; this is intentionally the single choke point that
 * will need to change, so it lives in one function.
 */
export function orgContextFromHeaders(headers: Headers): OrgContext | null {
  const orgId = headers.get("x-org-id");
  if (!orgId) return null;
  const actorKindRaw = headers.get("x-actor-kind") ?? "user";
  const actorKind = ActorSchema.shape.kind.safeParse(actorKindRaw).success
    ? (actorKindRaw as Actor["kind"])
    : "user";
  const actorId = headers.get("x-actor-id") ?? "anonymous";
  const actorDisplayName = headers.get("x-actor-name") ?? "Anonymous";

  const parsed = OrgContextSchema.safeParse({
    orgId,
    actor: { kind: actorKind, id: actorId, displayName: actorDisplayName },
  });
  return parsed.success ? parsed.data : null;
}
