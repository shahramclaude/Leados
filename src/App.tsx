import { AppProvider } from "./lib/AppContext";
import { useHashRoute } from "./lib/useHashRoute";
import { Shell } from "./components/Shell";
import { TodayView } from "./views/TodayView";
import { SignalBoardView } from "./views/SignalBoardView";
import { InferenceView } from "./views/InferenceView";
import { AutonomousView } from "./views/AutonomousView";
import { LeadershipScienceView } from "./views/LeadershipScienceView";
import { ProtocolView } from "./views/ProtocolView";
import { DecisionTreesView } from "./views/DecisionTreesView";
import { MemoryView } from "./views/MemoryView";
import { SelfImproveView } from "./views/SelfImproveView";
import { DocsView } from "./views/DocsView";
import { OnboardingView } from "./views/OnboardingView";
import { AboutView } from "./views/AboutView";

function Router({ route }: { route: string }) {
  switch (route) {
    case "/today":
      return <TodayView />;
    case "/signals":
      return <SignalBoardView />;
    case "/inference":
      return <InferenceView />;
    case "/autonomous":
      return <AutonomousView />;
    case "/leadership-science":
      return <LeadershipScienceView />;
    case "/protocol":
      return <ProtocolView />;
    case "/decision-trees":
      return <DecisionTreesView />;
    case "/memory":
      return <MemoryView />;
    case "/self-improve":
      return <SelfImproveView />;
    case "/docs":
      return <DocsView />;
    case "/onboarding":
      return <OnboardingView />;
    case "/about":
      return <AboutView />;
    default:
      return <TodayView />;
  }
}

export default function App() {
  const [route, navigate] = useHashRoute("/today");

  return (
    <AppProvider>
      <Shell route={route} navigate={navigate}>
        <Router route={route} />
      </Shell>
    </AppProvider>
  );
}
