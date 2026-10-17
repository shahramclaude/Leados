import { useState } from "react";
import { Shell } from "./components/Shell";
import { MaturityView } from "./components/MaturityView";
import { EventsView } from "./components/EventsView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState, addEvent, removeEvent, applyPreset, resetState, setOrgName } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/maturity");
  const [state, setState] = useState<AppState>(() => loadState());

  return (
    <Shell route={route} navigate={navigate}>
      {route === "/maturity" && (
        <MaturityView
          state={state}
          onApplyPreset={(id) => setState(applyPreset(state, id))}
          onReset={() => setState(resetState())}
          onRenameOrg={(name) => setState(setOrgName(state, name))}
        />
      )}
      {route === "/events" && (
        <EventsView
          state={state}
          onAddEvent={(type) => setState(addEvent(state, type))}
          onRemoveEvent={(id) => setState(removeEvent(state, id))}
        />
      )}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
