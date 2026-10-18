import type { ReactNode } from "react";
import {
  IconNow,
  IconSignals,
  IconThermo,
  IconCas,
  IconRisk,
  IconLog,
  IconAbout,
} from "./icons";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: (props: { className?: string }) => ReactNode;
}

export const navItems: NavItem[] = [
  { id: "now", href: "/leados/now", label: "Now", description: "Attention surface", icon: (p) => <IconNow {...p} /> },
  { id: "signals", href: "/leados/signals", label: "Signal Board", description: "50-rule catalog", icon: (p) => <IconSignals {...p} /> },
  { id: "thermo", href: "/leados/thermodynamics", label: "Thermodynamics", description: "Entropy & SNR", icon: (p) => <IconThermo {...p} /> },
  { id: "cas", href: "/leados/cas", label: "CAS Engine", description: "Loops & attractors", icon: (p) => <IconCas {...p} /> },
  { id: "risk", href: "/leados/risk", label: "Risk Register", description: "8-category view", icon: (p) => <IconRisk {...p} /> },
  { id: "log", href: "/leados/log", label: "Audit Log", description: "Full activity trail", icon: (p) => <IconLog {...p} /> },
  { id: "about", href: "/leados/about", label: "About", description: "Provenance ledger", icon: (p) => <IconAbout {...p} /> },
];
