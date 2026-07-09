"use client";

import { useState, useMemo, useCallback } from "react";
import { ScryfallCard } from "@/types/mtg";
import { getCardPrice } from "@/lib/scryfall";

type BuyMode = "cheapest" | "fewest" | "balanced";

interface BuyGroup {
  label: string;
  cards: ScryfallCard[];
  cost: number;
}

interface Props {
  cards: ScryfallCard[];
  commander: ScryfallCard | null;
}

function formatMassEntry(cards: ScryfallCard[]): string {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, qty]) => `${qty} ${name}`)
    .join("\n");
}

function tcgUrl(excludeDirect: boolean): string {
  // directInventory=Exclude is passed so TCGPlayer reads the preference on load;
  // the user must also confirm the setting inside their optimizer panel.
  const base = "https://www.tcgplayer.com/massentry";
  return excludeDirect ? `${base}?directInventory=Exclude` : base;
}

function buildGroups(cards: ScryfallCard[], mode: BuyMode): BuyGroup[] {
  if (mode === "cheapest") {
    const sorted = [...cards].sort((a, b) => (getCardPrice(b) ?? 0) - (getCardPrice(a) ?? 0));
    return [{ label: "All Cards", cards: sorted, cost: sorted.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0) }];
  }

  if (mode === "fewest") {
    const bySet = new Map<string, ScryfallCard[]>();
    for (const card of cards) {
      if (!bySet.has(card.set)) bySet.set(card.set, []);
      bySet.get(card.set)!.push(card);
    }
    return [...bySet.values()]
      .sort((a, b) => b.length - a.length)
      .map((group) => ({
        label: `${group[0].set_name} — ${group.length} card${group.length !== 1 ? "s" : ""}`,
        cards: group,
        cost: group.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0),
      }));
  }

  // balanced: tier by price
  const cheap: ScryfallCard[] = [];
  const mid: ScryfallCard[] = [];
  const expensive: ScryfallCard[] = [];
  for (const card of cards) {
    const p = getCardPrice(card) ?? 0;
    if (p < 2) cheap.push(card);
    else if (p < 10) mid.push(card);
    else expensive.push(card);
  }

  const groups: BuyGroup[] = [];
  if (cheap.length) {
    groups.push({
      label: `Bulk Buy — Under $2 (${cheap.length} cards)`,
      cards: cheap,
      cost: cheap.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0),
    });
  }
  if (mid.length) {
    groups.push({
      label: `Mid-Range — $2–$10 (${mid.length} cards)`,
      cards: mid,
      cost: mid.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0),
    });
  }
  for (const card of expensive.sort((a, b) => (getCardPrice(b) ?? 0) - (getCardPrice(a) ?? 0))) {
    const p = getCardPrice(card) ?? 0;
    groups.push({ label: `${card.name} — $${p.toFixed(2)}`, cards: [card], cost: p });
  }
  return groups;
}

const MODE_INFO: Record<BuyMode, { label: string; sublabel: string; hint: string }> = {
  cheapest: {
    label: "Cheapest",
    sublabel: "Lowest total price",
    hint: "One combined list. Use TCGPlayer's built-in optimizer to find the lowest total across all sellers.",
  },
  fewest: {
    label: "Fewest Sellers",
    sublabel: "Group by set",
    hint: "Cards grouped by Magic set — sellers often stock entire sets. Open each group to buy from fewer sellers.",
  },
  balanced: {
    label: "Balanced",
    sublabel: "Tier by price",
    hint: "Cheap cards bulk together, mid-range as one batch, expensive cards searched individually for best single-card price.",
  },
};

export default function BuyListPanel({ cards, commander }: Props) {
  const allCards = useMemo(
    () => (commander ? [commander, ...cards] : [...cards]),
    [cards, commander]
  );

  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(allCards.map((c, i) => `${c.id}-${i}`))
  );
  const [mode, setMode] = useState<BuyMode>("cheapest");
  const [copied, setCopied] = useState<string | null>(null);
  const [excludeDirect, setExcludeDirect] = useState(true);

  const selectedCards = useMemo(
    () => allCards.filter((_, i) => selected.has(`${allCards[i].id}-${i}`)),
    [allCards, selected]
  );

  const groups = useMemo(() => buildGroups(selectedCards, mode), [selectedCards, mode]);
  const totalCost = selectedCards.reduce((s, c) => s + (getCardPrice(c) ?? 0), 0);

  const toggleCard = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === allCards.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allCards.map((c, i) => `${c.id}-${i}`)));
    }
  }, [selected.size, allCards]);

  const handleCopy = useCallback(async (groupCards: ScryfallCard[], id: string) => {
    try {
      await navigator.clipboard.writeText(formatMassEntry(groupCards));
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }, []);

  const handleOpen = useCallback(async (groupCards: ScryfallCard[], id: string) => {
    await handleCopy(groupCards, id);
    window.open(tcgUrl(excludeDirect), "_blank", "noopener,noreferrer");
  }, [handleCopy, excludeDirect]);

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="card-panel">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-gray-200">TCGPlayer Buy List</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {selectedCards.length} card{selectedCards.length !== 1 ? "s" : ""} selected
              {" · "}~{groups.length} seller{groups.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-yellow-400">${totalCost.toFixed(2)}</div>
            <div className="text-xs text-gray-500">estimated total</div>
          </div>
        </div>

        {/* Exclude Direct toggle */}
        <button
          onClick={() => setExcludeDirect((v) => !v)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs mb-3 transition-colors ${
            excludeDirect
              ? "bg-red-950/40 border-red-700/50 text-red-300"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          <span className="font-medium">
            {excludeDirect ? "TCGplayer Direct excluded" : "TCGplayer Direct included"}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${excludeDirect ? "bg-red-800 text-red-200" : "bg-gray-700 text-gray-400"}`}>
            {excludeDirect ? "ON" : "OFF"}
          </span>
        </button>

        {/* Reminder banner when exclude is active */}
        {excludeDirect && (
          <div className="bg-amber-950/40 border border-amber-700/40 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-amber-300 leading-relaxed">
              <span className="font-semibold">After opening TCGPlayer:</span> in the optimizer panel, uncheck{" "}
              <span className="font-mono bg-amber-900/40 px-1 rounded">Include TCGplayer Direct Inventory</span>{" "}
              to finalize seller exclusion.
            </p>
          </div>
        )}

        {/* Mode buttons */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {(Object.entries(MODE_INFO) as [BuyMode, typeof MODE_INFO[BuyMode]][]).map(([id, info]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`px-2 py-2 rounded-lg text-center text-xs transition-colors border ${
                mode === id
                  ? "bg-emerald-900/50 border-emerald-500/60 text-emerald-200"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              <div className="font-semibold">{info.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{info.sublabel}</div>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">{MODE_INFO[mode].hint}</p>
      </div>

      {/* Buyer groups */}
      {groups.map((group, gi) => {
        const copyId = `group-${gi}`;
        const hasCopied = copied === copyId;
        return (
          <div key={gi} className="card-panel">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-xs font-semibold text-gray-300 truncate flex-1">{group.label}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs font-medium text-yellow-400">${group.cost.toFixed(2)}</span>
                <button
                  onClick={() => handleCopy(group.cards, copyId)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    hasCopied ? "bg-green-800 text-green-200" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  }`}
                >
                  {hasCopied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => handleOpen(group.cards, copyId)}
                  className="text-xs px-2 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white transition-colors"
                >
                  Open TCG ↗
                </button>
              </div>
            </div>
            <div className="space-y-0.5 max-h-36 overflow-y-auto pr-1">
              {group.cards.map((card, ci) => {
                const price = getCardPrice(card);
                return (
                  <div key={`${card.id}-${ci}`} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-gray-300 truncate flex-1 mr-2">{card.name}</span>
                    {price !== null && (
                      <span className="text-gray-500 flex-shrink-0">${price.toFixed(2)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {selectedCards.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Select cards below to build your buy list
        </div>
      )}

      {/* Card checklist */}
      <div className="card-panel">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cards in Deck</span>
          <button onClick={toggleAll} className="text-xs text-gray-500 hover:text-white transition-colors">
            {selected.size === allCards.length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
          {allCards.map((card, i) => {
            const key = `${card.id}-${i}`;
            const isSelected = selected.has(key);
            const price = getCardPrice(card);
            return (
              <label
                key={key}
                className="flex items-center gap-2 py-0.5 px-1 cursor-pointer rounded hover:bg-gray-800 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCard(key)}
                  className="accent-emerald-500 flex-shrink-0"
                />
                <span className={`text-sm flex-1 truncate transition-colors ${isSelected ? "text-gray-200" : "text-gray-600 line-through"}`}>
                  {card.name}
                </span>
                {price !== null && (
                  <span className={`text-xs flex-shrink-0 transition-colors ${isSelected ? "text-gray-400" : "text-gray-700"}`}>
                    ${price.toFixed(2)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
