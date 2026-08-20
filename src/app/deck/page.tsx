"use client";

import { useState, useCallback, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ScryfallCard, OptimizationSuggestion } from "@/types/mtg";
import DeckList from "@/components/DeckList";
import CardSearch from "@/components/CardSearch";
import SuggestionPanel from "@/components/SuggestionPanel";
import BuyListPanel from "@/components/BuyListPanel";
import DeckImport from "@/components/DeckImport";
import CommanderSearch from "@/components/CommanderSearch";
import AuthModal from "@/components/AuthModal";
import CardScanner from "@/components/CardScanner";
import { useAuth } from "@/components/AuthProvider";
import { getCardImage } from "@/lib/scryfall";

interface DeckScore { score: number; label: string; details: string; }

interface SavedDeck {
  id: string;
  name: string;
  commanderName: string | null;
  partnerName: string | null;
  cardNames: string[];
  sideboardNames: string[];
  lookingToAdd: string[];
  updatedAt: string;
}

async function resolveNames(names: string[]): Promise<ScryfallCard[]> {
  if (!names.length) return [];
  const res = await fetch("/api/cards/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  const { cards } = await res.json() as { cards: ScryfallCard[] };
  return cards ?? [];
}

function DeckPageInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [commander, setCommander] = useState<ScryfallCard | null>(null);
  const [partner, setPartner] = useState<ScryfallCard | null>(null);
  const [cards, setCards] = useState<ScryfallCard[]>([]);
  const [sideboard, setSideboard] = useState<ScryfallCard[]>([]);
  const [lookingToAdd, setLookingToAdd] = useState<ScryfallCard[]>([]);
  const [pondering, setPondering] = useState<ScryfallCard[]>([]);
  const [wishlist, setWishlist] = useState<ScryfallCard[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mtg_wishlist") ?? "[]") as ScryfallCard[]; }
    catch { return []; }
  });
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [deckScore, setDeckScore] = useState<DeckScore | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [tab, setTab] = useState<"deck" | "suggestions" | "buy">("deck");
  const [hasPartner, setHasPartner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [deckName, setDeckName] = useState("Untitled Deck");
  const [savedDeckId, setSavedDeckId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [myDecks, setMyDecks] = useState<SavedDeck[]>([]);
  const [showDecks, setShowDecks] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const decksPanelRef = useRef<HTMLDivElement>(null);

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
      const result = JSON.parse(raw) as { commanders: ScryfallCard[]; cards: ScryfallCard[]; sideboard?: ScryfallCard[] };
      if (result.commanders[0]) setCommander(result.commanders[0]);
      if (result.commanders[1]) { setPartner(result.commanders[1]); setHasPartner(true); }
      setCards(result.cards);
      if (result.sideboard?.length) setSideboard(result.sideboard);
      setTab("deck");
    } catch {}
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (decksPanelRef.current && !decksPanelRef.current.contains(e.target as Node)) {
        setShowDecks(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!showDecks || !user) return;
    setLoadingDecks(true);
    fetch("/api/decks")
      .then((r) => r.json())
      .then(({ decks }) => setMyDecks(decks ?? []))
      .catch(() => {})
      .finally(() => setLoadingDecks(false));
  }, [showDecks, user]);

  const addCard = useCallback((card: ScryfallCard) => {
    setCards((prev) => prev.find((c) => c.id === card.id) ? prev : [...prev, card]);
  }, []);

  const removeCard = useCallback((card: ScryfallCard) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  const addToLookingToAdd = useCallback((card: ScryfallCard) => {
    setLookingToAdd((prev) => prev.find((c) => c.id === card.id) ? prev : [...prev, card]);
  }, []);

  const removeFromLookingToAdd = useCallback((card: ScryfallCard) => {
    setLookingToAdd((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  const moveToDeck = useCallback((card: ScryfallCard) => {
    addCard(card);
    removeFromLookingToAdd(card);
  }, [addCard, removeFromLookingToAdd]);

  // Persist wishlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("mtg_wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  const addToWishlist = useCallback((card: ScryfallCard) => {
    setWishlist((prev) => prev.find((c) => c.id === card.id) ? prev : [...prev, card]);
  }, []);

  const moveToPondering = useCallback((card: ScryfallCard) => {
    removeCard(card);
    setPondering((prev) => prev.find((c) => c.id === card.id) ? prev : [...prev, card]);
  }, [removeCard]);

  const removeFromPondering = useCallback((card: ScryfallCard) => {
    setPondering((prev) => prev.filter((c) => c.id !== card.id));
  }, []);

  const movePonderingToDeck = useCallback((card: ScryfallCard) => {
    addCard(card);
    removeFromPondering(card);
  }, [addCard, removeFromPondering]);

  const changePrinting = useCallback((oldCard: ScryfallCard, newCard: ScryfallCard) => {
    setCards((prev) => prev.map((c) => c.id === oldCard.id ? newCard : c));
    if (commander?.id === oldCard.id) setCommander(newCard);
    if (partner?.id === oldCard.id) setPartner(newCard);
  }, [commander, partner]);

  const handleImport = ({ commanders, cards: imported, sideboard: sb }: {
    commanders: ScryfallCard[]; cards: ScryfallCard[]; sideboard?: ScryfallCard[];
  }) => {
    if (commanders[0]) { setCommander(commanders[0]); setDeckName(`${commanders[0].name} Deck`); }
    if (commanders[1]) { setPartner(commanders[1]); setHasPartner(true); }
    setCards(imported);
    setSideboard(sb ?? []);
    setLookingToAdd([]);
    setSavedDeckId(null);
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
        body: JSON.stringify({ commanderName: commander.name, deckCardNames: cards.map((c) => c.name) }),
      });
      const data = await res.json() as { suggestions: OptimizationSuggestion[]; deckScore: DeckScore };
      setSuggestions(data.suggestions ?? []);
      setDeckScore(data.deckScore ?? null);
    } finally {
      setOptimizeLoading(false);
    }
  };

  const saveDeck = async () => {
    if (!user) { setShowAuthModal(true); return; }
    setSaving(true);
    setSaveMsg("");
    try {
      const body = {
        name: deckName,
        commanderName: commander?.name ?? null,
        partnerName: partner?.name ?? null,
        cardNames: cards.map((c) => c.name),
        sideboardNames: sideboard.map((c) => c.name),
        lookingToAdd: lookingToAdd.map((c) => c.name),
      };
      if (savedDeckId) {
        await fetch(`/api/decks/${savedDeckId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        const res = await fetch("/api/decks", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const { deck } = await res.json() as { deck: SavedDeck };
        setSavedDeckId(deck.id);
      }
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const loadDeck = async (deck: SavedDeck) => {
    setShowDecks(false);
    const allNames = [
      ...(deck.commanderName ? [deck.commanderName] : []),
      ...(deck.partnerName ? [deck.partnerName] : []),
      ...deck.cardNames, ...deck.sideboardNames, ...deck.lookingToAdd,
    ];
    const resolved = await resolveNames(allNames);
    const byName = new Map(resolved.map((c) => [c.name.toLowerCase(), c]));
    setCommander(deck.commanderName ? (byName.get(deck.commanderName.toLowerCase()) ?? null) : null);
    setPartner(deck.partnerName ? (byName.get(deck.partnerName.toLowerCase()) ?? null) : null);
    setHasPartner(!!deck.partnerName);
    setCards(deck.cardNames.map((n) => byName.get(n.toLowerCase())).filter((c): c is ScryfallCard => !!c));
    setSideboard(deck.sideboardNames.map((n) => byName.get(n.toLowerCase())).filter((c): c is ScryfallCard => !!c));
    setLookingToAdd(deck.lookingToAdd.map((n) => byName.get(n.toLowerCase())).filter((c): c is ScryfallCard => !!c));
    setDeckName(deck.name);
    setSavedDeckId(deck.id);
    setSuggestions([]);
    setDeckScore(null);
    setTab("deck");
  };

  const deleteSavedDeck = async (id: string) => {
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    setMyDecks((prev) => prev.filter((d) => d.id !== id));
    if (savedDeckId === id) setSavedDeckId(null);
  };

  const commanderArt = commander ? getCardImage(commander, "art_crop") : null;
  const totalCards = cards.length + (commander ? 1 : 0) + (partner ? 1 : 0);

  return (
    <div className="flex h-[calc(100dvh-57px)] relative overflow-hidden">
      {/* Mobile backdrop — covers content area below header, closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className="fixed top-[57px] inset-x-0 bottom-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={[
        "w-72 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden flex-shrink-0",
        // Mobile: fixed slide-over below the header
        "fixed top-[57px] bottom-0 left-0 z-50 transition-transform duration-300 ease-in-out",
        // Desktop: back in the normal flex flow, no transition
        "md:relative md:top-auto md:bottom-auto md:left-auto md:z-auto md:translate-x-0 md:transition-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>
        {/* Close button — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden absolute top-2 right-2 z-10 text-gray-400 hover:text-white p-1.5 rounded-lg bg-gray-800/80 text-xs leading-none"
          aria-label="Close sidebar"
        >
          ✕
        </button>

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

        <div className="p-3 border-b border-gray-800 space-y-2 flex-shrink-0">
          <CommanderSearch onSelect={setCommander} label="Commander" placeholder="Search commanders..." />
          <button onClick={() => setHasPartner((v) => !v)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {hasPartner ? "− Remove partner" : "+ Add partner commander"}
          </button>
          {hasPartner && <CommanderSearch onSelect={setPartner} label="Partner" placeholder="Search partner..." />}
        </div>

        <div className="p-3 border-b border-gray-800 flex-shrink-0">
          <CardSearch onAdd={addCard} />
        </div>

        <div className="p-3 border-b border-gray-800 flex-shrink-0">
          <DeckImport onImport={handleImport} />
        </div>

        <div className="p-3 flex-shrink-0">
          <button onClick={runOptimizer} disabled={!commander || optimizeLoading} className="btn-primary w-full">
            {optimizeLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                Optimizing...
              </span>
            ) : "✨ Optimize Deck"}
          </button>
          {!commander && <p className="text-xs text-gray-600 text-center mt-1">Select a commander first</p>}
        </div>

        {/* Save / My Decks */}
        <div className="p-3 border-t border-gray-800 space-y-2 mt-auto flex-shrink-0">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Deck name..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={saveDeck}
              disabled={saving}
              className="flex-1 text-sm bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-medium py-1.5 rounded-lg transition-colors"
            >
              {saving ? "Saving..." : savedDeckId ? "💾 Update" : "💾 Save Deck"}
            </button>
            <div ref={decksPanelRef} className="relative">
              <button
                onClick={() => { if (!user) { setShowAuthModal(true); return; } setShowDecks((v) => !v); }}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-1.5 px-3 rounded-lg transition-colors"
              >
                📂
              </button>
              {showDecks && user && (
                <div className="absolute bottom-full mb-2 right-0 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-2 max-h-80 overflow-y-auto">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1 mb-1">My Saved Decks</div>
                  {loadingDecks ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-xs text-gray-500">
                      <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  ) : myDecks.length === 0 ? (
                    <p className="text-xs text-gray-500 px-2 py-3">No saved decks yet.</p>
                  ) : (
                    <div className="space-y-0.5">
                      {myDecks.map((d) => (
                        <div key={d.id} className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-gray-800 group transition-colors">
                          <button onClick={() => loadDeck(d)} className="flex-1 text-left min-w-0">
                            <div className={`text-sm truncate ${d.id === savedDeckId ? "text-yellow-400" : "text-white"}`}>{d.name}</div>
                            <div className="text-xs text-gray-500 truncate">{d.commanderName ?? "No commander"} · {d.cardNames.length} cards</div>
                          </button>
                          <button
                            onClick={() => deleteSavedDeck(d.id)}
                            className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {saveMsg && (
            <p className={`text-xs text-center ${saveMsg === "Saved!" ? "text-green-400" : "text-red-400"}`}>{saveMsg}</p>
          )}
          {!user && (
            <p className="text-xs text-gray-600 text-center">
              <button onClick={() => setShowAuthModal(true)} className="text-yellow-500 hover:underline">Sign in</button> to save decks
            </p>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex border-b border-gray-800 bg-gray-900 px-4 flex-shrink-0 items-center">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden mr-2 text-gray-400 hover:text-white active:text-white py-3 px-1 flex-shrink-0 transition-colors"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <rect y="2" width="18" height="2" rx="1"/>
              <rect y="8" width="18" height="2" rx="1"/>
              <rect y="14" width="18" height="2" rx="1"/>
            </svg>
          </button>
          {/* Scan card button — mobile always visible, desktop hover */}
          <button
            onClick={() => setScannerOpen(true)}
            className="mr-2 text-gray-400 hover:text-yellow-400 active:text-yellow-400 py-3 px-1 flex-shrink-0 transition-colors"
            aria-label="Scan a card"
            title="Scan card with camera"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <circle cx="17.5" cy="17.5" r="3.5" />
              <path d="M21 21l-1.5-1.5" />
            </svg>
          </button>
          <button
            onClick={() => setTab("deck")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "deck" ? "border-yellow-500 text-yellow-400" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            Deck ({totalCards}/100)
            {lookingToAdd.length > 0 && (
              <span className="ml-1.5 text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded-full">★ {lookingToAdd.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("suggestions")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "suggestions" ? "border-purple-500 text-purple-400" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            Suggestions {suggestions.length > 0 && <span className="ml-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">{suggestions.length}</span>}
          </button>
          <button
            onClick={() => setTab("buy")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "buy" ? "border-emerald-500 text-emerald-400" : "border-transparent text-gray-400 hover:text-white"}`}
          >
            Buy Cards
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "deck" && (
            <>
              <DeckList
                cards={cards}
                commander={commander}
                partner={partner}
                onRemove={removeCard}
                lookingToAdd={lookingToAdd}
                onRemoveFromLookingToAdd={removeFromLookingToAdd}
                onMoveToDeck={moveToDeck}
                onChangePrinting={changePrinting}
                onMoveToPondering={moveToPondering}
                onAddToWishlist={addToWishlist}
                pondering={pondering}
                onRemoveFromPondering={removeFromPondering}
                onMovePonderingToDeck={movePonderingToDeck}
              />
              {sideboard.length > 0 && (
                <div className="mt-4 card-panel border border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Sideboard <span className="text-gray-600 font-normal normal-case">({sideboard.length})</span>
                    </span>
                    <button onClick={() => setSideboard([])} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Clear</button>
                  </div>
                  <div className="space-y-0.5">
                    {sideboard.map((card, i) => (
                      <div key={`${card.id}-${i}`} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-800 group transition-colors">
                        <span className="text-sm flex-1 truncate text-gray-400">{card.name}</span>
                        <button
                          title="Move to deck"
                          onClick={() => { addCard(card); setSideboard((prev) => prev.filter((_, idx) => idx !== i)); }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-green-700 text-gray-300 hover:text-white transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          → Deck
                        </button>
                        <button
                          onClick={() => setSideboard((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "suggestions" && (
            <SuggestionPanel
              suggestions={suggestions}
              onAddCard={addCard}
              onRemoveCard={removeCard}
              onAddToLookingToAdd={addToLookingToAdd}
              loading={optimizeLoading}
              commanderName={commander?.name ?? ""}
            />
          )}
          {tab === "buy" && (
            <div className="max-w-sm">
              <BuyListPanel cards={cards} commander={commander} />
            </div>
          )}
        </div>
      </div>

      {scannerOpen && (
        <CardScanner
          onAddCard={(card) => { addCard(card); }}
          onClose={() => setScannerOpen(false)}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
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
