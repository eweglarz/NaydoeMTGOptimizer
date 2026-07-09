import { ScryfallCard } from "@/types/mtg";

export interface ParsedDeckList {
  commanderNames: string[];
  cardNames: string[];
  sideboardNames?: string[];
  source: "moxfield" | "text";
}

export function extractMoxfieldId(input: string): string | null {
  const match = input.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

interface MoxfieldApiDeck {
  name: string;
  commanders: Record<string, MoxfieldApiCard>;
  mainboard: Record<string, MoxfieldApiCard>;
}

interface MoxfieldApiCard {
  quantity: number;
  card: {
    name: string;
    scryfall_id?: string;
  };
}

export async function fetchMoxfieldDeck(deckId: string): Promise<ParsedDeckList> {
  const res = await fetch(`https://api2.moxfield.com/v2/decks/all/${deckId}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTG-Optimizer/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Moxfield returned ${res.status}. Check that the deck is public.`);
  }

  const data: MoxfieldApiDeck = await res.json();

  const commanderNames = Object.values(data.commanders ?? {}).map(
    (c) => c.card.name
  );

  const cardNames: string[] = [];
  for (const entry of Object.values(data.mainboard ?? {})) {
    for (let i = 0; i < entry.quantity; i++) {
      cardNames.push(entry.card.name);
    }
  }

  return { commanderNames, cardNames, source: "moxfield" };
}

const SIDEBOARD_HEADER_RE = /^(sideboard|side|maybeboard|maybe|companion):?(\s*\(\d+\))?\s*$/i;

// Detect commanders (and optional sideboard) separated from the deck by blank lines.
// Handles 2-paragraph and 3-paragraph formats:
//   2 paragraphs: [main]\n\n[commander]  OR  [commander]\n\n[main]
//   3 paragraphs: [main]\n\n[SIDEBOARD: + cards]\n\n[commander]
//                 [commander]\n\n[SIDEBOARD: + cards]\n\n[main]  etc.
// Requires pure card lines (start with digit) in the main and commander groups.
// The sideboard paragraph may start with a section header line.
function tryDetectSeparatedCommanders(
  text: string
): { commanderNames: string[]; cardNames: string[]; sideboardNames: string[] } | null {
  // Normalize line endings so \r\n (Windows) doesn't break blank-line detection.
  // Without this, the blank-line regex fails: \r is not a space/tab so [ \t]* stops
  // at \r and the paragraphs never split, causing everything to be one paragraph.
  const t = text.replace(/\r/g, "");

  const paragraphs = t
    .split(/\n[ \t]*\n+/)
    .map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);

  if (paragraphs.length < 2 || paragraphs.length > 3) return null;

  function parseCardLine(line: string): { name: string; qty: number } | null {
    const m = line.match(/^(\d+)x?\s+(.+)$/);
    if (!m) return null;
    const rawName = m[2]
      .replace(/\s*\(.*?\)\s*\d*\s*$/g, "")
      .replace(/\s*\*commander\*\s*/i, "")
      .trim();
    return rawName ? { name: rawName, qty: parseInt(m[1], 10) } : null;
  }

  // Parse a group where every line must be a card line.
  function parseGroup(lines: string[]): { name: string; qty: number }[] | null {
    const cards: { name: string; qty: number }[] = [];
    for (const line of lines) {
      const card = parseCardLine(line);
      if (!card) return null;
      cards.push(card);
    }
    return cards;
  }

  // Parse a sideboard paragraph: first line may be a section header, rest are card lines.
  function parseSideboardParagraph(lines: string[]): { name: string; qty: number }[] | null {
    const offset = SIDEBOARD_HEADER_RE.test(lines[0] ?? "") ? 1 : 0;
    if (offset === 1 && lines.length === 1) return []; // header-only → empty sideboard
    return parseGroup(lines.slice(offset));
  }

  function isSideboardParagraph(lines: string[]): boolean {
    return SIDEBOARD_HEADER_RE.test(lines[0] ?? "");
  }

  // Commander group: exactly 1 or 2 cards, each with quantity 1.
  // Uses total card count (sum of quantities) so "2x SomeCard" is not mistaken
  // for a two-commander group.
  function isCommanderGroup(entries: { name: string; qty: number }[]): boolean {
    const total = entries.reduce((s, c) => s + c.qty, 0);
    return total >= 1 && total <= 2 && entries.every((c) => c.qty === 1);
  }

  // Total number of individual cards in a parsed group (sum of quantities).
  // Used instead of .length (entry count) so "4 Island" counts as 4 cards.
  function totalCards(entries: { name: string; qty: number }[]): number {
    return entries.reduce((s, c) => s + c.qty, 0);
  }

  const expandNames = (entries: { name: string; qty: number }[]) =>
    entries.flatMap((c) => Array(c.qty).fill(c.name));

  // ── 2-paragraph case ────────────────────────────────────────────────────────
  // Pattern: [98 cards]\n\n[1-2 commanders]  OR  [1-2 commanders]\n\n[99 cards]
  if (paragraphs.length === 2) {
    const first = parseGroup(paragraphs[0]);
    const second = parseGroup(paragraphs[1]);
    if (!first || !second) return null;

    if (isCommanderGroup(second) && totalCards(first) >= 10) {
      return { commanderNames: second.map((c) => c.name), cardNames: expandNames(first), sideboardNames: [] };
    }
    if (isCommanderGroup(first) && totalCards(second) >= 10) {
      return { commanderNames: first.map((c) => c.name), cardNames: expandNames(second), sideboardNames: [] };
    }
    return null;
  }

  // ── 3-paragraph case ────────────────────────────────────────────────────────
  // Find which paragraph (if any) is the sideboard section (starts with a header).
  const sbIdx = paragraphs.findIndex((p) => isSideboardParagraph(p));

  if (sbIdx >= 0) {
    // One paragraph is clearly the sideboard — identify main and commander from the other two.
    const sbCards = parseSideboardParagraph(paragraphs[sbIdx]);
    if (sbCards === null) return null;

    const rest = paragraphs.filter((_, i) => i !== sbIdx);
    const a = parseGroup(rest[0]);
    const b = parseGroup(rest[1]);
    if (!a || !b) return null;

    if (isCommanderGroup(a) && totalCards(b) >= 10) {
      return { commanderNames: a.map((c) => c.name), cardNames: expandNames(b), sideboardNames: expandNames(sbCards) };
    }
    if (isCommanderGroup(b) && totalCards(a) >= 10) {
      return { commanderNames: b.map((c) => c.name), cardNames: expandNames(a), sideboardNames: expandNames(sbCards) };
    }
    return null;
  }

  // No explicit sideboard header: treat the middle paragraph as the sideboard
  // when the first or last paragraph is the commander group.
  const p0 = parseGroup(paragraphs[0]);
  const p1 = parseGroup(paragraphs[1]);
  const p2 = parseGroup(paragraphs[2]);
  if (!p0 || !p1 || !p2) return null;

  if (isCommanderGroup(p2) && totalCards(p0) >= 10) {
    return { commanderNames: p2.map((c) => c.name), cardNames: expandNames(p0), sideboardNames: expandNames(p1) };
  }
  if (isCommanderGroup(p0) && totalCards(p2) >= 10) {
    return { commanderNames: p0.map((c) => c.name), cardNames: expandNames(p2), sideboardNames: expandNames(p1) };
  }

  return null;
}

// Parse plain-text deck lists (MTGO / Arena / standard format)
// Supports:
//   1 Sol Ring
//   Commander: Atraxa, Praetors' Voice
//   1x Lightning Bolt
export function parseTextDeckList(text: string): ParsedDeckList {
  // Fast-path: blank-line separator between commander(s) and the rest of the deck
  const separated = tryDetectSeparatedCommanders(text);
  if (separated) {
    return {
      commanderNames: separated.commanderNames,
      cardNames: separated.cardNames,
      ...(separated.sideboardNames.length > 0 ? { sideboardNames: separated.sideboardNames } : {}),
      source: "text",
    };
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const commanderNames: string[] = [];
  const cardNames: string[] = [];
  const sideboardNames: string[] = [];

  let section: "commander" | "main" | "sideboard" = "main";

  for (const line of lines) {
    // Pure section header: "Commander", "Commander (1)", "Commanders"
    if (/^commanders?(\s*\(\d+\))?\s*$/i.test(line)) {
      section = "commander";
      continue;
    }
    // Section header with inline name: "Commander: Atraxa, Praetors' Voice"
    if (/^commanders?:\s+\S/i.test(line)) {
      section = "commander";
      const name = line.replace(/^commanders?:\s*/i, "").trim();
      if (name) commanderNames.push(name);
      continue;
    }
    // Main deck section: "Deck", "Deck (98)", "Mainboard", "Main"
    if (/^(deck|mainboard|main board|main)(\s*\(\d+\))?\s*$/i.test(line)) {
      section = "main";
      continue;
    }
    // Sideboard / maybe / companion → collect separately instead of stopping
    if (SIDEBOARD_HEADER_RE.test(line)) {
      section = "sideboard";
      continue;
    }

    // "1 Card Name" or "1x Card Name" or just "Card Name"
    const match = line.match(/^(\d+)x?\s+(.+)$/) ?? line.match(/^()(.+)$/);
    if (!match) continue;

    const qty = parseInt(match[1] || "1", 10);
    const rawName = match[2]
      .replace(/\s*\(.*?\)\s*\d*\s*$/g, "") // strip set codes like (MH2) 123
      .trim();

    // Handle MTGO *Commander* inline marker
    const isInlineCommander = /\*commander\*/i.test(rawName);
    const name = rawName.replace(/\s*\*commander\*\s*/i, "").trim();
    if (!name) continue;

    if (section === "commander" || isInlineCommander) {
      if (!commanderNames.includes(name)) commanderNames.push(name);
    } else if (section === "sideboard") {
      for (let i = 0; i < qty; i++) sideboardNames.push(name);
    } else {
      for (let i = 0; i < qty; i++) cardNames.push(name);
    }
  }

  return {
    commanderNames,
    cardNames,
    ...(sideboardNames.length > 0 ? { sideboardNames } : {}),
    source: "text",
  };
}

export function resolveCardNames(
  cardMap: Map<string, ScryfallCard>,
  names: string[]
): ScryfallCard[] {
  return names.flatMap((name) => {
    const card = cardMap.get(name.toLowerCase());
    return card ? [card] : [];
  });
}
