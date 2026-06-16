"use client";

import { ScryfallCard } from "@/types/mtg";
import { groupCardsByType, getCardPrice, getBudgetTier, getCardTags, CardTag } from "@/lib/scryfall";
import CardTooltip from "./CardTooltip";

interface Props {
  cards: ScryfallCard[];
  commander: ScryfallCard | null;
  onRemove: (card: ScryfallCard) => void;
}

const GROUP_ORDER = ["Creatures", "Instants", "Sorceries", "Enchantments", "Artifacts", "Planeswalkers", "Lands", "Other"];

export default function DeckList({ cards, commander, onRemove }: Props) {
  const groups = groupCardsByType(cards);
  const totalCards = cards.length + (commander ? 1 : 0);
  const deckCost = cards
    .concat(commander ? [commander] : [])
    .reduce((sum, c) => sum + (getCardPrice(c) ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${totalCards === 100 ? "text-green-400" : totalCards > 100 ? "text-red-400" : "text-yellow-400"}`}>
          {totalCards} / 100 cards
        </span>
        <span className="text-gray-400">${deckCost.toFixed(2)} total</span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${totalCards > 100 ? "bg-red-500" : totalCards === 100 ? "bg-green-500" : "bg-yellow-500"}`}
          style={{ width: `${Math.min(100, (totalCards / 100) * 100)}%` }}
        />
      </div>

      {commander && (
        <div className="card-panel border-yellow-500/30">
          <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">Commander</div>
          <CardRow card={commander} onRemove={onRemove} isCommander />
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const groupCards = groups[group] ?? [];
        if (!groupCards.length) return null;
        return (
          <div key={group} className="card-panel">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group}</span>
              <span className="text-xs text-gray-500">{groupCards.length}</span>
            </div>
            <div className="space-y-0.5">
              {groupCards.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name)).map((card, idx) => (
                <CardRow key={`${card.id}-${idx}`} card={card} onRemove={onRemove} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TAG_STYLES: Record<CardTag["kind"], string> = {
  keyword: "bg-blue-950 text-blue-300 border border-blue-800/50",
  removal: "bg-red-950 text-red-300 border border-red-800/50",
  utility: "bg-emerald-950 text-emerald-300 border border-emerald-800/50",
  draw: "bg-violet-950 text-violet-300 border border-violet-800/50",
};

function CardRow({ card, onRemove, isCommander = false }: { card: ScryfallCard; onRemove: (c: ScryfallCard) => void; isCommander?: boolean }) {
  const price = getCardPrice(card);
  const tier = getBudgetTier(price);
  const tags = getCardTags(card);

  return (
    <CardTooltip card={card} side="right">
      <div className="py-1 px-1 rounded hover:bg-gray-800 group transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs w-4 text-right flex-shrink-0">{Math.round(card.cmc)}</span>
          <span className={`text-sm flex-1 truncate ${isCommander ? "text-yellow-300 font-medium" : "text-gray-200"}`}>
            {card.name}
          </span>
          {price !== null && (
            <span className={`text-xs flex-shrink-0 ${tier === "budget" ? "text-green-400" : tier === "mid" ? "text-blue-400" : "text-orange-400"}`}>
              ${price.toFixed(2)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(card); }}
            className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs"
          >
            ✕
          </button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-5 mt-0.5">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${TAG_STYLES[tag.kind]}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </CardTooltip>
  );
}
