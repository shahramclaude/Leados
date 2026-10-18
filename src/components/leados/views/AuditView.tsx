"use client";

import { useEffect, useRef, useState } from "react";

interface AuditRow {
  id: number;
  action: string;
  detail: string | null;
  createdAt: string;
}

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/audit", { cache: "no-store" });
      if (res.ok) setRows(await res.json());
    }
    load();
    timer.current = setInterval(load, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-100">Audit Log</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-900/80 uppercase text-slate-500">
            <tr>
              <th className="px-3 py-1.5">Timestamp</th>
              <th className="px-3 py-1.5">Action</th>
              <th className="px-3 py-1.5">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="px-3 py-1 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-3 py-1 text-indigo-400">{r.action}</td>
                <td className="px-3 py-1 text-slate-400">{r.detail}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-600">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
