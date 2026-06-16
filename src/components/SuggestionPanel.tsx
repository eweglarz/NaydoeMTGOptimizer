"use client";

import { useState } from "react";
import { OptimizationSuggestion, BudgetTier } from "@/types/mtg";
import { getCardPrice } from "@/lib/scryfall";
import { ScryfallCard } from "@/types/mtg";
import CardTooltip from "./CardTooltip";

interface DeckScore {
  score: number;
  label: string;
  details: string;
}

interface Props {
  suggestions: OptimizationSuggestion[];
  deckScore: DeckScore | null;
  onAddCard: (card: ScryfallCard) => void;
  onRemoveCard: (card: ScryfallCard) => void;
  loading: boolean;
  commanderName: string;
}

const BUDGET_LABELS: Record<BudgetTier, string> = {
  all: "All",
  budget: "Budget (<$5)",
  mid: "Mid ($5-20)",
  expensive: "Expensive (>$20)",
  staple: "Staples",
};

type SuggestionType = "all" | "add" | "cut" | "upgrade";
type CardTypeFilter = "all" | "Creatures" | "Instants" | "Sorceries" | "Enchantments" | "Artifacts" | "Planeswalkers" | "Lands";

const CARD_TYPE_KEYWORDS: Record<Exclude<CardTypeFilter, "all">, string> = {
  Creatures: "Creature",
  Instants: "Instant",
  Sorceries: "Sorcery",
  Enchantments: "Enchantment",
  Artifacts: "Artifact",
  Planeswalkers: "Planeswalker",
  Lands: "Land",
};

export default function SuggestionPanel({ suggestions, deckScore, onAddCard, onRemoveCard, loading, commanderName }: Props) {
  const [budgetFilter, setBudgetFilter] = useState<BudgetTier>("all");
  const [typeFilter, setTypeFilter] = useState<SuggestionType>("all");
  const [cardTypeFilter, setCardTypeFilter] = useState<CardTypeFilter>("all");

  const filtered = suggestions.filter((s) => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (budgetFilter !== "all" && s.budgetTier !== budgetFilter) return false;
    if (cardTypeFilter !== "all" && !s.card.type_line.includes(CARD_TYPE_KEYWORDS[cardTypeFilter])) return false;
    return true;
  });

  // Game changers to ADD (not yet in deck)
  const gameChangersToAdd = suggestions.filter((s) => s.type === "add" && s.isGameChanger);
  // Game changers already IN the deck (bracket warnings)
  const gameChangersInDeck = suggestions.filter((s) => s.type === "cut" && s.isGameChanger);

  return (
    <div className="space-y-4">
      {deckScore && (
        <div className="card-panel">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-200">Deck Score</span>
            <span className={`text-sm font-bold ${deckScore.score >= 70 ? "text-green-400" : deckScore.score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
              {deckScore.score}/100
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
            <div
              className={`h-2 rounded-full transition-all ${deckScore.score >= 70 ? "bg-green-500" : deckScore.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${deckScore.score}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{deckScore.label}</span>
            <span>{deckScore.details}</span>
          </div>
        </div>
      )}

      {gameChangersInDeck.length > 0 && (
        <div className="card-panel border border-red-500/40 bg-red-500/5">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">
            ⚠️ Game Changers In Your Deck ({gameChangersInDeck.length})
          </div>
          <p className="text-xs text-gray-500 mb-2">
            These cards raise your deck to <span className="text-red-400 font-medium">Commander Brackets 4</span>. Cut them to play in lower-power games.
          </p>
          <div className="space-y-1">
            {gameChangersInDeck.map((s) => (
              <SuggestionRow key={s.card.id} suggestion={s} onAdd={onAddCard} onCut={onRemoveCard} />
            ))}
          </div>
        </div>
      )}

      {gameChangersToAdd.length > 0 && (
        <div className="card-panel border border-yellow-500/30 bg-yellow-500/5">
          <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-1">
            ⭐ Commander Brackets Game Changers You Could Add
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Official high-impact cards from the Commander Brackets list that fit your commander.
          </p>
          <div className="space-y-1">
            {gameChangersToAdd.map((s) => (
              <SuggestionRow key={s.card.id} suggestion={s} onAdd={onAddCard} onCut={onRemoveCard} />
            ))}
          </div>
        </div>
      )}

      <div className="card-panel space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-200">All Suggestions</span>
          <span className="text-xs text-gray-500">{filtered.length} suggestions</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "add", "cut", "upgrade"] as SuggestionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${typeFilter === t ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              {t === "all" ? "All" : t === "add" ? "➕ Add" : t === "cut" ? "✂️ Cut" : "⬆️ Upgrade"}
              {t !== "all" && <span className="ml-1 text-gray-500">({suggestions.filter((s) => s.type === t).length})</span>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "budget", "mid", "expensive"] as BudgetTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => setBudgetFilter(tier)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${budgetFilter === tier ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              {BUDGET_LABELS[tier]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "Creatures", "Instants", "Sorceries", "Enchantments", "Artifacts", "Planeswalkers", "Lands"] as CardTypeFilter[]).map((ct) => (
            <button
              key={ct}
              onClick={() => setCardTypeFilter(ct)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${cardTypeFilter === ct ? "bg-indigo-700 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              {ct === "all" ? "All Types" : ct}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            Analyzing deck...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            {suggestions.length === 0
              ? "Run the optimizer to see suggestions"
              : "No suggestions match the current filters"}
          </div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {filtered.map((s, i) => (
              <SuggestionRow key={`${s.card.id}-${i}`} suggestion={s} onAdd={onAddCard} onCut={onRemoveCard} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion: s,
  onAdd,
  onCut,
}: {
  suggestion: OptimizationSuggestion;
  onAdd: (c: ScryfallCard) => void;
  onCut: (c: ScryfallCard) => void;
}) {
  const price = getCardPrice(s.card);

  return (
    <CardTooltip card={s.card}>
      <div className={`flex items-start gap-2 p-2 rounded-lg hover:bg-gray-800 transition-colors group ${s.isGameChanger ? "border-l-2 border-yellow-500/60 pl-2" : ""}`}>
        <span className="flex-shrink-0 mt-0.5">
          {s.isGameChanger && s.type === "add" ? "⭐" : s.isGameChanger && s.type === "cut" ? "⚠️" : s.type === "add" ? "➕" : s.type === "cut" ? "✂️" : "⬆️"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-medium ${s.isGameChanger ? "text-yellow-300" : "text-white"}`}>{s.card.name}</span>
            {s.isGameChanger && (
              <span className="text-xs bg-yellow-900/60 text-yellow-300 px-1.5 py-0.5 rounded-full">Game Changer</span>
            )}
            {s.type === "upgrade" && s.replaces && (
              <span className="text-xs text-gray-500">for {s.replaces.name}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${s.budgetTier === "budget" ? "badge-budget" : s.budgetTier === "mid" ? "badge-mid" : "badge-expensive"}`}>
              {price !== null ? `$${price.toFixed(2)}` : s.budgetTier}
            </span>
            {s.synergyScore != null && s.synergyScore > 0 && (
              <span className="badge-synergy">
                {Math.round(s.synergyScore * 100)}% synergy
              </span>
            )}
            {s.numDecks != null && s.numDecks > 0 && (
              <span className="text-xs text-gray-500">
                in {s.numDecks.toLocaleString()} decks
                {s.inclusionRate != null && s.inclusionRate > 0
                  ? ` (${Math.round(s.inclusionRate * 100)}%)`
                  : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.reason}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {(s.type === "add" || s.type === "upgrade") && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(s.card); }}
              className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded transition-colors"
            >
              Add
            </button>
          )}
          {(s.type === "cut" || s.type === "upgrade") && s.replaces && (
            <button
              onClick={(e) => { e.stopPropagation(); onCut(s.replaces!); }}
              className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-0.5 rounded transition-colors"
            >
              Cut
            </button>
          )}
        </div>
      </div>
    </CardTooltip>
  );
}
