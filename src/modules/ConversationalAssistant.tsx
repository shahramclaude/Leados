import { useState } from "react";
import { Card, SectionHeader, Badge } from "../components/ui";
import { safeId } from "../utils/id";
import type { ChatMessage } from "../types";

const scripted: Record<string, string> = {
  default:
    "I can draft something, but I won't send or commit anything without you reviewing it first. Try asking me to draft a note to the board.",
  board:
    "Here's a draft: \"The EMEA launch is tracking two weeks behind plan due to localization debt in billing. We recommend holding the Q3 date and communicating a revised Q4 commitment.\" This is a DRAFT — it has not gone to anyone.",
};

function reply(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("board") || lower.includes("draft")) return scripted.board;
  return scripted.default;
}

export function ConversationalAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "m0", role: "assistant", text: "Ask me for a draft, analysis, or summary. Anything actionable goes through Draft → Review → Commit before it leaves this screen.", gate: undefined },
  ]);
  const [input, setInput] = useState("");
  const [pendingGate, setPendingGate] = useState<"draft" | "review" | "committed" | null>(null);

  const send = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { id: safeId(), role: "user", text: input };
    const assistantText = reply(input);
    const isAction = assistantText.includes("DRAFT");
    const assistantMsg: ChatMessage = {
      id: safeId(),
      role: "assistant",
      text: assistantText,
      gate: isAction ? "draft" : undefined,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    if (isAction) setPendingGate("draft");
    setInput("");
  };

  const advanceGate = () => {
    setPendingGate((prev) => {
      if (prev === "draft") return "review";
      if (prev === "review") {
        setMessages((m) => [...m, { id: safeId(), role: "system", text: "Committed by you. Logged to the audit trail — this is the only way an action leaves draft state.", gate: "committed" }]);
        return "committed";
      }
      return prev;
    });
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Conversation"
        subtitle="Scripted demo assistant — no live model is called. The gate mechanism below is real: nothing commits without the three steps."
      />
      <Card className="flex h-[480px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[75%] rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white" : "max-w-[85%] rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800"}>
              {m.text}
              {m.gate === "draft" && <div className="mt-2"><Badge tone="amber">Draft — not sent</Badge></div>}
              {m.gate === "committed" && <div className="mt-2"><Badge tone="emerald">Committed</Badge></div>}
            </div>
          ))}
        </div>

        {pendingGate && pendingGate !== "committed" && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <span>
              Gate status: <strong className="capitalize">{pendingGate}</strong>
              {pendingGate === "draft" && " — needs your review before anything happens."}
              {pendingGate === "review" && " — ready to commit."}
            </span>
            <button onClick={advanceGate} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
              {pendingGate === "draft" ? "Mark reviewed" : "Commit"}
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="Message LEADOS assistant"
            placeholder="Ask for a draft, e.g. 'draft a note to the board about EMEA'"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button onClick={send} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Send
          </button>
        </div>
      </Card>
    </div>
  );
}
