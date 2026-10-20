import type { ReactNode } from "react";
import { AppShell } from "@/components/leados/app/AppShell";

export default function LeadosLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
