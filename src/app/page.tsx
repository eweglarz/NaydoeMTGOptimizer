"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CommanderSearch from "@/components/CommanderSearch";
import DeckImport from "@/components/DeckImport";
import { ScryfallCard } from "@/types/mtg";
import CardImage from "@/components/CardImage";

const FEATURED_COMMANDERS = [
  "Atraxa, Praetors' Voice",
  "Kenrith, the Returned King",
  "The Ur-Dragon",
  "Edgar Markov",
  "Muldrotha, the Gravetide",
  "Yuriko, the Tiger's Shadow",
];

export default function HomePage() {
  const router = useRouter();
  const [selectedCommander, setSelectedCommander] = useState<ScryfallCard | null>(null);

  const handleCommanderSelect = (card: ScryfallCard) => {
    setSelectedCommander(card);
    router.push(`/deck?commander=${encodeURIComponent(card.name)}`);
  };

  const handleImport = (result: { commanders: ScryfallCard[]; cards: ScryfallCard[] }) => {
    sessionStorage.setItem("pendingImport", JSON.stringify(result));
    router.push("/deck");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-57px)] p-6">
      <div className="w-full max-w-xl space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">MTG Deck Optimizer</h1>
          <p className="text-gray-400 text-lg">
            Build and optimize your Commander deck with EDHREC synergy data
          </p>
        </div>

        {/* Commander search */}
        <div className="card-panel space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Start with a Commander</h2>
          <CommanderSearch
            onSelect={handleCommanderSelect}
            placeholder="Search for any legendary creature..."
            label=""
          />
          <div className="flex flex-wrap gap-2">
            {FEATURED_COMMANDERS.map((name) => (
              <button
                key={name}
                onClick={() => router.push(`/deck?commander=${encodeURIComponent(name)}`)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="flex-1 border-t border-gray-800" />
          <span className="text-gray-600 text-sm">or</span>
          <div className="flex-1 border-t border-gray-800" />
        </div>

        {/* Import */}
        <DeckImport onImport={handleImport} />

      </div>
    </div>
  );
}
