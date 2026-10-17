import { useMemo, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { IntelligenceView } from "./components/IntelligenceView";
import { PeopleView } from "./components/PeopleView";
import { EventLogView } from "./components/EventLogView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { appendEvent, buildProjection, loadEvents, resetToSeed, wipeEvents } from "./lib/store";
import type { OrgEvent } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [events, setEvents] = useState<OrgEvent[]>(() => loadEvents());
  const today = useMemo(() => new Date(), []);
  const P = useMemo(() => buildProjection(events), [events]);

  function handleQuickLog(type: string, data: Record<string, any>) {
    setEvents((prev) => appendEvent(prev, type, data));
  }

  function handleReset() {
    setEvents(resetToSeed());
  }

  function handleWipe() {
    setEvents(wipeEvents());
  }

  return (
    <Shell current={route} onNavigate={(r: Route) => navigate(r)}>
      {route === "/today" && <TodayView P={P} today={today} onQuickLog={handleQuickLog} />}
      {route === "/intelligence" && <IntelligenceView P={P} today={today} />}
      {route === "/people" && <PeopleView P={P} />}
      {route === "/log" && <EventLogView events={events} onReset={handleReset} onWipe={handleWipe} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
