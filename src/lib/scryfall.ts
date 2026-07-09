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
        const canonical = card.name.toLowerCase();
        resolved.set(canonical, card);
        // For DFCs (e.g. "Needleverge Pathway // Pillarverge Pathway"), also index by front face
        const frontFace = canonical.split(" // ")[0].trim();
        if (frontFace !== canonical) resolved.set(frontFace, card);
      }
      // Queue anything the bulk endpoint couldn't find for individual fuzzy lookup
      for (const nf of data.not_found ?? []) {
        if (nf.name) fuzzyQueue.push(nf.name.toLowerCase());
      }
    } catch {
      fuzzyQueue.push(...chunk);
    }
  }

  // Fuzzy fallback for not_found cards.
  // Store under BOTH canonical name and the original queried name so that a
  // near-miss (e.g. Scryfall returns a slightly different canonical title) is
  // still retrievable when the caller looks up by the original queried name.
  for (const name of fuzzyQueue) {
    const card = await getCardByName(name);
    if (card) {
      const canonical = card.name.toLowerCase();
      resolved.set(canonical, card);
      if (name !== canonical) resolved.set(name, card);
      const frontFace = canonical.split(" // ")[0].trim();
      if (frontFace !== canonical) resolved.set(frontFace, card);
    }
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
  | { label: string; kind: "tribe" }
  | { label: "Destruction"; kind: "removal" }
  | { label: "Board Wipe"; kind: "removal" }
  | { label: "Utility"; kind: "utility" }
  | { label: "Card Draw"; kind: "draw" }
  | { label: "Life Gain"; kind: "lifegain" }
  | { label: "Burn"; kind: "burn" }
  | { label: "Tutor"; kind: "tutor" }
  | { label: "Control"; kind: "control" }
  | { label: "Counters"; kind: "counters" }
  | { label: string; kind: "named-counter" }
  | { label: "Copy"; kind: "copy" }
  | { label: "Discard"; kind: "discard" };

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

  // Card draw — if the card has any cycling keyword, strip parenthetical reminder text
  // first so the cycling clause ("Discard this card: Draw a card.") doesn't generate
  // a redundant Card Draw tag. Only tag as Card Draw when draw exists outside cycling.
  const hasCyclingKw = (card.keywords ?? []).some((k) => /cycling/i.test(k));
  const oracleNoParen = hasCyclingKw ? oracle.replace(/\([^)]*\)/g, "") : oracle;
  if (/\bdraw (a card|two cards|three cards|x cards|\d+ cards|cards equal)\b/i.test(oracleNoParen)) {
    tags.push({ label: "Card Draw", kind: "draw" });
  }

  // Life Gain: nonland cards that cause life to be gained
  if (!isLand && /\bgains? .{0,25}life\b/i.test(oracle)) {
    tags.push({ label: "Life Gain", kind: "lifegain" });
  }

  // Burn: deals damage or causes life loss directed at opponents/players
  if (
    !isLand &&
    (
      /\b(target opponent|each opponent)\b.{0,50}\bloses? \S+ life\b/i.test(oracle) ||
      /\bdeal(s)? .{0,20}\bdamage to (target (opponent|player|player or planeswalker)|each (opponent|player)|any target)\b/i.test(oracle)
    )
  ) {
    tags.push({ label: "Burn", kind: "burn" });
  }

  // Tutor: searches library for a nonland card.
  // Exclude pure land-fetches (fetch lands, ramp spells) by checking that the
  // search target isn't a basic land type or generic "land card".
  if (
    /search your library for/i.test(oracle) &&
    !/search your library for (a |an |up to \w+ )?(basic )?(land|plains|island|swamp|mountain|forest)\b/i.test(oracle)
  ) {
    tags.push({ label: "Tutor", kind: "tutor" });
  }

  // Control: counterspells, stax, ability restrictions, and tax effects.
  // "counter target \w* spell/instant/sorcery" handles qualified targets like
  // "counter target blue spell" or "counter target instant or sorcery spell".
  if (
    /counter target \w* ?(spell|instant|sorcery)/i.test(oracle) ||
    /\bcan't cast\b/i.test(oracle) ||
    /\bcan't activate abilities\b/i.test(oracle) ||
    /abilities.*can't be activated/i.test(oracle) ||
    /unless (its controller|that player|they) pays/i.test(oracle)
  ) {
    tags.push({ label: "Control", kind: "control" });
  }

  // Counters: placing +1/+1 or -1/-1 counters on permanents (generic counter effects)
  if (
    /put .{0,20} counters? (on|onto)\b/i.test(oracle) ||
    /\+\d+\/\+\d+ counters?/i.test(oracle) ||
    /-\d+\/-\d+ counters?/i.test(oracle)
  ) {
    tags.push({ label: "Counters", kind: "counters" });
  }

  // Named special counter types — each shown as its own tag
  const NAMED_COUNTER_TYPES = [
    "experience", "poison", "energy", "oil", "charge", "spore", "lore",
    "age", "time", "fate", "ice", "level", "flood", "bounty", "acorn",
    "ki", "feather", "fade", "rust", "study", "verse", "depletion",
    "blood", "shield", "quest", "infection", "plague",
  ] as const;
  for (const ctype of NAMED_COUNTER_TYPES) {
    if (new RegExp(`\\b${ctype} counters?\\b`, "i").test(oracle)) {
      tags.push({ label: ctype.charAt(0).toUpperCase() + ctype.slice(1), kind: "named-counter" });
    }
  }

  // Copy: copying spells, permanents, or abilities.
  if (
    /\bcop(y|ies) (target|of|the|that|each|it)\b/i.test(oracle) ||
    /\bcreate .{0,30} cop(y|ies)\b/i.test(oracle) ||
    /\bput .{0,20} cop(y|ies)\b/i.test(oracle)
  ) {
    tags.push({ label: "Copy", kind: "copy" });
  }

  // Discard: nonland cards that force a player to discard.
  // Catches: targeted/mass discard, "discard your hand", and loot/wheel effects
  // where draw and discard appear together (e.g. "Draw two cards, then discard two").
  // Excludes optional "you may discard" and plain activated costs ("discard a card:").
  // Uses oracleNoParen so cycling reminder "(Discard this card: Draw a card.)" doesn't
  // falsely trigger the draw+discard co-occurrence pattern.
  if (
    !isLand &&
    (
      /\b(target player|each player|target opponent|each opponent|that player|players)\b.{0,50}\bdiscards?\b/i.test(oracleNoParen) ||
      /\bdiscards? (your hand|all cards in (your|their) hand)\b/i.test(oracleNoParen) ||
      /\b(draw .{0,40} discard|discard .{0,40} draw)\b/i.test(oracleNoParen)
    )
  ) {
    tags.push({ label: "Discard", kind: "discard" });
  }

  // Creature subtypes — always pushed last so they appear at the end of the tag row.
  const primaryTypeLine = card.card_faces?.[0]?.type_line ?? card.type_line;
  if (primaryTypeLine.includes("Creature")) {
    const dashIdx = primaryTypeLine.indexOf("—");
    if (dashIdx !== -1) {
      const subtypePart = primaryTypeLine.slice(dashIdx + 1).trim();
      for (const subtype of subtypePart.split(/\s+/).filter(Boolean)) {
        tags.push({ label: subtype, kind: "tribe" });
      }
    }
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
