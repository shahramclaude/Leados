/**
 * Small time utilities kept separate from `format.ts` (which is about
 * locale-aware *display*). This module is about *behavior* — in particular
 * the cognitive-accessibility requirement that no interaction may have a
 * hard time limit without an extension path (WCAG 2.2.1 Timing Adjustable).
 */
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function now(): Date {
  return new Date();
}

export type ExtendableTimer = {
  remainingMs: number;
  extend: (byMs?: number) => void;
  cancel: () => void;
};

/**
 * Any session/notice timeout in LEADOS must be created through this helper
 * rather than a bare `setTimeout`, so it is always extendable and always
 * warns before firing. Used by the (optional) idle-session notice; nothing
 * in the app currently uses a hard, non-extendable timeout.
 */
export function createExtendableTimer(
  initialMs: number,
  onExpire: () => void,
  onWarning?: (remainingMs: number) => void,
  warnBeforeMs = 30 * SECOND,
): ExtendableTimer {
  let remaining = initialMs;
  let expireHandle: ReturnType<typeof setTimeout> | undefined;
  let warnHandle: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (expireHandle) clearTimeout(expireHandle);
    if (warnHandle) clearTimeout(warnHandle);
    expireHandle = setTimeout(onExpire, remaining);
    if (onWarning && remaining > warnBeforeMs) {
      warnHandle = setTimeout(() => onWarning(warnBeforeMs), remaining - warnBeforeMs);
    }
  };
  schedule();

  return {
    get remainingMs() {
      return remaining;
    },
    extend(byMs = initialMs) {
      remaining = byMs;
      schedule();
    },
    cancel() {
      if (expireHandle) clearTimeout(expireHandle);
      if (warnHandle) clearTimeout(warnHandle);
    },
  };
}
