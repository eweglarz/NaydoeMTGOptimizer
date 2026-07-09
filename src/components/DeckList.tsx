"use client";

import { useState, useMemo, useEffect } from "react";
import { ScryfallCard } from "@/types/mtg";
import { groupCardsByType, getCardPrice, getBudgetTier, getCardTags, CardTag } from "@/lib/scryfall";
import { isGameChanger } from "@/lib/gamechangers";
import CardTooltip from "./CardTooltip";
import ManaCost from "./ManaCost";

type SortMode = "cmc" | "alpha" | "price" | "color";

interface Props {
  cards: ScryfallCard[];
  commander: ScryfallCard | null;
  partner: ScryfallCard | null;
  onRemove: (card: ScryfallCard) => void;
  onAdd?: (card: ScryfallCard) => void;
  lookingToAdd?: ScryfallCard[];
  onRemoveFromLookingToAdd?: (card: ScryfallCard) => void;
  onMoveToDeck?: (card: ScryfallCard) => void;
}

const GROUP_ORDER = ["Creatures", "Instants", "Sorceries", "Enchantments", "Artifacts", "Planeswalkers", "Lands", "Other"];

const COLOR_PRIORITY: Record<string, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };

function colorRank(card: ScryfallCard): number {
  const ci = card.color_identity;
  if (ci.length === 0) return 6;
  if (ci.length > 1) return 5;
  return COLOR_PRIORITY[ci[0]] ?? 5;
}

function applySort(cards: ScryfallCard[], mode: SortMode): ScryfallCard[] {
  const arr = [...cards];
  if (mode === "alpha") return arr.sort((a, b) => a.name.localeCompare(b.name));
  if (mode === "price") return arr.sort((a, b) => (getCardPrice(b) ?? 0) - (getCardPrice(a) ?? 0));
  if (mode === "color") return arr.sort((a, b) => colorRank(a) - colorRank(b) || a.cmc - b.cmc || a.name.localeCompare(b.name));
  return arr.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
}

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "cmc", label: "Mana Value" },
  { id: "alpha", label: "Alphabetical" },
  { id: "price", label: "Price" },
  { id: "color", label: "Color" },
];

const TAG_STYLES: Record<CardTag["kind"], string> = {
  keyword: "bg-blue-950 text-blue-300 border border-blue-800/50",
  removal: "bg-red-950 text-red-300 border border-red-800/50",
  utility: "bg-emerald-950 text-emerald-300 border border-emerald-800/50",
  draw: "bg-violet-950 text-violet-300 border border-violet-800/50",
  lifegain: "bg-rose-950 text-rose-300 border border-rose-800/50",
  burn: "bg-orange-950 text-orange-300 border border-orange-800/50",
  tutor: "bg-amber-950 text-amber-300 border border-amber-800/50",
  control: "bg-indigo-950 text-indigo-300 border border-indigo-800/50",
  counters: "bg-teal-950 text-teal-300 border border-teal-800/50",
  "named-counter": "bg-sky-950 text-sky-300 border border-sky-800/50",
  copy: "bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-800/50",
  discard: "bg-zinc-900 text-zinc-300 border border-zinc-700/50",
  // Tribe tags are intentionally dim — visible but clearly secondary to functional tags
  tribe: "text-green-500/50 border border-green-900/40",
};

export default function DeckList({ cards, commander, partner, onRemove, onAdd, lookingToAdd = [], onRemoveFromLookingToAdd, onMoveToDeck }: Props) {
  const [sort, setSort] = useState<SortMode>("alpha");

  const groups = groupCardsByType(cards);
  const totalCards = cards.length + (commander ? 1 : 0) + (partner ? 1 : 0);
  const deckCost = [...cards, ...(commander ? [commander] : []), ...(partner ? [partner] : [])]
    .reduce((s, c) => s + (getCardPrice(c) ?? 0), 0);

  // Color identity is the union of both commanders' identities (matters for upgrade suggestions)
  const colorIdentity = useMemo(() => {
    const ci = new Set([
      ...(commander?.color_identity ?? []),
      ...(partner?.color_identity ?? []),
    ]);
    return [...ci];
  }, [commander, partner]);

  const deckCardNames = useMemo(
    () => [
      ...cards.map((c) => c.name),
      ...(commander ? [commander.name] : []),
      ...(partner ? [partner.name] : []),
    ],
    [cards, commander, partner]
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className={`font-semibold text-sm ${totalCards === 100 ? "text-green-400" : totalCards > 100 ? "text-red-400" : "text-yellow-400"}`}>
            {totalCards} / 100 cards
          </span>
          <span className="text-gray-400 text-sm">${deckCost.toFixed(2)} total</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 mr-0.5">Sort</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSort(opt.id)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                sort === opt.id ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${totalCards > 100 ? "bg-red-500" : totalCards === 100 ? "bg-green-500" : "bg-yellow-500"}`}
          style={{ width: `${Math.min(100, (totalCards / 100) * 100)}%` }}
        />
      </div>

      {/* 3-column flow — groups fill each column top-to-bottom before wrapping */}
      <div className="columns-3 gap-3">
        {(commander || partner) && (
          <div className="card-panel border-yellow-500/30 break-inside-avoid mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                {commander && partner ? "Commanders" : "Commander"}
              </span>
              <span className="text-xs text-gray-500">
                ${[commander, partner].reduce((s, c) => s + (c ? (getCardPrice(c) ?? 0) : 0), 0).toFixed(2)}
              </span>
            </div>
            {commander && <CardRow card={commander} onRemove={onRemove} isCommander />}
            {partner && <CardRow card={partner} onRemove={onRemove} isCommander />}
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const groupCards = groups[group] ?? [];
          if (!groupCards.length) return null;
          const sorted = applySort(groupCards, sort);
          const groupCost = groupCards.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0);
          return (
            <div key={group} className="card-panel break-inside-avoid mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group} <span className="text-gray-600 font-normal normal-case">({groupCards.length})</span>
                </span>
                <span className="text-xs text-gray-500">${groupCost.toFixed(2)}</span>
              </div>
              <div className="space-y-0.5">
                {sorted.map((card, idx) => (
                  <CardRow
                    key={`${card.id}-${idx}`}
                    card={card}
                    onRemove={onRemove}
                    onAdd={onAdd}
                    colorIdentity={colorIdentity}
                    deckCardNames={deckCardNames}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Looking to Add — cards saved from suggestions, not counted toward deck limit */}
      {lookingToAdd.length > 0 && (
        <div className="card-panel border border-purple-800/40 mt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              ★ Looking to Add <span className="text-gray-600 font-normal normal-case">({lookingToAdd.length})</span>
            </span>
            <span className="text-xs text-gray-600">Saved from suggestions — not counted in deck</span>
          </div>
          <div className="space-y-0.5">
            {lookingToAdd.map((card, i) => (
              <LookingToAddRow
                key={`${card.id}-${i}`}
                card={card}
                onMoveToDeck={onMoveToDeck}
                onRemove={onRemoveFromLookingToAdd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardRow({
  card,
  onRemove,
  onAdd,
  colorIdentity,
  deckCardNames,
  isCommander = false,
}: {
  card: ScryfallCard;
  onRemove: (c: ScryfallCard) => void;
  onAdd?: (card: ScryfallCard) => void;
  colorIdentity?: string[];
  deckCardNames?: string[];
  isCommander?: boolean;
}) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const price = getCardPrice(card);
  const tier = getBudgetTier(price);
  const tags = getCardTags(card);
  const gc = isGameChanger(card.name);
  const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost;

  useEffect(() => { setShowUpgrade(false); }, [card.id]);

  const hasUpgradableTags = tags.some((t) => t.kind !== "keyword");

  return (
    <>
      <CardTooltip card={card}>
        <div className="py-1 px-1 rounded hover:bg-gray-800 group transition-colors">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm truncate min-w-0 flex-1 ${isCommander ? "text-yellow-300 font-medium" : gc ? "text-yellow-200" : "text-gray-200"}`}>
              {card.name}
            </span>
            <ManaCost cost={manaCost} />
            {!isCommander && onAdd && (
              <button
                onClick={(e) => { e.stopPropagation(); if (hasUpgradableTags) setShowUpgrade((v) => !v); }}
                title={hasUpgradableTags ? "Find upgrade suggestions" : undefined}
                className={`text-xs flex-shrink-0 transition-colors ${
                  !hasUpgradableTags
                    ? "invisible pointer-events-none"
                    : showUpgrade
                      ? "text-purple-400"
                      : "text-gray-600 hover:text-purple-400 opacity-0 group-hover:opacity-100"
                }`}
              >
                ⬆
              </button>
            )}
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
          {(gc || tags.length > 0) && (
            <div className="flex flex-wrap gap-1 pl-5 mt-0.5">
              {gc && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/60 text-yellow-300 border border-yellow-700/50 leading-none">
                  ★ Game Changer
                </span>
              )}
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

      {showUpgrade && onAdd && (
        <UpgradePanel
          card={card}
          colorIdentity={colorIdentity ?? []}
          deckCardNames={deckCardNames ?? []}
          onAdd={(c) => { onAdd(c); setShowUpgrade(false); }}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </>
  );
}

function UpgradePanel({
  card,
  colorIdentity,
  deckCardNames,
  onAdd,
  onClose,
}: {
  card: ScryfallCard;
  colorIdentity: string[];
  deckCardNames: string[];
  onAdd: (card: ScryfallCard) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<ScryfallCard[]>([]);
  const [sourceCmc, setSourceCmc] = useState(card.cmc);

  useEffect(() => {
    const tags = getCardTags(card).map((t) => t.kind);
    fetch("/api/upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardName: card.name,
        tags,
        colorIdentity,
        cmc: card.cmc,
        deckCardNames,
      }),
    })
      .then((r) => r.json())
      .then((data: { suggestions: ScryfallCard[]; sourceCmc: number }) => {
        setSuggestions(data.suggestions ?? []);
        setSourceCmc(data.sourceCmc ?? card.cmc);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-0.5 mb-1 rounded-lg border border-purple-800/40 bg-gray-950 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
          ⬆ Upgrades for {card.name}
        </span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-xs leading-none">✕</button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <span className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin inline-block" />
          <span className="text-xs text-gray-500">Searching Scryfall...</span>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-gray-500 py-1">No alternatives found in your color identity.</p>
      ) : (
        <div className="space-y-0.5">
          {suggestions.map((s) => {
            const sp = getCardPrice(s);
            const sCost = s.mana_cost ?? s.card_faces?.[0]?.mana_cost;
            const isCheaper = s.cmc < sourceCmc;
            const sTier = getBudgetTier(sp);
            return (
              <CardTooltip key={s.id} card={s}>
                <div className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-gray-800 transition-colors">
                  {isCheaper ? (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-900/60 text-green-400 border border-green-800/40 leading-none flex-shrink-0">
                      ↓ MV {s.cmc}
                    </span>
                  ) : (
                    <span className="text-[9px] text-gray-600 flex-shrink-0 w-8 text-center">MV {s.cmc}</span>
                  )}
                  <span className="text-xs text-gray-200 flex-1 truncate">{s.name}</span>
                  <ManaCost cost={sCost} />
                  {sp !== null && (
                    <span className={`text-[11px] flex-shrink-0 ${sTier === "budget" ? "text-green-400" : sTier === "mid" ? "text-blue-400" : "text-orange-400"}`}>
                      ${sp.toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => onAdd(s)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 hover:bg-purple-700 border border-purple-700/50 leading-none flex-shrink-0 transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </CardTooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LookingToAddRow({
  card,
  onMoveToDeck,
  onRemove,
}: {
  card: ScryfallCard;
  onMoveToDeck?: (card: ScryfallCard) => void;
  onRemove?: (card: ScryfallCard) => void;
}) {
  const price = getCardPrice(card);
  const tier = getBudgetTier(price);
  const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost;
  return (
    <CardTooltip card={card}>
      <div className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-gray-800 group transition-colors">
        <span className="text-purple-500 text-xs flex-shrink-0">★</span>
        <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{card.name}</span>
        <ManaCost cost={manaCost} />
        {price !== null && (
          <span className={`text-xs flex-shrink-0 ${tier === "budget" ? "text-green-400" : tier === "mid" ? "text-blue-400" : "text-orange-400"}`}>
            ${price.toFixed(2)}
          </span>
        )}
        {onMoveToDeck && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToDeck(card); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/60 text-green-400 hover:bg-green-700 border border-green-800/40 leading-none flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            → Deck
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(card); }}
            className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </CardTooltip>
  );
}
