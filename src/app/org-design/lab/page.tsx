"use client";

import { useEffect, useMemo, useState } from "react";
import type { MovePayload } from "@/lib/org-design/twinEngine";
import type { DeliveryImpact, Explain, HumanImpactLedgerEntry, HumanImpactSummary, ModelCard, NetworkImpact } from "@/lib/org-design/types";

type Unit = { id: number; name: string; kind: string; parentId: number | null; headcount: number; cycleTimeDays: number };
type MoveType = MovePayload["type"];

const MOVE_TYPES: { value: MoveType; label: string; help: string }[] = [
  { value: "merge", label: "Merge", help: "Drag 2+ units into the basket. The first unit dropped becomes the surviving unit." },
  { value: "split", label: "Split", help: "Drag exactly 1 unit into the basket, then choose how many units to split it into." },
  { value: "reporting_line_change", label: "Reporting-line change", help: "Drag exactly 1 unit into the basket, then choose its new parent." },
  { value: "centralize", label: "Centralize", help: "Drag 2+ units into the basket, then choose which one becomes the hub." },
  { value: "decentralize", label: "Decentralize", help: "Drag exactly 1 unit into the basket — it is treated as the hub being decentralized." },
];

export default function OrgDesignLabPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [basket, setBasket] = useState<Unit[]>([]);
  const [moveType, setMoveType] = useState<MoveType>("merge");
  const [hubUnitId, setHubUnitId] = useState<number | null>(null);
  const [newParentId, setNewParentId] = useState<number | "none">("none");
  const [intoCount, setIntoCount] = useState(2);
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    deliveryImpact: DeliveryImpact;
    networkImpact: NetworkImpact;
    humanImpactSummary: HumanImpactSummary;
    ledgerEntries: HumanImpactLedgerEntry[];
    modelCard: ModelCard;
    run: { id: number; label: string };
  } | null>(null);

  useEffect(() => {
    fetch("/api/org-design/graph")
      .then((r) => r.json())
      .then((d) => setUnits(d.units ?? []));
  }, []);

  const basketIds = useMemo(() => new Set(basket.map((u) => u.id)), [basket]);

  function onDropUnit(e: React.DragEvent) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/unit-id"));
    const unit = units.find((u) => u.id === id);
    if (unit && !basketIds.has(id)) setBasket((b) => [...b, unit]);
  }

  function removeFromBasket(id: number) {
    setBasket((b) => b.filter((u) => u.id !== id));
  }

  function buildMove(): MovePayload | null {
    const ids = basket.map((u) => u.id);
    switch (moveType) {
      case "merge":
        return ids.length >= 2 ? { type: "merge", unitIds: ids } : null;
      case "split":
        return ids.length === 1 ? { type: "split", unitId: ids[0], intoCount } : null;
      case "reporting_line_change":
        return ids.length === 1 ? { type: "reporting_line_change", unitId: ids[0], newParentId: newParentId === "none" ? null : newParentId } : null;
      case "centralize":
        return ids.length >= 2 && hubUnitId != null ? { type: "centralize", unitIds: ids, hubUnitId } : null;
      case "decentralize":
        return ids.length === 1 ? { type: "decentralize", hubUnitId: ids[0] } : null;
    }
  }

  async function runSimulation() {
    setError(null);
    const move = buildMove();
    if (!move) {
      setError("The basket does not match the requirements for this move type yet — see the hint above.");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/org-design/moves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move, label: label || undefined, createdBy: "lab-ui" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Simulation failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const activeMoveMeta = MOVE_TYPES.find((m) => m.value === moveType)!;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">1. Drag units</h2>
          <p className="mt-1 text-xs text-slate-500">Units are draggable chips — drag into the basket on the right.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {units.map((u) => (
              <div
                key={u.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/unit-id", String(u.id))}
                className="cursor-grab rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 active:cursor-grabbing"
                title={`${u.kind} · ${u.headcount} people · ${u.cycleTimeDays}d cycle time`}
              >
                {u.name}
              </div>
            ))}
            {units.length === 0 && <p className="text-sm text-slate-400">No units yet — seed demo data from the Overview tab.</p>}
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropUnit}
          className="rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-5"
        >
          <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-indigo-700">2. Structural move basket</h2>
          <p className="mt-1 text-xs text-indigo-700">{activeMoveMeta.help}</p>
          <div className="mt-3 min-h-[3rem] space-y-2">
            {basket.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span>{u.name}</span>
                <button onClick={() => removeFromBasket(u.id)} className="text-xs font-semibold text-rose-600 hover:underline">
                  remove
                </button>
              </div>
            ))}
            {basket.length === 0 && <p className="text-sm text-indigo-400">Drop units here…</p>}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">3. Move parameters</h2>
          <label className="mt-3 block text-xs font-medium text-slate-600">Move type</label>
          <select
            value={moveType}
            onChange={(e) => {
              setMoveType(e.target.value as MoveType);
              setBasket([]);
              setResult(null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {MOVE_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {moveType === "split" && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600">Split into how many units?</label>
              <input type="number" min={2} max={5} value={intoCount} onChange={(e) => setIntoCount(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          )}

          {moveType === "reporting_line_change" && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600">New parent unit</label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value === "none" ? "none" : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">(no parent / top-level)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {moveType === "centralize" && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-600">Hub unit (must be in basket)</label>
              <select
                value={hubUnitId ?? ""}
                onChange={(e) => setHubUnitId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select hub…</option>
                {basket.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600">Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 2026 reorg option A" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <button onClick={runSimulation} disabled={running} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {running ? "Running on the twin…" : "Run simulation"}
          </button>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      </section>

      {result && <ImpactPanels result={result} />}
    </div>
  );
}

function ExplainBadge({ title, explain, unit = "" }: { title: string; explain: Explain<number>; unit?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="m-0 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">
        {explain.value > 0 ? "+" : ""}
        {explain.value}
        {unit}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Range [{explain.low}
        {unit}, {explain.high}
        {unit}] · confidence {Math.round(explain.confidence * 100)}%
      </p>
      <p className="mt-2 text-xs text-slate-600">{explain.rationale}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
        {explain.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

function ImpactPanels({
  result,
}: {
  result: {
    deliveryImpact: DeliveryImpact;
    networkImpact: NetworkImpact;
    humanImpactSummary: HumanImpactSummary;
    ledgerEntries: HumanImpactLedgerEntry[];
    modelCard: ModelCard;
    run: { id: number; label: string };
  };
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 text-sm font-semibold text-slate-950">Delivery impact</h3>
        <div className="mt-3 space-y-3">
          <ExplainBadge title="Capacity change" explain={result.deliveryImpact.capacityChangePct} unit="%" />
          <ExplainBadge title="Cycle time change" explain={result.deliveryImpact.cycleTimeChangeDays} unit=" days" />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 text-sm font-semibold text-slate-950">Network impact</h3>
        <div className="mt-3 space-y-3">
          <ExplainBadge title="Cohesion change" explain={result.networkImpact.cohesion} />
          <ExplainBadge title="Bus factor (affected units)" explain={result.networkImpact.busFactor} />
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="m-0 text-xs font-medium uppercase tracking-wide text-slate-500">Choke points</p>
            {result.networkImpact.chokePoints.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">None detected.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {result.networkImpact.chokePoints.map((c) => (
                  <li key={c.unitId}>
                    <strong>{c.unitName}</strong>: {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="m-0 text-sm font-semibold text-slate-950">Human impact (mandatory ledger)</h3>
        <p className="mt-1 text-xs text-slate-500">
          {result.humanImpactSummary.totalAffected} people affected · {result.humanImpactSummary.unsupportedSevereOrHigh} unsupported
          high/severe (must be 0)
        </p>
        <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px]">
          {Object.entries(result.humanImpactSummary.byDisruptionClass).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 py-2">
              <p className="m-0 font-semibold text-slate-900">{v}</p>
              <p className="m-0 capitalize text-slate-500">{k}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
          {result.ledgerEntries.map((e) => (
            <div key={e.personId} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <p className="m-0 font-medium text-slate-900">{e.personName}</p>
              <p className="m-0 text-slate-500">
                {e.roleChangeType.replace("_", " ")} · <span className="font-semibold">{e.disruptionClass}</span>
                {e.supportPlanName ? ` · support: ${e.supportPlanName}` : ""}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          This ledger is never collapsed into a single "efficiency" number — see <code>/org-design/ledger</code> for the self-first
          view each person gets.
        </p>
      </div>
    </section>
  );
}
