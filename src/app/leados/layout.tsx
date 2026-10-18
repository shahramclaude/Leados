import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "LeadOS" };

export default function LeadOSLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
