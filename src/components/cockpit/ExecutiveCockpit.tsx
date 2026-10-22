import { useEffect, useMemo, useState } from "react";
import { ORG_DATASETS } from "../../lib/domainData";
import { QUESTION_ONTOLOGY, TOP_FIVE, questionById, type QuestionDef } from "../../lib/questionOntology";
import { compileAnswer } from "../../lib/answerCompilers";
import { FactLedger, type Fact } from "../../lib/citations";
import { diffSinceLastVisit, readLastVisit, writeLastVisit } from "../../lib/whatChanged";
import type { AnswerResult } from "../../lib/types";
import { isAnswerable } from "../../lib/types";
import { QuestionCard } from "./QuestionCard";
import { WhatChangedStripUI } from "./WhatChangedStripUI";
import { DecisionInbox } from "./DecisionInbox";
import { NarrativeThreadView } from "./NarrativeThreadView";
import { AskAnything } from "./AskAnything";
import { EvidenceDrawer } from "../shared/EvidenceDrawer";
import type { NarrativeThread } from "../../lib/briefingCompiler";

function threadFromAnswer(answer: AnswerResult, question: QuestionDef): NarrativeThread {
  if (!isAnswerable(answer)) {
    return {
      questionId: answer.questionId,
      question: question.text,
      verdict: `Not answerable yet — ${answer.reason}`,
      why: [],
      whatToDo: [{ label: answer.whatWouldUnlockIt, kind: "note" }],
      evidenceAppendix: [],
      confidenceClass: null,
    };
  }
  return {
    questionId: answer.questionId,
    question: question.text,
    verdict: answer.headline,
    why: answer.drivers.map((d) => ({ text: d.label, refs: d.refs, section: question.shortLabel })),
    whatToDo: answer.actions.map((a) => ({ label: a.label, kind: a.kind })),
    evidenceAppendix: answer.evidenceRefs.map((e) => ({ factId: e.factId, label: e.label, sourceView: e.sourceView })),
    confidenceClass: answer.confidenceClass,
  };
}

export function ExecutiveCockpit({ onNavigate }: { onNavigate: (sourceView: string) => void }) {
  const [orgId, setOrgId] = useState<keyof typeof ORG_DATASETS>("northwind");
  const ds = ORG_DATASETS[orgId];

  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(TOP_FIVE[0].id);
  const [askOpen, setAskOpen] = useState(false);
  const [openFactId, setOpenFactId] = useState<number | null>(null);
  const [approvals, setApprovals] = useState(ds.approvalsInbox);
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  useEffect(() => {
    setApprovals(ds.approvalsInbox);
    setSelectedQuestionId(TOP_FIVE[0].id);
  }, [orgId, ds.approvalsInbox]);

  useEffect(() => {
    setLastVisit(readLastVisit());
    writeLastVisit();
  }, []);

  // Single shared ledger per render pass so footnote ids are stable across
  // the cards, the open thread, and the evidence drawer.
  const ledger = useMemo(() => new FactLedger(), [orgId]);
  const answers = useMemo(() => {
    const map = new Map<string, AnswerResult>();
    for (const q of QUESTION_ONTOLOGY) map.set(q.id, compileAnswer(q.id, ds, ledger));
    return map;
  }, [ds, ledger]);

  const facts: Fact[] = ledger.all();
  const changedEntries = diffSinceLastVisit(ds, lastVisit);
  const selectedQuestion = questionById(selectedQuestionId)!;
  const selectedAnswer = answers.get(selectedQuestionId)!;
  const thread = threadFromAnswer(selectedAnswer, selectedQuestion);
  const openFact = openFactId !== null ? facts.find((f) => f.id === openFactId) ?? null : null;

  function handleAskSelect(q: QuestionDef) {
    setSelectedQuestionId(q.id);
    setAskOpen(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LEADOS · Executive Cockpit</p>
          <h1 className="text-2xl font-bold text-slate-900">Good morning. Here's what matters.</h1>
          <p className="mt-0.5 text-sm text-slate-500">{ds.label} · as of {ds.asOf}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value as keyof typeof ORG_DATASETS)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {Object.values(ORG_DATASETS).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setAskOpen(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            🔎 Ask anything <kbd className="ml-1 rounded bg-slate-100 px-1 text-[10px]">⌘K</kbd>
          </button>
        </div>
      </header>

      <WhatChangedStripUI entries={changedEntries} asOf={ds.asOf} />

      {/* The 5 leader questions, each one click from full answer (Phase 0/2) */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">The 5 questions every leader asks first</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TOP_FIVE.map((q) => (
            <QuestionCard key={q.id} question={q} answer={answers.get(q.id)!} active={q.id === selectedQuestionId} onClick={() => setSelectedQuestionId(q.id)} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Narrative thread reading experience: verdict -> why -> what to do -> evidence */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Narrative thread</p>
          <NarrativeThreadView
            thread={thread}
            facts={facts}
            onFootnoteClick={setOpenFactId}
            onApproveAction={() => onNavigate("inbox")}
          />
        </section>

        {/* Decision / approval inbox */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Decision & approval inbox</p>
          <DecisionInbox
            items={approvals}
            onDecide={(id) => setApprovals((prev) => prev.filter((a) => a.id !== id))}
          />
        </section>
      </div>

      {/* Full question grid — the other 15 of the 20-question ontology */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">All 20 canonical questions</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {QUESTION_ONTOLOGY.map((q) => {
            const a = answers.get(q.id)!;
            const answerable = isAnswerable(a);
            return (
              <button
                key={q.id}
                onClick={() => setSelectedQuestionId(q.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${q.id === selectedQuestionId ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <p className="font-medium text-slate-800">{q.text}</p>
                <p className={`mt-0.5 ${answerable ? "text-slate-500" : "text-amber-600"}`}>
                  {answerable ? "answerable" : "not answerable yet"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <AskAnything open={askOpen} onClose={() => setAskOpen(false)} onSelect={handleAskSelect} />
      <EvidenceDrawer fact={openFact} onClose={() => setOpenFactId(null)} onJumpToSource={onNavigate} />
    </div>
  );
}
