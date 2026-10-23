import { useMemo } from "react";
import type { OrgNode } from "@/data/orgHierarchy";
import { layoutIcicle } from "@/lib/spatial/icicleLayout";

const ROW_HEIGHT = 34;
const DIVISION_COLORS: Record<string, string> = {
  Platform: "#2563eb",
  Growth: "#16a34a",
  Operations: "#d97706",
  Research: "#7c3aed",
};

export function Icicle2D({
  root,
  selectedId,
  onSelect,
}: {
  root: OrgNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const rects = useMemo(() => layoutIcicle(root, 1000), [root]);
  const maxDepth = Math.max(...rects.map((r) => r.depth));
  const height = (maxDepth + 1) * ROW_HEIGHT;

  return (
    <svg viewBox={`0 0 1000 ${height}`} className="h-full w-full" role="img" aria-label="2D icicle chart of the org hierarchy — primary view for this scene">
      <rect x={0} y={0} width={1000} height={height} fill="#f8fafc" />
      {rects.map((r) => {
        const division = r.path[1] ?? r.name;
        const color = DIVISION_COLORS[division] ?? "#64748b";
        const isSelected = r.id === selectedId;
        return (
          <g key={r.id} transform={`translate(${r.x}, ${r.depth * ROW_HEIGHT})`}>
            <rect
              width={Math.max(0, r.width - 1)}
              height={ROW_HEIGHT - 2}
              fill={color}
              opacity={r.depth === 0 ? 1 : 0.35 + Math.min(0.5, r.depth * 0.15)}
              stroke={isSelected ? "#1d4ed8" : "#ffffff"}
              strokeWidth={isSelected ? 2 : 1}
              tabIndex={r.width > 6 ? 0 : -1}
              role="button"
              aria-label={`${r.path.join(" > ")}: ${r.headcount} people`}
              onClick={() => onSelect(r.id)}
              onFocus={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(r.id);
              }}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            />
            {r.width > 50 ? (
              <text x={6} y={ROW_HEIGHT / 2 + 2} fontSize={11} fill="#0f172a" className="pointer-events-none select-none">
                {r.name} ({r.headcount})
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
