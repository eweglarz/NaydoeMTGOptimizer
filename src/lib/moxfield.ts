import { ScryfallCard } from "@/types/mtg";

export interface ParsedDeckList {
  commanderNames: string[];
  cardNames: string[];
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

// Parse plain-text deck lists (MTGO / Arena / standard format)
// Supports:
//   1 Sol Ring
//   Commander: Atraxa, Praetors' Voice
//   1x Lightning Bolt
export function parseTextDeckList(text: string): ParsedDeckList {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const commanderNames: string[] = [];
  const cardNames: string[] = [];

  let section: "commander" | "main" | "done" = "main";

  for (const line of lines) {
    if (section === "done") break;

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
    // Sideboard/maybe: stop processing
    if (/^(sideboard|side|maybe|companion)(\s*\(\d+\))?\s*$/i.test(line)) {
      section = "done";
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
    } else {
      for (let i = 0; i < qty; i++) cardNames.push(name);
    }
  }

  return { commanderNames, cardNames, source: "text" };
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
