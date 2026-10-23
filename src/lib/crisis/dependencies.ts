// Degraded-dependency operation (Part 35 circuit-breaker concept).
//
// Each notification channel is gated by a dependency key (e.g. email relies
// on "email_provider", SMS relies on "sms_gateway"). When a dependency is
// "down" the circuit breaker opens for that channel and the notification
// tree must fall back to the next healthy channel/contact instead of
// silently failing.

export type DependencyStatus = "up" | "degraded" | "down";

export interface DependencyRecord {
  key: string;
  status: DependencyStatus;
}

export interface NotificationContactLike {
  id: string;
  name: string;
  channel: string;
  dependencyKey: string;
  escalationOrder: number;
}

export interface RouteResult {
  ok: boolean;
  contact?: NotificationContactLike;
  reason: string;
  skipped: { contact: NotificationContactLike; reason: string }[];
}

/**
 * Picks the first healthy contact in escalation order whose gating dependency
 * is not "down". A "degraded" dependency is treated as usable but logged, so
 * crisis comms can still go out in a worse-than-ideal mode rather than
 * blocking entirely on a partial outage.
 */
export function routeNotification(
  contacts: NotificationContactLike[],
  dependencies: DependencyRecord[],
): RouteResult {
  const depByKey = new Map(dependencies.map((d) => [d.key, d.status]));
  const ordered = [...contacts].sort((a, b) => a.escalationOrder - b.escalationOrder);

  const skipped: { contact: NotificationContactLike; reason: string }[] = [];

  for (const contact of ordered) {
    const status = depByKey.get(contact.dependencyKey) ?? "up";
    if (status === "down") {
      skipped.push({ contact, reason: `Dependency "${contact.dependencyKey}" is down — circuit breaker open, falling back.` });
      continue;
    }
    return {
      ok: true,
      contact,
      reason:
        status === "degraded"
          ? `Routed to ${contact.name} via ${contact.channel} (dependency degraded but usable).`
          : `Routed to ${contact.name} via ${contact.channel}.`,
      skipped,
    };
  }

  return {
    ok: false,
    reason: "All channels unavailable: every gating dependency is down.",
    skipped,
  };
}
