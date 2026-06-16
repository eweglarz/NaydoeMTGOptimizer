import { EdhrecCard, EdhrecRecommendation } from "@/types/mtg";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

interface EdhrecApiCard {
  name?: string;
  sanitized?: string;
  sanitized_wo?: string;
  label?: string;
  salt?: number;
  num_decks?: number;
  potential_decks?: number;
  inclusion?: number;
  synergy?: number;
  price?: number;
}

interface EdhrecApiResponse {
  container?: {
    json_dict?: {
      cardlists?: Array<{
        tag?: string;
        cardviews?: EdhrecApiCard[];
      }>;
      card?: {
        name?: string;
      };
    };
  };
}

export async function getCommanderRecommendations(
  commanderName: string
): Promise<EdhrecRecommendation> {
  const slug = slugify(commanderName);
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;

  const res = await fetch(url, {
    next: { revalidate: 86400 },
    headers: { "User-Agent": "MTG-Optimizer/1.0" },
  });

  if (!res.ok) {
    return { commander: commanderName, commanderSlug: slug, cards: [], highSynergy: [], themes: [] };
  }

  const data: EdhrecApiResponse = await res.json();
  const cardlists = data?.container?.json_dict?.cardlists ?? [];

  const allCards: EdhrecCard[] = [];
  const highSynergy: EdhrecCard[] = [];
  const themes: string[] = [];

  for (const list of cardlists) {
    const tag = list.tag ?? "";
    if (tag.toLowerCase().includes("theme") || tag.toLowerCase().includes("tribe")) {
      themes.push(tag);
    }

    const views = list.cardviews ?? [];
    const isHighSynergy = tag.toLowerCase().includes("high synergy");

    for (const v of views) {
      if (!v.name) continue;
      const card: EdhrecCard = {
        name: v.name,
        sanitized: v.sanitized ?? slugify(v.name),
        sanitized_wo: v.sanitized_wo ?? slugify(v.name),
        label: v.label,
        salt: v.salt,
        num_decks: v.num_decks ?? 0,
        potential_decks: v.potential_decks ?? 1,
        // inclusion is the raw deck count; compute 0-1 ratio
        inclusion_rate: (v.potential_decks ?? 0) > 0
          ? (v.num_decks ?? 0) / v.potential_decks!
          : 0,
        synergy_score: v.synergy,
        price: v.price,
      };
      allCards.push(card);
      if (isHighSynergy) highSynergy.push(card);
    }
  }

  return {
    commander: commanderName,
    commanderSlug: slug,
    cards: allCards,
    highSynergy: highSynergy.length ? highSynergy : allCards.slice(0, 20),
    themes,
  };
}

export function scoreCardForDeck(
  cardName: string,
  recommendations: EdhrecRecommendation
): { inclusionRate: number; synergyScore: number } | null {
  const match = recommendations.cards.find(
    (c) => c.name.toLowerCase() === cardName.toLowerCase()
  );
  if (!match) return null;
  return {
    inclusionRate: match.inclusion_rate,
    synergyScore: match.synergy_score ?? 0,
  };
}
