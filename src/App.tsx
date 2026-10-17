import { useEffect, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { TodayView, SignalsView, InferenceView, AboutView } from "./components/Views";
import { loadState, saveState } from "./lib/store";
import type { AppState } from "./lib/types";

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "signals" || h === "inference" || h === "about" || h === "today") return h;
  return "today";
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute());
  const [state, setStateRaw] = useState<AppState>(() => loadState());

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(r: Route) {
    window.location.hash = `/${r}`;
    setRoute(r);
  }

  function setState(next: AppState) {
    setStateRaw(next);
    saveState(next);
  }

  return (
    <Shell route={route} onNavigate={navigate}>
      {route === "today" && <TodayView state={state} setState={setState} onNavigate={navigate} />}
      {route === "signals" && <SignalsView state={state} setState={setState} />}
      {route === "inference" && <InferenceView state={state} />}
      {route === "about" && <AboutView />}
    </Shell>
  );
}
