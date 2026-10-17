// sensory.ts — real (not simulated) haptics + Web Audio feedback.
// ORIGINAL to this build. Uses standard browser APIs directly:
//   - navigator.vibrate() — supported on some Android/Chrome contexts only;
//     no-op (and safely ignored) on iOS Safari and desktop browsers, which
//     do not implement the Vibration API. We feature-detect, we do not fake it.
//   - Web Audio API (AudioContext) — a short sine-wave tone, created fresh
//     per call since AudioContext instances can be closed/garbage-collected
//     by the browser after inactivity.

export const PATTERNS = {
  SUCCESS: [50, 50, 50],
  WARNING: [80, 40, 80, 40, 80],
  CRITICAL: [200],
} as const;

export function vibrate(pattern: readonly number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern as number[]);
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") ctx = new Ctor();
  return ctx;
}

/** Plays a short tone. Returns true if an oscillator was created. */
export function tone(frequency = 440, durationSec = 0.12, gain = 0.05): boolean {
  const audioCtx = getCtx();
  if (!audioCtx) return false;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    g.gain.value = gain;
    osc.connect(g).connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.start(now);
    osc.stop(now + durationSec);
    return true;
  } catch {
    return false;
  }
}
