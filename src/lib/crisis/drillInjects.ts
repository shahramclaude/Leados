// Drill inject effect definitions — pure description of what each inject
// type *should* cause the system to do. The actual drill runner (API route)
// applies these against real DB state and real code paths (not a mock), so a
// genuine bug in those paths will surface during a drill exactly as it would
// in a real crisis. See VERIFICATION LOG for the comms_error inject that
// failed on first run and was fixed.

import { evaluateAutoElevation, type AutoElevationSignal } from "./stateMachine";
import { evaluateClaim, type ClaimSource } from "./claims";
import { routeNotification, type DependencyRecord, type NotificationContactLike } from "./dependencies";

export type DrillInjectType = "signal_storm" | "dependency_outage" | "false_rumor" | "comms_error";

export interface SignalStormPayload {
  signals: AutoElevationSignal[];
}

export interface DependencyOutagePayload {
  dependencyKey: string;
  newStatus: "degraded" | "down";
}

export interface FalseRumorPayload {
  statement: string;
  sources: ClaimSource[];
}

export interface CommsErrorPayload {
  // channel attempted and the contacts available, used to prove the system
  // falls back correctly instead of crashing or silently dropping the
  // message when the primary channel's dependency is down.
  contacts: NotificationContactLike[];
  dependencies: DependencyRecord[];
}

export function applySignalStormInject(payload: SignalStormPayload) {
  return evaluateAutoElevation(payload.signals);
}

export function applyFalseRumorInject(payload: FalseRumorPayload) {
  return evaluateClaim(payload.sources);
}

export function applyCommsErrorInject(payload: CommsErrorPayload) {
  return routeNotification(payload.contacts, payload.dependencies);
}
