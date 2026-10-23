// LEADOS — Part 56: demo identity directory.
// Stand-in for a real auth/identity system (not in scope for this part).
// Used to drive the role-based access checks in rights.ts and the
// "demo identity" switcher in the UI.
export type PersonRole = "subject" | "reviewer" | "auditor" | "admin" | "engineer";

export interface Person {
  personKey: string;
  name: string;
  role: PersonRole;
  note: string;
}

export const PEOPLE: Person[] = [
  { personKey: "subj-001", name: "Aria Noor", role: "subject", note: "Gig worker, 14 months tenure." },
  { personKey: "subj-002", name: "Ben Osei", role: "subject", note: "Gig worker, 3 months tenure." },
  { personKey: "cust-001", name: "Dana Kim", role: "subject", note: "Customer, support ticket filer." },
  { personKey: "rev-001", name: "Priya Shah", role: "reviewer", note: "Impact assessment reviewer." },
  { personKey: "aud-001", name: "Marcus Lee", role: "auditor", note: "Independent algorithmic auditor." },
  { personKey: "adm-001", name: "Jordan Patel", role: "admin", note: "Accountability program admin." },
  { personKey: "eng-001", name: "Sam Rivera", role: "engineer", note: "Builds the intelligence engines." },
];

export function findPerson(personKey: string | undefined | null): Person | undefined {
  if (!personKey) return undefined;
  return PEOPLE.find((p) => p.personKey === personKey);
}
