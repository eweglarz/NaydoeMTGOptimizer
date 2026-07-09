export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  legalities: Record<string, string>;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    type_line: string;
    oracle_text?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
      art_crop: string;
    };
  }>;
  prices: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  };
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
  };
  scryfall_uri: string;
  set: string;
  set_name: string;
  rarity: string;
  edhrec_rank?: number;
}

export interface DeckCard {
  card: ScryfallCard;
  quantity: number;
  isCommander?: boolean;
}

export type CardGroup =
  | "Commander"
  | "Creatures"
  | "Instants"
  | "Sorceries"
  | "Enchantments"
  | "Artifacts"
  | "Planeswalkers"
  | "Lands"
  | "Other";

export type BudgetTier = "all" | "budget" | "mid" | "expensive" | "staple";

export interface EdhrecCard {
  name: string;
  sanitized: string;
  sanitized_wo: string;
  label?: string;
  salt?: number;
  num_decks: number;
  potential_decks: number;
  inclusion_rate: number; // 0-1
  synergy_score?: number; // EDHREC's synergy vs baseline
  price?: number;
}

export interface EdhrecRecommendation {
  commander: string;
  commanderSlug: string;
  cards: EdhrecCard[];
  highSynergy: EdhrecCard[];
  themes: string[];
}

export interface OptimizationSuggestion {
  type: "add" | "cut" | "upgrade";
  card: ScryfallCard;
  reason: string;
  synergyScore?: number;
  /** 0–1 ratio (num_decks / potential_decks) */
  inclusionRate?: number;
  /** Raw deck count from EDHREC */
  numDecks?: number;
  budgetTier: "budget" | "mid" | "expensive";
  replaces?: ScryfallCard;
  isGameChanger?: boolean;
  source?: "edhrec" | "scryfall";
  /** For scryfall-sourced suggestions, the theme that matched */
  sourceTheme?: string;
}

export interface Deck {
  commander: ScryfallCard | null;
  partner?: ScryfallCard | null;
  cards: DeckCard[];
}

export interface MoxfieldDeck {
  id: string;
  name: string;
  commanders: Record<string, { card: ScryfallCard; quantity: number }>;
  mainboard: Record<string, { card: ScryfallCard; quantity: number }>;
}
