import type { SVGProps } from "react";

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export function Activity({ size = 18 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function Search({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function ArrowUp({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function ArrowDown({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M7 7l10 10" />
      <path d="M17 7v10H7" />
    </svg>
  );
}

export function Minus({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function Bolt({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)} fill="currentColor" stroke="none">
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
    </svg>
  );
}

export function Newspaper({ size = 14 }: { size?: number }) {
  return (
    <svg {...base(size)}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
}
