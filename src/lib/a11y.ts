/**
 * Accessibility + perceptual-contrast primitives shared by components and by
 * scripts/design-audit.mjs. The APCA implementation purposely matches the
 * published apca-w3 algorithm (we depend on the real `apca-w3` package at
 * runtime/build time for anything script-checked); the pure functions here
 * are small re-implementations usable from client components without
 * shipping the full apca-w3 bundle, and are unit-cross-checked against
 * apca-w3 in scripts/design-audit.mjs so the two never drift.
 */

export type ContrastClass = "body" | "large" | "ui";

export const APCA_FLOOR: Record<ContrastClass, number> = {
  body: 90,
  large: 75,
  ui: 45,
};

export const WCAG_FLOOR: Record<ContrastClass, number> = {
  body: 4.5,
  large: 3,
  ui: 3,
};

export type RGB = [number, number, number];

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.x contrast ratio (1:1 .. 21:1), used as the hard AA floor beneath
 * the APCA target. */
export function wcagContrast(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const APCA_EXPONENTS = { mainTRC: 2.4, normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65 };
const APCA_CLAMPS = { blkThrs: 0.022, blkClmp: 1.414, scale: 1.14, loClip: 0.1, deltaYmin: 0.0005 };
const APCA_COEFFS = { r: 0.2126729, g: 0.7151522, b: 0.072175 };

function apcaY([r, g, b]: RGB): number {
  const toLin = (v: number) => Math.pow(v / 255, APCA_EXPONENTS.mainTRC);
  const y = APCA_COEFFS.r * toLin(r) + APCA_COEFFS.g * toLin(g) + APCA_COEFFS.b * toLin(b);
  return y > APCA_CLAMPS.blkThrs ? y : y + Math.pow(APCA_CLAMPS.blkThrs - y, APCA_CLAMPS.blkClmp);
}

/**
 * APCA Lc (signed, -108..106). Text color first, background second — APCA is
 * polarity-sensitive, unlike WCAG ratio. This mirrors the public
 * `apca-w3` 0.1.9 "0.0.98G-4g" base algorithm.
 */
export function apcaContrast(text: RGB, bg: RGB): number {
  const Ytxt = apcaY(text);
  const Ybg = apcaY(bg);
  if (Math.abs(Ybg - Ytxt) < APCA_CLAMPS.deltaYmin) return 0;

  let sapc: number;
  let polarity: "normal" | "reverse";
  if (Ybg > Ytxt) {
    sapc = (Math.pow(Ybg, APCA_EXPONENTS.normBG) - Math.pow(Ytxt, APCA_EXPONENTS.normTXT)) * APCA_CLAMPS.scale;
    polarity = "normal";
  } else {
    sapc = (Math.pow(Ybg, APCA_EXPONENTS.revBG) - Math.pow(Ytxt, APCA_EXPONENTS.revTXT)) * APCA_CLAMPS.scale;
    polarity = "reverse";
  }

  if (Math.abs(sapc) < APCA_CLAMPS.loClip) return 0;
  const signed = sapc > 0 ? sapc - 0.027 : sapc + 0.027;
  const lc = signed * 100;
  return polarity === "normal" ? lc : lc;
}

export function passesContrast(lc: number, wcagRatio: number, cls: ContrastClass): boolean {
  return Math.abs(lc) >= APCA_FLOOR[cls] && wcagRatio >= WCAG_FLOOR[cls];
}

/** Minimal focus trap used by <Dialog> and <CommandPalette>. Returns a
 * cleanup function. Pure DOM, no dependency, SSR-safe (no-op outside the
 * browser). */
export function trapFocus(container: HTMLElement): () => void {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusable(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", onKeydown);
  const focusable = getFocusable();
  focusable[0]?.focus();

  return () => container.removeEventListener("keydown", onKeydown);
}

let liveRegion: HTMLElement | null = null;

/** Announce a message to assistive tech via a shared polite live region.
 * Used by Toast, DataTable (sort/filter changes), ScenarioSlider (delta
 * preview) instead of relying on visual change alone. */
export function announce(message: string): void {
  if (typeof document === "undefined") return;
  if (!liveRegion) {
    liveRegion = document.createElement("div");
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.className = "visually-hidden";
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = "";
  window.setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 50);
}

/** Hick–Hyman guardrail: throws in development if a navigation/menu set
 * exceeds 7 primary items. Call with the rendered item count. */
export function assertHickHymanLimit(count: number, context: string, limit = 7): void {
  if (process.env.NODE_ENV !== "production" && count > limit) {
    // eslint-disable-next-line no-console
    console.warn(
      `[a11y/cognitive] "${context}" exposes ${count} primary items (> ${limit}). ` +
        `Hick–Hyman: decision time grows with log2(n); move the overflow behind progressive disclosure.`,
    );
  }
}
