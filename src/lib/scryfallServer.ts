// Server-only — import only from API routes, never from client components.
// Wraps the Scryfall API functions with local SQLite fallback so name lookups
// succeed even when the Scryfall API is unavailable.
import { getCardByName, getCardsByNames } from "./scryfall";
import { getCardByNameLocal, getCardsByNamesLocal } from "./cardDb";
import { ScryfallCard } from "@/types/mtg";

const SCRYFALL_UA = "NaydoeMTGOptimizer/1.0 (contact: elias666wegs@gmail.com)";

// For cards with no USD price, query Scryfall for the cheapest available printing
// and patch that price onto the resolved card.
async function fillMissingPrices(resolved: Map<string, ScryfallCard>): Promise<void> {
  const namesToFix = new Set<string>();
  for (const card of resolved.values()) {
    if (!card.prices?.usd) namesToFix.add(card.name);
  }
  if (namesToFix.size === 0) return;

  await Promise.all(
    [...namesToFix].map(async (name) => {
      try {
        const q = `!"${name}" game:paper`;
        const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=usd&dir=asc&unique=prints`;
        const res = await fetch(url, { headers: { "User-Agent": SCRYFALL_UA } });
        if (!res.ok) return;
        const data = await res.json() as { data: ScryfallCard[] };
        const cheapest = data.data.find((c) => c.prices?.usd);
        if (!cheapest) return;
        for (const [key, card] of resolved.entries()) {
          if (card.name === name) {
            resolved.set(key, { ...card, prices: { ...card.prices, usd: cheapest.prices.usd } });
          }
        }
      } catch {
        // skip — leave price as null rather than failing the whole resolve
      }
    })
  );
}

export async function getCardByNameSafe(name: string): Promise<ScryfallCard | null> {
  const card = await getCardByName(name);
  if (card) return card;
  return getCardByNameLocal(name);
}

export async function getCardsByNamesSafe(names: string[]): Promise<Map<string, ScryfallCard>> {
  const resolved = await getCardsByNames(names);

  const missing = names.filter((n) => !resolved.has(n.toLowerCase()));
  if (missing.length > 0) {
    const local = getCardsByNamesLocal(missing);
    for (const [key, card] of local) {
      if (!resolved.has(key)) resolved.set(key, card);
    }
  }

  await fillMissingPrices(resolved);

  return resolved;
}
