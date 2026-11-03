/**
 * app/core/domain/authorityCalibrationRegistry.js — ids, events and limits
 * for the Authority Calibration Ledger (Schema v85, ADR-0079).
 */

export const ACL_RULE_IDS = Object.freeze({
  FLOOR_BREACH: 'RULE-ACL-01',
  ADVISORY: 'RULE-ACL-02',
});

export const ACL_SIGNAL_IDS = Object.freeze({
  FLOOR_BREACH: 'ACL-01',
  MATURING: 'ACL-02',
  UNSKILLED: 'ACL-03',
  NO_TERMINALS: 'ACL-04',
});

export const ACL_EVENTS = Object.freeze({
  SCAN: 'calibration.scan',
  TRIGGER: 'calibration.trigger',
  PROPAGATE: 'calibration.propagate',
});

/**
 * Every setting is clamped into a printed range on read, and no range
 * contains the value that would silently disable its own test.
 */
export const ACL_LIMITS = Object.freeze({
  floorN: Object.freeze([1, 50]),
  floorNDefault: 5,
  reliabilityFloorPct: Object.freeze([1, 100]),
  reliabilityFloorPctDefault: 60,
});
