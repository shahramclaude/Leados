import { useEffect, useMemo, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { DecisionsView } from "./components/DecisionsView";
import { EnergyView } from "./components/EnergyView";
import { MemoryGenomeView } from "./components/MemoryGenomeView";
import { AccessibilityView } from "./components/AccessibilityView";
import { LogView } from "./components/LogView";
import { AboutView } from "./components/AboutView";
import { appendEvent, loadEvents, wipeEvents } from "./lib/storage";
import { getProfileForDate } from "./lib/circadian";
import { DECISION_WEIGHTS, clampScore } from "./lib/fatigue";
import { workerStatus } from "./lib/workers";
import type { AppEvent, Decision, DecisionType, MonteCarloResult } from "./lib/types";

const SESSION_STARTED_AT = new Date().toISOString();

export default function App() {
  const [route, setRoute] = useState<Route>("today");
  const [events, setEvents] = useState<AppEvent[]>(() => loadEvents());
  const [sessionFatigue, setSessionFatigue] = useState(0);
  const [wStatus, setWStatus] = useState(workerStatus());
  const [dyslexiaFriendly, setDyslexiaFriendly] = useState(false);
  const [cognitiveReduction, setCognitiveReduction] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setWStatus(workerStatus()), 1500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.dyslexiaFriendly = String(dyslexiaFriendly);
  }, [dyslexiaFriendly]);
  useEffect(() => {
    document.documentElement.dataset.cognitiveReduction = String(cognitiveReduction);
  }, [cognitiveReduction]);

  const plans = useMemo(
    () => events.filter((e) => e.type === "decision.logged" && (e.payload as { style?: string }).style === "plan").length,
    [events]
  );
  const directs = useMemo(
    () => events.filter((e) => e.type === "decision.logged" && (e.payload as { style?: string }).style === "direct").length,
    [events]
  );

  function record(type: Parameters<typeof appendEvent>[0], payload: Record<string, unknown>) {
    const evt = appendEvent(type, payload);
    setEvents((prev) => [...prev, evt]);
  }

  function handleLogStyle(style: "plan" | "direct") {
    record("decision.logged", { style, note: `quick-tagged ${style}` });
  }

  function handleRecordDecisionType(type: DecisionType) {
    const weight = DECISION_WEIGHTS[type];
    setSessionFatigue((f) => clampScore(f + weight));
    record("decision.logged", { decisionType: type, weight });
  }

  function handleLogEnergy(level: number, note: string) {
    const phase = getProfileForDate().phase;
    record("bio.energy.logged", { level, phase, note: note || undefined });
  }

  function handleRunSimulation(decision: Decision, result: MonteCarloResult) {
    record("simulation.run", {
      decisionId: decision.id,
      title: decision.title,
      decisionType: decision.type,
      iterations: result.iterations,
      seed: result.seed,
      results: { mean: result.mean, p10: result.p10, p90: result.p90 },
      computedVia: result.computedVia,
    });
  }

  function handleWipe() {
    wipeEvents();
    setEvents([]);
    setSessionFatigue(0);
  }

  return (
    <Shell route={route} onNavigate={setRoute} eventCount={events.length} workerStatus={wStatus}>
      {route === "today" && <TodayView events={events} onLogStyle={handleLogStyle} />}
      {route === "decisions" && <DecisionsView onRun={handleRunSimulation} />}
      {route === "energy" && (
        <EnergyView sessionFatigue={sessionFatigue} onRecordDecision={handleRecordDecisionType} onLogEnergy={handleLogEnergy} />
      )}
      {route === "memory" && (
        <MemoryGenomeView events={events} sessionStartedAt={SESSION_STARTED_AT} plans={plans} directs={directs} />
      )}
      {route === "accessibility" && (
        <AccessibilityView
          dyslexiaFriendly={dyslexiaFriendly}
          setDyslexiaFriendly={setDyslexiaFriendly}
          cognitiveReduction={cognitiveReduction}
          setCognitiveReduction={setCognitiveReduction}
        />
      )}
      {route === "log" && <LogView events={events} onWipe={handleWipe} />}
      {route === "about" && <AboutView />}
    </Shell>
  );
}
