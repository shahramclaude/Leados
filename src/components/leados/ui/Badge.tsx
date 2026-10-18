import type { BadgeVariant } from "./tokens";
import { variantColor, variantLabel } from "./tokens";

export interface BadgeProps {
  label?: string;
  variant: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
}

export default function Badge({ label, variant, size = "md", dot = true }: BadgeProps) {
  const color = variantColor(variant);
  const text = label ?? variantLabel(variant);
  const isSm = size === "sm";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        fontSize: isSm ? "var(--fs-xs)" : "var(--fs-sm)",
        padding: isSm ? "1px 8px" : "3px 10px",
        lineHeight: isSm ? "16px" : "18px",
      }}
    >
      {dot && (
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: isSm ? 5 : 6,
            height: isSm ? 5 : 6,
            backgroundColor: color,
            boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)`,
          }}
        />
      )}
      {text}
    </span>
  );
}
