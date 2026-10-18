"use client";
import { useEffect, useState, useCallback } from "react";

interface AuditRow {
  id: number;
  action: string;
  detail: string;
  createdAt: string;
}

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/audit");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="text-sm font-semibold text-slate-300">Audit log — append-only, last {rows.length}</div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-left uppercase text-slate-600 border-b border-slate-800">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-cyan-400">{r.action}</td>
                <td className="px-3 py-1.5 text-slate-400">{r.detail}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-slate-600">
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
