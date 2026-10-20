import type { ReactNode } from "react";
import { Shell } from "@/components/leados/Shell";

export default function LeadosLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
