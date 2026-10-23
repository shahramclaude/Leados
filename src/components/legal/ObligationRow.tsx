"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

export interface ObligationRowData {
  id: number;
  description: string;
  status: string;
  severity: string;
  dueDate: string | null;
  cadence: string | null;
  clauseId: number;
  clauseType: string;
  clauseStatus: string;
  documentId: number;
  contractTitle: string;
  ownerName: string | null;
}

export function ObligationRow({ data }: { data: ObligationRowData }) {
  const [row, setRow] = useState(data);
  const [busy, setBusy] = useState(false);

  async function act(action: "confirm" | "commit") {
    setBusy(true);
    try {
      const res = await fetch(`/api/legal/obligations/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedBy: "ui-owner@leados.example" }),
      });
      const payload = await res.json();
      if (res.ok && payload.obligation) {
        setRow((prev) => ({ ...prev, status: payload.obligation.status }));
      } else {
        alert(payload.error ?? "Action failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="px-4 py-3 text-slate-700">
        <p className="font-medium text-slate-900">{row.description}</p>
        <p className="mt-1 text-xs text-slate-500">{row.contractTitle}</p>
        <Link href={`/legal/vault/${row.documentId}`} className="mt-1 inline-block text-xs text-blue-700 underline">
          View source clause →
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-600">{row.ownerName ?? "Unassigned"}</td>
      <td className="px-4 py-3 text-slate-600">{row.dueDate ? row.dueDate.slice(0, 10) : row.cadence ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge status={row.severity} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
        {row.clauseStatus !== "confirmed" && (
          <p className="mt-1 text-xs text-rose-600">source clause not confirmed</p>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {row.status === "draft" && (
          <button
            disabled={busy}
            onClick={() => act("confirm")}
            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
        )}
        {row.status === "confirmed" && (
          <button
            disabled={busy}
            onClick={() => act("commit")}
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Commit to board
          </button>
        )}
      </td>
    </tr>
  );
}
