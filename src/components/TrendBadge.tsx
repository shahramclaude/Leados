import { STATUS_COLORS, TREND_GLYPHS } from "@/lib/a11y";
import { t, type Locale } from "@/lib/i18n";

type TrendCode = "up" | "down" | "flat";

// Colorblind-safe: every trend pairs a distinct glyph shape with a
// distinct hue from the Okabe-Ito palette AND a text label, so the signal
// never depends on color perception alone.
export function TrendBadge({ locale, trend, value }: { locale: Locale; trend: TrendCode; value: number }) {
  const color = trend === "up" ? STATUS_COLORS.good : trend === "down" ? STATUS_COLORS.bad : STATUS_COLORS.neutral;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      <span aria-hidden="true">{TREND_GLYPHS[trend]}</span>
      <span>
        {t(locale, `trend.${trend}`)} {value}%
      </span>
    </span>
  );
}
