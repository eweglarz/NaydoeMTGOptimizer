import { ScryfallCard } from "@/types/mtg";

const BASE = "https://api.scryfall.com";

async function scryfallFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Scryfall ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function searchCards(query: string, page = 1): Promise<{
  data: ScryfallCard[];
  has_more: boolean;
  total_cards: number;
}> {
  return scryfallFetch(`/cards/search?q=${encodeURIComponent(query)}&page=${page}&order=edhrec`);
}

export async function searchCommanders(query: string): Promise<ScryfallCard[]> {
  const q = `${query} is:commander legal:commander`;
  try {
    const res = await scryfallFetch<{ data: ScryfallCard[] }>(
      `/cards/search?q=${encodeURIComponent(q)}&order=edhrec`
    );
    return res.data.slice(0, 20);
  } catch {
    return [];
  }
}

export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  try {
    return await scryfallFetch<ScryfallCard>(
      `/cards/named?exact=${encodeURIComponent(name)}`
    );
  } catch {
    try {
      return await scryfallFetch<ScryfallCard>(
        `/cards/named?fuzzy=${encodeURIComponent(name)}`
      );
    } catch {
      return null;
    }
  }
}

// Normalize card names: "Name/Name2" → "Name // Name2" (split/DFC cards)
export function normalizeCardName(name: string): string {
  return name.replace(/\s*\/(?!\/)\s*/g, " // ").trim();
}

// Bulk-resolve up to 75 names per request using Scryfall's collection endpoint.
// Falls back to individual fuzzy lookup for any names the bulk endpoint can't match.
// Returns a map of lowercase name → card (keyed by both canonical and queried name).
export async function getCardsByNames(names: string[]): Promise<Map<string, ScryfallCard>> {
  const resolved = new Map<string, ScryfallCard>();
  if (names.length === 0) return resolved;

  // Normalize and deduplicate, tracking original→normalized for re-keying
  const normalize = (n: string) => normalizeCardName(n.toLowerCase());
  const origToNorm = new Map(names.map((n) => [n.toLowerCase(), normalize(n)]));
  const unique = [...new Set([...origToNorm.values()])];

  const fuzzyQueue: string[] = [];

  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    try {
      const res = await fetch(`${BASE}/cards/collection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)",
        },
        body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
      });
      if (!res.ok) { fuzzyQueue.push(...chunk); continue; }
      const data = await res.json() as {
        data: ScryfallCard[];
        not_found?: Array<{ name?: string }>;
      };
      for (const card of data.data) {
        resolved.set(card.name.toLowerCase(), card);
      }
      // Queue anything the bulk endpoint couldn't find for individual fuzzy lookup
      for (const nf of data.not_found ?? []) {
        if (nf.name) fuzzyQueue.push(nf.name.toLowerCase());
      }
    } catch {
      fuzzyQueue.push(...chunk);
    }
  }

  // Fuzzy fallback for not_found cards
  for (const name of fuzzyQueue) {
    const card = await getCardByName(name);
    if (card) resolved.set(card.name.toLowerCase(), card);
  }

  // Also store under original queried names so callers don't need to normalize
  for (const [orig, norm] of origToNorm) {
    if (!resolved.has(orig)) {
      const card = resolved.get(norm);
      if (card) resolved.set(orig, card);
    }
  }

  return resolved;
}

export async function autocompleteCards(query: string): Promise<string[]> {
  if (query.length < 2) return [];
  try {
    const res = await scryfallFetch<{ data: string[] }>(
      `/cards/autocomplete?q=${encodeURIComponent(query)}`
    );
    return res.data.slice(0, 8);
  } catch {
    return [];
  }
}

export function getCardImage(card: ScryfallCard, size: "small" | "normal" | "large" | "art_crop" = "normal"): string {
  if (card.image_uris) return card.image_uris[size];
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris[size];
  return "";
}

export function getCardPrice(card: ScryfallCard): number | null {
  const p = card.prices?.usd;
  return p ? parseFloat(p) : null;
}

export function getBudgetTier(price: number | null): "budget" | "mid" | "expensive" {
  if (price === null || price < 5) return "budget";
  if (price < 20) return "mid";
  return "expensive";
}

export type CardTag =
  | { label: string; kind: "keyword" }
  | { label: "Destruction"; kind: "removal" }
  | { label: "Board Wipe"; kind: "removal" }
  | { label: "Utility"; kind: "utility" }
  | { label: "Card Draw"; kind: "draw" };

export function getCardTags(card: ScryfallCard): CardTag[] {
  const tags: CardTag[] = [];

  // Collect oracle text from all faces
  const oracle = [
    card.oracle_text ?? "",
    ...(card.card_faces?.map((f) => f.oracle_text ?? "") ?? []),
  ].join("\n").toLowerCase();

  const typeLine = card.type_line.toLowerCase();
  const isLand = typeLine.includes("land");

  // Keyword abilities provided by Scryfall (Flying, Deathtouch, Trample, etc.)
  for (const kw of card.keywords ?? []) {
    tags.push({ label: kw, kind: "keyword" });
  }

  // Targeted removal: "destroy target" or "exile target"
  if (/\b(destroy|exile) target\b/i.test(oracle)) {
    tags.push({ label: "Destruction", kind: "removal" });
  }

  // Board wipes: affects all/each permanents/creatures
  if (/\b(destroy|exile) (all|each)\b/i.test(oracle)) {
    tags.push({ label: "Board Wipe", kind: "removal" });
  }

  // Mana production on non-land cards → Utility
  if (!isLand && /\badd (\{|one |two |three |an amount|mana of)/i.test(oracle)) {
    tags.push({ label: "Utility", kind: "utility" });
  }

  // Card draw
  if (/\bdraw (a card|two cards|three cards|x cards|\d+ cards|cards equal)\b/i.test(oracle)) {
    tags.push({ label: "Card Draw", kind: "draw" });
  }

  return tags;
}

export function groupCardsByType(cards: ScryfallCard[]): Record<string, ScryfallCard[]> {
  const groups: Record<string, ScryfallCard[]> = {
    Creatures: [],
    Instants: [],
    Sorceries: [],
    Enchantments: [],
    Artifacts: [],
    Planeswalkers: [],
    Lands: [],
    Other: [],
  };
  for (const card of cards) {
    const t = card.type_line;
    if (t.includes("Land")) groups.Lands.push(card);
    else if (t.includes("Creature")) groups.Creatures.push(card);
    else if (t.includes("Instant")) groups.Instants.push(card);
    else if (t.includes("Sorcery")) groups.Sorceries.push(card);
    else if (t.includes("Enchantment")) groups.Enchantments.push(card);
    else if (t.includes("Artifact")) groups.Artifacts.push(card);
    else if (t.includes("Planeswalker")) groups.Planeswalkers.push(card);
    else groups.Other.push(card);
  }
  return groups;
}
