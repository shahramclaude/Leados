/**
 * Browser-side CSS color -> sRGB resolver, used only by the styleguide's
 * live contrast readout. Uses a 1x1 canvas so it works for any CSS color
 * syntax the browser accepts (oklch(), var(), etc.) without re-implementing
 * a color parser. Client-only (no-op server-side).
 */
export function resolveCssColorToRgb(cssColor: string): [number, number, number] | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function readCssVar(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}
