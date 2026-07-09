// Server-only — import only from API routes, never from client components.
// Wraps the Scryfall API functions with local SQLite fallback so name lookups
// succeed even when the Scryfall API is unavailable.
import { getCardByName, getCardsByNames } from "./scryfall";
import { getCardByNameLocal, getCardsByNamesLocal } from "./cardDb";
import { ScryfallCard } from "@/types/mtg";

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

  return resolved;
}
