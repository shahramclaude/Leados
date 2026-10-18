import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LeadOS",
  description: "Leadership intelligence operating system",
};

export default function LeadOSLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
