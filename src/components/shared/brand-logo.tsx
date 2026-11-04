import { BRAND } from "@/lib/brand";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx="20"
        cy="20"
        r="13"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity=".45"
      />
      <path
        d="M13 11v18m14-18v18M13 20h14M20 2v3m0 30v3M2 20h3m30 0h3M7 7l2 2m22 22 2 2M7 33l2-2M31 9l2-2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="4" fill="currentColor" />
    </svg>
  );
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark className="h-9 w-9 shrink-0" />
      <span>{BRAND.name}</span>
    </span>
  );
}
