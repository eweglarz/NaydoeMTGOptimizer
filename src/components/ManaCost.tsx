"use client";

// Mana color definitions for each MTG symbol
const SYMBOL_MAP: Record<string, { bg: string; border: string; text: string; label: string }> = {
  W: { bg: "bg-amber-50",  border: "border-amber-200", text: "text-gray-700",  label: "W" },
  U: { bg: "bg-blue-600",  border: "border-blue-500",  text: "text-white",     label: "U" },
  B: { bg: "bg-gray-800",  border: "border-gray-600",  text: "text-gray-200",  label: "B" },
  R: { bg: "bg-red-600",   border: "border-red-500",   text: "text-white",     label: "R" },
  G: { bg: "bg-green-700", border: "border-green-600", text: "text-white",     label: "G" },
  C: { bg: "bg-gray-400",  border: "border-gray-300",  text: "text-gray-900",  label: "◇" },
  S: { bg: "bg-sky-200",   border: "border-sky-300",   text: "text-sky-900",   label: "S" },
  X: { bg: "bg-gray-600",  border: "border-gray-500",  text: "text-white",     label: "X" },
  Y: { bg: "bg-gray-600",  border: "border-gray-500",  text: "text-white",     label: "Y" },
  Z: { bg: "bg-gray-600",  border: "border-gray-500",  text: "text-white",     label: "Z" },
};

const GENERIC = { bg: "bg-gray-600", border: "border-gray-500", text: "text-white" };

function resolveSymbol(raw: string) {
  const up = raw.toUpperCase();
  if (SYMBOL_MAP[up]) return SYMBOL_MAP[up];
  // Numeric generic mana: {1}, {12}, {0}
  if (/^\d+$/.test(raw)) return { ...GENERIC, label: raw };
  // Hybrid like W/U or 2/W — show split label, use first component's color
  if (raw.includes("/")) {
    const first = raw.split("/")[0].toUpperCase();
    const base = SYMBOL_MAP[first] ?? GENERIC;
    return { ...base, label: raw.replace("/", "/") };
  }
  return { ...GENERIC, label: raw };
}

// Renders a Scryfall mana cost string like "{1}{B}{B}" as colored mana pip circles
export default function ManaCost({ cost }: { cost?: string }) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g);
  if (!symbols || symbols.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-[2px] flex-shrink-0">
      {symbols.map((sym, i) => {
        const inner = sym.slice(1, -1); // strip { }
        const { bg, border, text, label } = resolveSymbol(inner);
        return (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border text-[10px] font-bold leading-none ${bg} ${border} ${text}`}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}
