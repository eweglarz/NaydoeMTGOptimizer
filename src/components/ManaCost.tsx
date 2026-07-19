"use client";

// Converts a Scryfall inner symbol (content between { }) to the mana-font class suffix.
// Examples: "W" → "w", "2/W" → "2w", "W/P" → "wp", "12" → "12"
function symbolToClass(raw: string): string {
  const up = raw.toUpperCase();
  // Hybrid: "W/U" → "wu", "2/W" → "2w", "W/P" → "wp"
  if (up.includes("/")) {
    return up.replace("/", "").toLowerCase();
  }
  return up.toLowerCase();
}

// Renders a Scryfall mana cost string like "{1}{B}{B}" as mana-font pip icons
export default function ManaCost({ cost }: { cost?: string }) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g);
  if (!symbols || symbols.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-[1px] flex-shrink-0">
      {symbols.map((sym, i) => {
        const inner = sym.slice(1, -1);
        const cls = symbolToClass(inner);
        return (
          <i
            key={i}
            className={`ms ms-cost ms-shadow ms-${cls}`}
            style={{ fontSize: "14px" }}
            aria-label={sym}
          />
        );
      })}
    </span>
  );
}
