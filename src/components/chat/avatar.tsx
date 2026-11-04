"use client";

function initials(name: string): string {
  return name
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

interface Props {
  name: string;
  src?: string | null;
  size?: number;
}

export function Avatar({ name, src, size = 32 }: Props) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, size * 0.38),
  };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground"
    >
      {initials(name)}
    </div>
  );
}
