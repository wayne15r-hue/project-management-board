"use client";

function initials(name: string): string {
  return name
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function colorFor(name: string): string {
  const palette = [
    "#E8A87C",
    "#7CAFC4",
    "#9B8FBF",
    "#8BAE68",
    "#D4846A",
    "#C4A464",
    "#6B9EAE",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
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
    backgroundColor: src ? undefined : colorFor(name),
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
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {initials(name)}
    </div>
  );
}
