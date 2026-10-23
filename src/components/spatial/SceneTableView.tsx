import { useMemo, useState } from "react";
import type { SemanticEquivalent } from "@/types/spatial";

export function SceneTableView({ equivalent, onSelect }: { equivalent: SemanticEquivalent; onSelect?: (id: string) => void }) {
  const [sortCol, setSortCol] = useState<number>(3);
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const copy = [...equivalent.table.rows];
    copy.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [equivalent.table.rows, sortCol, asc]);

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-xs">
        <caption className="sr-only">Full data table for {equivalent.sceneId}, equivalent to the spatial scene.</caption>
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr>
            {equivalent.table.columns.map((c, i) => (
              <th key={c} scope="col" className="px-3 py-2 font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    if (sortCol === i) setAsc(!asc);
                    else {
                      setSortCol(i);
                      setAsc(false);
                    }
                  }}
                  className="flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  {c}
                  {sortCol === i ? <span aria-hidden="true">{asc ? "▲" : "▼"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 focus-within:bg-blue-50"
              onClick={() => onSelect?.(String(row[0]))}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-slate-700">
                  {j === 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelect?.(String(row[0]))}
                      className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      {String(cell)}
                    </button>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
