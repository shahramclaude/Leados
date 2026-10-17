import { useState } from "react";
import { Shell } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { CompoundIntelView } from "./components/CompoundIntelView";
import { LifeStageView } from "./components/LifeStageView";
import { WargameView } from "./components/WargameView";
import { OrgDesignView } from "./components/OrgDesignView";
import { StakeholdersView } from "./components/StakeholdersView";
import { RealOptionsView } from "./components/RealOptionsView";
import { ExecutivePresenceView } from "./components/ExecutivePresenceView";
import { InnovationPortfolioView } from "./components/InnovationPortfolioView";
import { ChangeManagementView } from "./components/ChangeManagementView";
import { CompetitiveIntelView } from "./components/CompetitiveIntelView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState, resetState, saveState } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [state, setStateRaw] = useState<AppState>(() => loadState());

  const setState = (updater: (s: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  };

  const onReset = () => setStateRaw(resetState());

  return (
    <Shell route={route} navigate={navigate} onReset={onReset}>
      {route === "/today" && <TodayView state={state} navigate={navigate} />}
      {route === "/compound" && <CompoundIntelView state={state} />}
      {route === "/lifestage" && <LifeStageView state={state} setState={setState} />}
      {route === "/wargame" && <WargameView state={state} setState={setState} />}
      {route === "/orgdesign" && <OrgDesignView state={state} setState={setState} />}
      {route === "/stakeholders" && <StakeholdersView state={state} setState={setState} />}
      {route === "/realoptions" && <RealOptionsView state={state} setState={setState} />}
      {route === "/execpresence" && <ExecutivePresenceView state={state} setState={setState} />}
      {route === "/innovation" && <InnovationPortfolioView state={state} />}
      {route === "/change" && <ChangeManagementView state={state} setState={setState} />}
      {route === "/competitive" && <CompetitiveIntelView state={state} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
