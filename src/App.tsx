import { useState } from "react";
import { Shell } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { SignalBoardView } from "./components/SignalBoardView";
import { AttentionView } from "./components/AttentionView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState, saveState, resetState, clearState, type SignalState } from "./lib/store";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [state, setState] = useState<SignalState>(() => loadState());

  const update = (s: SignalState) => {
    setState(s);
    saveState(s);
  };

  return (
    <Shell route={route} navigate={navigate}>
      {route === "/today" && <TodayView state={state} navigate={navigate} />}
      {route === "/signals" && (
        <SignalBoardView
          state={state}
          onChange={update}
          onReset={() => update(resetState())}
          onClear={() => update(clearState())}
        />
      )}
      {route === "/attention" && <AttentionView state={state} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
