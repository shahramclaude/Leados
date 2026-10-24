/**
 * app/core/idle.js — inactivity guard for an unlocked, encrypted workspace.
 *
 * The monitor watches for user activity and, driven by the caller's tick(),
 * moves through idle → warned → locked. It is intentionally free of the
 * store and of the DOM: the caller decides what a warning and a lock mean
 * (a modal, then store.lock()). All time comes from an injected `now` so
 * every transition is reproducible in tests.
 *
 * Activity (keyboard, pointer, touch, scroll, wheel) resets the idle clock
 * and cancels a pending lock. When the tab becomes visible again after being
 * hidden, the clock is checked immediately instead of being silently reset:
 * an absence longer than the threshold warns, so a workspace left in a
 * background tab does not stay unlocked indefinitely.
 *
 * Only meaningful for an encrypted workspace — an unencrypted workspace has
 * no ciphertext to protect, and store.lock() requires one.
 */

const ACTIVITY_EVENTS = ['keydown', 'mousedown', 'touchstart', 'scroll', 'wheel'];

export function createIdleMonitor({
  now = () => new Date(),
  thresholdMs = 30 * 60 * 1000,
  warnGraceMs = 60 * 1000,
  onWarn,
  onLock,
} = {}) {
  let lastActivity = now();
  let warnedAt = null;

  function elapsed() {
    return Math.max(0, now() - lastActivity);
  }

  /** A genuine interaction resets the clock and cancels a pending lock. */
  function recordActivity() {
    lastActivity = now();
    warnedAt = null;
  }

  /**
   * One idle tick. The caller invokes this on a timer (for example every
   * 20 seconds) and whenever the tab regains visibility.
   */
  function tick() {
    if (warnedAt) {
      if (now() - warnedAt >= warnGraceMs) {
        warnedAt = null;
        onLock?.();
      }
      // Still within the grace period: the warning is already on screen.
      return;
    }
    if (elapsed() >= thresholdMs) {
      warnedAt = now();
      onWarn?.();
    }
  }

  function start() {
    recordActivity();
    if (typeof document === 'undefined' || !document.addEventListener) return;
    const onActivity = recordActivity;
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { passive: true });
    }
    window.addEventListener('focus', onActivity);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Tab restored from the background: check how long it was away rather
      // than pretending the user was working the whole time.
      tick();
    }
  }

  function stop() {
    lastActivity = now();
    warnedAt = null;
    if (typeof document === 'undefined' || !document.removeEventListener) return;
    const onActivity = recordActivity;
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, onActivity);
    }
    window.removeEventListener('focus', onActivity);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    start,
    stop,
    recordActivity,
    tick,
    elapsed,
    warned: () => Boolean(warnedAt),
  };
}
