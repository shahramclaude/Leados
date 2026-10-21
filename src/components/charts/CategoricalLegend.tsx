import { CATEGORICAL_ORDER, DOMAIN_META } from "@/design/tokens";
import { cn } from "@/lib/cn";

export interface CategoricalLegendProps {
  activeIds?: string[];
  className?: string;
}

/**
 * CategoricalLegend — renders the 6-domain categorical palette in its fixed,
 * CVD-verified order. Each swatch pairs color with a text label (never
 * color alone) and a distinct shape (square icon outline) so the legend
 * still works for a tritanopic/achromatopsic reader relying on the label.
 */
export function CategoricalLegend({ activeIds, className }: CategoricalLegendProps) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {CATEGORICAL_ORDER.map((id) => {
        const meta = DOMAIN_META[id];
        const dimmed = activeIds && !activeIds.includes(id);
        return (
          <li key={id} className={cn("flex items-center gap-2 text-[var(--text-sm)]", dimmed && "opacity-40")}>
            <span
              aria-hidden
              className="size-2.5 rounded-[2px]"
              style={{ backgroundColor: `var(${meta.cssVar})` }}
            />
            <span className="text-[var(--text-secondary)]">{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
