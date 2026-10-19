"use client";
import React from "react";

export interface HeatmapCell {
  color: string;
  title: string;
  label?: string;
}

// Generic heatmap grid — used by the Signal Board temporal heatmap (rules x
// days) and the Execution blocker heatmap (domain x severity).
export function Heatmap({
  rowLabels,
  colLabels,
  cell,
  cellWidth = 22,
  cellHeight = 18,
  rowLabelWidth = 160,
  onCellClick,
}: {
  rowLabels: string[];
  colLabels: string[];
  cell: (rowIdx: number, colIdx: number) => HeatmapCell;
  cellWidth?: number;
  cellHeight?: number;
  rowLabelWidth?: number;
  onCellClick?: (rowIdx: number, colIdx: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: rowLabelWidth + colLabels.length * (cellWidth + 2) }}>
        <div className="flex">
          <div style={{ width: rowLabelWidth }} />
          {colLabels.map((c, i) => (
            <div key={i} style={{ width: cellWidth }} className="shrink-0 text-center text-[9px] text-slate-500">
              {c}
            </div>
          ))}
        </div>
        {rowLabels.map((r, ri) => (
          <div key={ri} className="flex items-center">
            <div style={{ width: rowLabelWidth }} className="truncate pr-2 text-xs text-slate-400">
              {r}
            </div>
            {colLabels.map((_, ci) => {
              const c = cell(ri, ci);
              return (
                <button
                  key={ci}
                  title={c.title}
                  onClick={() => onCellClick?.(ri, ci)}
                  style={{ width: cellWidth, height: cellHeight, backgroundColor: c.color, margin: 1 }}
                  className="shrink-0 rounded-sm transition hover:ring-1 hover:ring-slate-300"
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
