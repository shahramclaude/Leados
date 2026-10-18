import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconNow(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  );
}

export function IconSignals(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 18V10M9 18V6M14 18v-9M19 18V3" />
    </svg>
  );
}

export function IconThermo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a8 8 0 0 1 8 8c0 4-3 7-8 10-5-3-8-6-8-10a8 8 0 0 1 8-8Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  );
}

export function IconCas(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M8 7l8 10M16 7L8 17" />
    </svg>
  );
}

export function IconRisk(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l8 3.5v5.3c0 4.6-3.2 8.3-8 9.2-4.8-.9-8-4.6-8-9.2V6.5L12 3Z" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconLog(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4h14v16H5z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function IconAbout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8.2c1.4.3 2.5 1.6 2.5 3.1 0 1-.5 1.9-1.2 2.5M17 14c2 .4 3.5 2.2 3.5 4.3" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function IconLeadosMark(props: IconProps) {
  return (
    <svg {...base} viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}
