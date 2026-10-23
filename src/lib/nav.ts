export interface NavItem {
  href: string;
  label: string;
  part: string;
  group: "Business Intelligence" | "Platform Hardening & Governance";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/revenue", label: "Revenue Operations", part: "Part 92", group: "Business Intelligence" },
  { href: "/customers", label: "Customer Success", part: "Part 93", group: "Business Intelligence" },
  { href: "/supply-chain", label: "Supply Chain Ops", part: "Part 94", group: "Business Intelligence" },
  { href: "/collaboration", label: "Collaboration & Decisions", part: "Part 95", group: "Business Intelligence" },
  { href: "/briefings", label: "Omnichannel Briefings", part: "Part 96", group: "Business Intelligence" },
  { href: "/trust", label: "Trust & Explainability", part: "Part 97", group: "Business Intelligence" },
  { href: "/extensions", label: "Extensibility Platform", part: "Part 98", group: "Business Intelligence" },
  { href: "/adoption", label: "Adoption Flywheel", part: "Part 99", group: "Business Intelligence" },
  { href: "/finops", label: "FinOps & Cost Governance", part: "Part 103", group: "Platform Hardening & Governance" },
  { href: "/observability", label: "Observability & SLOs", part: "Part 102", group: "Platform Hardening & Governance" },
  { href: "/security", label: "Security Hardening", part: "Part 105", group: "Platform Hardening & Governance" },
  { href: "/privacy", label: "Privacy & Compliance", part: "Part 106", group: "Platform Hardening & Governance" },
  { href: "/governance", label: "Capstone Readiness Gate", part: "Part 107", group: "Platform Hardening & Governance" },
];
