import { useEffect, useRef, useState } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { startAutonomousMonitor } from "../lib/autonomous";
import type { Finding } from "../lib/types";
import { Card, SectionTitle, Button, Pill } from "../components/ui";

export function AutonomousView() {
  const { state, setState } = useAppState();
  const [running, setRunning] = useState(false);
  const findingsRef = useRef<Finding[]>(runInference(state.signalBoard));
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    findingsRef.current = runInference(state.signalBoard);
  }, [state.signalBoard]);

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  const start = () => {
    if (running) return;
    setRunning(true);
    stopRef.current = startAutonomousMonitor(
      () => state,
      () => findingsRef.current,
      ({ findings, log }) => {
        findingsRef.current = findings;
        setState((prev) => ({ ...prev, autonomousTick: log.tick, autonomousLog: [log, ...prev.autonomousLog].slice(0, 25) }));
      },
      5000,
    );
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Autonomous Monitor"
        subtitle="js/autonomous.js — disclosed simulation: a browser timer re-runs inference every 5s while this tab is open and this page is mounted; it is not a background/server process."
      />
      <Card>
        <div className="flex items-center gap-3">
          <Button onClick={start} disabled={running}>
            Start monitor
          </Button>
          <Button variant="ghost" onClick={stop} disabled={!running}>
            Stop monitor
          </Button>
          <Pill tone={running ? "indigo" : "slate"}>{running ? "Running" : "Stopped"}</Pill>
          <span className="text-xs text-slate-400">Tick {state.autonomousTick}</span>
        </div>
      </Card>
      <Card>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Tick log (most recent first)</div>
        {state.autonomousLog.length === 0 ? (
          <p className="text-sm text-slate-500">No ticks yet. Start the monitor above.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {state.autonomousLog.map((log) => (
              <li key={log.tick} className="rounded-lg border border-slate-100 p-2">
                <span className="font-medium text-slate-700">Tick {log.tick}</span>{" "}
                <span className="text-slate-500">— {log.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
