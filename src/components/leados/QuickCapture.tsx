"use client";

import { useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";

export type EventType = "pulse" | "oneonone" | "feedback" | "generic";

interface Props {
  eventType: EventType;
  personId?: number;
  people?: { id: number; name: string }[] | IntelligenceData["flightRisk"];
  onClose: () => void;
  onSuccess: () => void;
}

const DOMAINS = ["people", "finance", "sales", "ops", "strategy", "gov"];

function peopleOptions(people: Props["people"]): { id: number; name: string }[] {
  if (!people) return [];
  return people.map((p) => ("personId" in p ? { id: p.personId, name: p.personName } : p));
}

export function QuickCapture({ eventType, personId, people, onClose, onSuccess }: Props) {
  const opts = peopleOptions(people);
  const [selectedPerson, setSelectedPerson] = useState<number | undefined>(personId ?? opts[0]?.id);
  const [mood, setMood] = useState(3);
  const [load, setLoad] = useState(3);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"held" | "skipped">("held");
  const [sentiment, setSentiment] = useState<"positive" | "neutral" | "negative">("neutral");
  const [genericType, setGenericType] = useState("note");
  const [genericDomain, setGenericDomain] = useState("people");
  const [genericData, setGenericData] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personName = opts.find((p) => p.id === selectedPerson)?.name;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      if (eventType === "pulse") {
        body = { type: "pulse", domain: "people", personId: selectedPerson, data: { mood, load, notes } };
      } else if (eventType === "oneonone") {
        body = { type: "oneonone", domain: "people", personId: selectedPerson, data: { notes, status } };
      } else if (eventType === "feedback") {
        body = { type: "feedback", domain: "people", personId: selectedPerson, data: { notes, sentiment } };
      } else {
        let parsed: unknown = {};
        try {
          parsed = genericData ? JSON.parse(genericData) : {};
        } catch {
          throw new Error("Data must be valid JSON");
        }
        body = { type: genericType, domain: genericDomain, personId: selectedPerson, data: parsed };
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Request failed");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const title =
    eventType === "pulse" ? "Log pulse" : eventType === "oneonone" ? "Log 1:1" : eventType === "feedback" ? "Give feedback" : "Log event";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>

        {personName && (
          <div className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-200">
            For <span className="font-semibold">{personName}</span>
          </div>
        )}

        {!personId && opts.length > 0 && (
          <label className="mb-3 block text-sm text-slate-400">
            Person
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
            >
              {opts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {eventType === "pulse" && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Mood</span>
                <span>1=Depleted · 3=Neutral · 5=Energized</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={mood}
                onChange={(e) => setMood(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-center font-mono text-slate-200">{mood}</div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Load</span>
                <span>1=Underloaded · 3=Normal · 5=Overloaded</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={load}
                onChange={(e) => setLoad(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-center font-mono text-slate-200">{load}</div>
            </div>
            <textarea
              placeholder="Note (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              rows={2}
            />
          </div>
        )}

        {eventType === "oneonone" && (
          <div className="space-y-4">
            <textarea
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              rows={3}
            />
            <div className="flex gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={status === "held"} onChange={() => setStatus("held")} /> Held
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={status === "skipped"} onChange={() => setStatus("skipped")} /> Skipped
              </label>
            </div>
          </div>
        )}

        {eventType === "feedback" && (
          <div className="space-y-4">
            <textarea
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              rows={3}
            />
            <div className="flex gap-3 text-sm">
              {(["positive", "neutral", "negative"] as const).map((s) => (
                <label
                  key={s}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
                    sentiment === s
                      ? s === "positive"
                        ? "border-green-600 text-green-400"
                        : s === "negative"
                          ? "border-red-600 text-red-400"
                          : "border-slate-500 text-slate-300"
                      : "border-slate-700 text-slate-500"
                  }`}
                >
                  <input type="radio" className="hidden" checked={sentiment === s} onChange={() => setSentiment(s)} />
                  {s}
                </label>
              ))}
            </div>
          </div>
        )}

        {eventType === "generic" && (
          <div className="space-y-3">
            <label className="block text-sm text-slate-400">
              Type
              <input
                value={genericType}
                onChange={(e) => setGenericType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
              />
            </label>
            <label className="block text-sm text-slate-400">
              Domain
              <select
                value={genericDomain}
                onChange={(e) => setGenericDomain(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-400">
              Data (JSON)
              <textarea
                value={genericData}
                onChange={(e) => setGenericData(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-200"
                rows={3}
              />
            </label>
          </div>
        )}

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-600">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
