/**
 * app/core/domain/workReassignmentRules.js — ADR-0196's negative spine contract.
 *
 * The consent/capacity gate deliberately has NO work-producing automation. A
 * proposal, answer or withdrawal is a dated human statement, not a command to
 * reassign a delegation, create a replacement ask, close the RULE-NPW-01
 * rotation, or mutate a reporting line. Completion is enforced at the explicit
 * `completeDelegation` write door after `workReassignmentCompletionCheck`.
 *
 * Keeping that refusal as a registered post-commit rule makes the absence of a
 * propagation an auditable architecture contract instead of an accidental gap:
 * the shared spine visits these events, this module writes and emits nothing.
 */

import { WORK_REASSIGNMENT_EVENTS } from './workReassignmentRegistry.js';

export const WORK_REASSIGNMENT_TRIGGER_EVENTS = new Set(Object.values(WORK_REASSIGNMENT_EVENTS));

export function workReassignmentRule(_draft, ctx = {}) {
  if (!WORK_REASSIGNMENT_TRIGGER_EVENTS.has(ctx.event?.type || '')) return [];
  // Deliberately empty. In particular, do not touch `delegations`: a receiving
  // acceptance reserves capacity only; it never reassigns or closes the ask.
  return [];
}

workReassignmentRule.id = 'workReassignmentRule';
workReassignmentRule.triggers = WORK_REASSIGNMENT_TRIGGER_EVENTS;

export default workReassignmentRule;
