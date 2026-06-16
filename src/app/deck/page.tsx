"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ScryfallCard, OptimizationSuggestion } from "@/types/mtg";
import DeckList from "@/components/DeckList";
import CardSearch from "@/components/CardSearch";
import SuggestionPanel from "@/components/SuggestionPanel";
import DeckImport from "@/components/DeckImport";
import CommanderSearch from "@/components/CommanderSearch";
import CardImage from "@/components/CardImage";
import { getCardImage } from "@/lib/scryfall";

interface DeckScore {
  score: number;
  label: string;
  details: string;
}

function DeckPageInner() {
  const searchParams = useSearchParams();
  const [commander, setCommander] = useState<ScryfallCard | null>(null);
  const [partner, setPartner] = useState<ScryfallCard | null>(null);

  useEffect(() => {
    const commanderName = searchParams.get("commander");
    if (!commanderName) return;
    fetch(`/api/scryfall/card?name=${encodeURIComponent(commanderName)}`)
      .then((r) => r.json())
      .then((card: ScryfallCard) => { if (card.id) setCommander(card); })
      .catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    const raw = sessionStorage.getItem("pendingImport");
    if (!raw) return;
    sessionStorage.removeItem("pendingImport");
    try {
      const result = JSON.parse(raw) as { commanders: ScryfallCard[]; cards: ScryfallCard[] };
      if (result.commanders[0]) setCommander(result.commanders[0]);
      if (result.commanders[1]) { setPartner(result.commanders[1]); setHasPartner(true); }
      setCards(result.cards);
      setTab("deck");
    } catch {}
  }, []);
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [deckScore, setDeckScore] = useState<DeckScore | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [tab, setTab] = useState<"deck" | "suggestions">("deck");
  const [hasPartner, setHasPartner] = useState(false);

  const addCard = useCallback((card: ScryfallCard) => {
    setCards((prev) => {
      if (prev.find((c) => c.id === card.id)) return prev;
      return [...prev, card];
    });
  }, []);

  const removeCard = useCallback((card: ScryfallCard) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  const handleImport = ({ commanders, cards: importedCards }: { commanders: ScryfallCard[]; cards: ScryfallCard[] }) => {
    if (commanders[0]) setCommander(commanders[0]);
    if (commanders[1]) { setPartner(commanders[1]); setHasPartner(true); }
    setCards(importedCards);
    setTab("deck");
  };

  const runOptimizer = async () => {
    if (!commander) return;
    setOptimizeLoading(true);
    setSuggestions([]);
    setTab("suggestions");

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commanderName: commander.name,
          deckCardNames: cards.map((c) => c.name),
        }),
      });
      const data = await res.json() as {
        suggestions: OptimizationSuggestion[];
        deckScore: DeckScore;
      };
      setSuggestions(data.suggestions ?? []);
      setDeckScore(data.deckScore ?? null);
    } finally {
      setOptimizeLoading(false);
    }
  };

  const commanderArt = commander ? getCardImage(commander, "art_crop") : null;
  const totalCards = cards.length + (commander ? 1 : 0) + (partner ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-57px)]" >
      {/* Left sidebar */}
      <aside className="w-72 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
        {/* Commander art header */}
        {commanderArt ? (
          <div className="relative h-32 flex-shrink-0">
            <img src={commanderArt} alt={commander?.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3">
              <div className="text-white font-bold text-sm truncate">{commander?.name}</div>
              {partner && <div className="text-gray-300 text-xs truncate">+ {partner.name}</div>}
            </div>
          </div>
        ) : (
          <div className="h-16 flex items-center px-4 border-b border-gray-800 flex-shrink-0">
            <span className="text-gray-400 text-sm">No commander selected</span>
          </div>
        )}

        {/* Commander setup */}
        <div className="p-3 border-b border-gray-800 space-y-2 flex-shrink-0">
          <CommanderSearch
            onSelect={setCommander}
            label="Commander"
            placeholder="Search commanders..."
          />
          <button
            onClick={() => setHasPartner((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {hasPartner ? "− Remove partner" : "+ Add partner commander"}
          </button>
          {hasPartner && (
            <CommanderSearch
              onSelect={setPartner}
              label="Partner"
              placeholder="Search partner..."
            />
          )}
        </div>

        {/* Card search */}
        <div className="p-3 border-b border-gray-800 flex-shrink-0">
          <CardSearch onAdd={addCard} />
        </div>

        {/* Import */}
        <div className="p-3 border-b border-gray-800 flex-shrink-0">
          <DeckImport onImport={handleImport} />
        </div>

        {/* Optimize button */}
        <div className="p-3 flex-shrink-0">
          <button
            onClick={runOptimizer}
            disabled={!commander || optimizeLoading}
            className="btn-primary w-full"
          >
            {optimizeLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                Optimizing...
              </span>
            ) : (
              "✨ Optimize Deck"
            )}
          </button>
          {!commander && (
            <p className="text-xs text-gray-600 text-center mt-1">Select a commander first</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900 px-4 flex-shrink-0">
          <button
            onClick={() => setTab("deck")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "deck" ? "border-yellow-500 text-yellow-400" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            Deck ({totalCards}/100)
          </button>
          <button
            onClick={() => setTab("suggestions")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "suggestions" ? "border-purple-500 text-purple-400" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            Suggestions {suggestions.length > 0 && <span className="ml-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">{suggestions.length}</span>}
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "deck" && (
            <div className="max-w-sm">
              <DeckList
                cards={cards}
                commander={commander}
                onRemove={removeCard}
              />
            </div>
          )}
          {tab === "suggestions" && (
            <SuggestionPanel
              suggestions={suggestions}
              deckScore={deckScore}
              onAddCard={addCard}
              onRemoveCard={removeCard}
              loading={optimizeLoading}
              commanderName={commander?.name ?? ""}
            />
          )}
        </div>
      </div>

      {/* Right panel — commander card preview */}
      {commander && (
        <aside className="w-52 border-l border-gray-800 bg-gray-900 p-3 flex flex-col gap-3 flex-shrink-0">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</div>
          <CardImage card={commander} size="normal" width={180} height={251} className="w-full" />
          {partner && (
            <CardImage card={partner} size="normal" width={180} height={251} className="w-full" />
          )}
          <a
            href={commander.scryfall_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline text-center"
          >
            View on Scryfall ↗
          </a>
        </aside>
      )}
    </div>
  );
}

export default function DeckPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <DeckPageInner />
    </Suspense>
  );
}
