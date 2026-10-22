"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "pre" | "live" | "post";

interface Participant {
  id: string;
  name: string;
  role: string;
  isOrganizer: boolean;
  consentStatus: "pending" | "opted_in" | "opted_out";
}

interface AgendaEvidence {
  id: string;
  title: string;
  source: string;
  snippet: string;
}

interface AgendaItem {
  id: string;
  title: string;
  evidence: AgendaEvidence[];
}

interface TranscriptSegment {
  id: string;
  speakerName: string;
  startMs: number;
  endMs: number;
  consentAtCapture: string;
  redacted: boolean;
  text: string;
}

interface Artifact {
  id: string;
  type: "summary" | "decision_draft" | "action_draft" | "open_question";
  status: "drafted" | "confirmed" | "edited" | "rejected";
  content: Record<string, unknown>;
  citations: string[];
}

const TABS: { key: Tab; label: string }[] = [
  { key: "pre", label: "Pre-meeting" },
  { key: "live", label: "Live" },
  { key: "post", label: "Post-meeting" },
];

export default function MeetingRoomClient({ meetingId, initialStatus }: { meetingId: string; initialStatus: string }) {
  const [tab, setTab] = useState<Tab>((initialStatus as Tab) ?? "pre");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [speaker, setSpeaker] = useState("");
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [redactedCount, setRedactedCount] = useState<number | null>(null);

  const loadConsent = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/consent`);
    const data = await res.json();
    setParticipants(data.participants ?? []);
  }, [meetingId]);

  const loadBrief = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/brief`);
    const data = await res.json();
    setAgenda(data.agenda ?? []);
  }, [meetingId]);

  const loadTranscript = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/transcript`);
    const data = await res.json();
    setSegments(data.segments ?? []);
  }, [meetingId]);

  const loadArtifacts = useCallback(async () => {
    const res = await fetch(`/api/meetings/${meetingId}/artifacts`);
    const data = await res.json();
    setArtifacts(data.artifacts ?? []);
  }, [meetingId]);

  useEffect(() => {
    loadConsent();
    loadBrief();
    loadTranscript();
    loadArtifacts();
  }, [loadConsent, loadBrief, loadTranscript, loadArtifacts]);

  async function updateConsent(participantId: string, status: Participant["consentStatus"]) {
    await fetch(`/api/meetings/${meetingId}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, status }),
    });
    loadConsent();
  }

  async function addSegment() {
    if (!speaker || !line.trim() || busy) return;
    setBusy(true);
    const p = participants.find((pp) => pp.name === speaker);
    const last = segments[segments.length - 1];
    const startMs = last ? last.endMs : 0;
    try {
      await fetch(`/api/meetings/${meetingId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerParticipantId: p?.id ?? null,
          speakerName: speaker,
          startMs,
          endMs: startMs + 5000,
          text: line.trim(),
        }),
      });
      setLine("");
      await loadTranscript();
    } finally {
      setBusy(false);
    }
  }

  async function generateArtifacts() {
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/artifacts`, { method: "POST" });
      const data = await res.json();
      setRedactedCount(data.redactedCount ?? null);
      await loadArtifacts();
    } finally {
      setBusy(false);
    }
  }

  async function confirmArtifact(id: string, acknowledgeGated = false) {
    const res = await fetch(`/api/meetings/${meetingId}/artifacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", by: "demo-user", acknowledgeGated }),
    });
    const data = await res.json();
    if (!res.ok && data.error === "gated_confirmation_required") {
      const sure = window.confirm(
        `${data.message}\n\nThis is a ${data.tier} action with real-world effect. Confirm you want to proceed?`,
      );
      if (sure) await confirmArtifact(id, true);
      return;
    }
    await loadArtifacts();
  }

  async function rejectArtifact(id: string) {
    await fetch(`/api/meetings/${meetingId}/artifacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", by: "demo-user" }),
    });
    await loadArtifacts();
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 py-2 text-sm font-medium " +
              (tab === t.key ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500 hover:text-slate-800")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pre" ? (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Agenda brief (grounded)</h2>
            {agenda.map((a) => (
              <div key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
                <p className="font-medium text-slate-900">{a.title}</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {a.evidence.map((e) => (
                    <li key={e.id} className="rounded-md bg-slate-50 p-2">
                      <span className="font-medium">{e.title}</span> ({e.source}) — {e.snippet}
                    </li>
                  ))}
                  {a.evidence.length === 0 ? <li className="italic text-slate-400">No linked evidence.</li> : null}
                </ul>
              </div>
            ))}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Consent (per person, opt-in)</h2>
            <div className="mt-2 space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">
                      {p.name} {p.isOrganizer ? <span className="text-xs text-slate-400">(organizer)</span> : null}
                    </span>
                    <ConsentBadge status={p.consentStatus} />
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => updateConsent(p.id, "opted_in")}
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100"
                    >
                      Opt in
                    </button>
                    <button
                      onClick={() => updateConsent(p.id, "opted_out")}
                      className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-100"
                    >
                      Opt out
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "live" ? (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Live transcript capture</h2>
          <p className="text-xs text-slate-500">
            Verbatim only shown for consenting speakers. Non-consenting speaker lines are stored but redacted from
            display and from any generated artifact.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow-sm">
            <select
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              <option value="">Speaker…</option>
              {participants.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="What did they say?"
              className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <button
              onClick={addSegment}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              Add line
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {segments.map((s) => (
              <div key={s.id} className="rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{s.speakerName}</span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide " +
                      (s.redacted ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700")
                    }
                  >
                    {s.redacted ? "redacted (no consent)" : "verbatim"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "post" ? (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Drafted artifacts</h2>
            <button
              onClick={generateArtifacts}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Generate from transcript
            </button>
          </div>
          {redactedCount !== null ? (
            <p className="mt-2 text-xs text-slate-500">
              {redactedCount} non-consenting segment(s) excluded from generation.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} onConfirm={() => confirmArtifact(a.id)} onReject={() => rejectArtifact(a.id)} />
            ))}
            {artifacts.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                No artifacts yet — generate them from the live transcript.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsentBadge({ status }: { status: Participant["consentStatus"] }) {
  const styles =
    status === "opted_in"
      ? "bg-emerald-100 text-emerald-700"
      : status === "opted_out"
        ? "bg-rose-100 text-rose-700"
        : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles}`}>{status}</span>;
}

function ArtifactCard({
  artifact,
  onConfirm,
  onReject,
}: {
  artifact: Artifact;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const typeLabel: Record<Artifact["type"], string> = {
    summary: "Summary (generated)",
    decision_draft: "Decision (drafted)",
    action_draft: "Action (drafted)",
    open_question: "Open question",
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {typeLabel[artifact.type]}
        </span>
        <span className="text-xs uppercase tracking-wide text-slate-400">{artifact.status}</span>
      </div>

      {artifact.type === "summary" ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {((artifact.content.bullets as string[]) ?? []).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : artifact.type === "open_question" ? (
        <p className="mt-2 text-sm text-slate-700">{String(artifact.content.text)}</p>
      ) : (
        <div className="mt-2">
          <p className="text-sm font-medium text-slate-900">{String(artifact.content.title)}</p>
          <p className="text-sm text-slate-600">{String(artifact.content.description)}</p>
          {artifact.type === "action_draft" ? (
            <p className="mt-1 text-xs text-slate-500">
              Suggested owner: {String(artifact.content.suggestedOwner ?? "unassigned")} · Policy tier:{" "}
              <strong>{String(artifact.content.policyTier)}</strong>
              {artifact.content.gated ? " · requires explicit confirmation (real-world effect)" : ""}
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">cited to transcript span(s): {artifact.citations.join(", ")}</p>

      {artifact.status === "drafted" || artifact.status === "edited" ? (
        <div className="mt-3 flex gap-2">
          <button onClick={onConfirm} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
            Confirm
          </button>
          <button onClick={onReject} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}
