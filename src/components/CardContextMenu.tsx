"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScryfallCard } from "@/types/mtg";

interface Props {
  card: ScryfallCard;
  x: number;
  y: number;
  onClose: () => void;
  onChangePrinting: (newCard: ScryfallCard) => void;
  onAddToWishlist: () => void;
  onMoveToPondering?: () => void;
}

interface PrintingResult {
  id: string;
  set: string;
  set_name: string;
  prices?: { usd?: string | null };
}

export default function CardContextMenu({
  card, x, y, onClose, onChangePrinting, onAddToWishlist, onMoveToPondering,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showPrintings, setShowPrintings] = useState(false);
  const [printings, setPrintings] = useState<ScryfallCard[]>([]);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [wishlistDone, setWishlistDone] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  const togglePrintings = () => {
    if (showPrintings) { setShowPrintings(false); return; }
    setShowPrintings(true);
    if (printings.length > 0 || loadingPrintings) return;
    setLoadingPrintings(true);
    fetch(
      `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(card.name)}" game:paper&unique=prints&order=released`,
      { headers: { "User-Agent": "NaydoeMTGOptimizer/1.0" } }
    )
      .then((r) => r.json())
      .then((data: { data?: ScryfallCard[] }) => setPrintings(data.data ?? []))
      .catch(() => setPrintings([]))
      .finally(() => setLoadingPrintings(false));
  };

  const W = 224;
  const estimatedH = showPrintings ? 420 : 200;
  const safeX = Math.min(x, window.innerWidth - W - 8);
  const safeY = Math.min(y, window.innerHeight - estimatedH - 8);

  const tcgUrl = card.purchase_uris?.tcgplayer
    ?? `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`;

  const menu = (
    <div
      ref={ref}
      style={{ position: "fixed", left: safeX, top: safeY, zIndex: 9999, width: W }}
      className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 text-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-400 truncate font-medium">
        {card.name}
      </div>

      {/* Change Printing */}
      <button
        onClick={togglePrintings}
        className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center justify-between transition-colors text-gray-200"
      >
        <span>🖼 Change Printing</span>
        <span className="text-gray-600 text-[10px]">{showPrintings ? "▲" : "▼"}</span>
      </button>

      {showPrintings && (
        <div className="border-y border-gray-800 max-h-52 overflow-y-auto bg-gray-950">
          {loadingPrintings ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
              <span className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
              Loading printings...
            </div>
          ) : printings.length === 0 ? (
            <p className="text-xs text-gray-500 px-3 py-2">No printings found.</p>
          ) : (
            printings.map((p) => {
              const raw = (p as unknown as PrintingResult).prices?.usd;
              const price = raw ? parseFloat(raw) : null;
              const isCurrent = p.id === card.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { onChangePrinting(p); onClose(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-gray-800 transition-colors flex items-center gap-2 ${isCurrent ? "bg-gray-800/60" : ""}`}
                >
                  <span className="text-[10px] text-gray-500 font-mono w-8 flex-shrink-0 uppercase">
                    {(p as unknown as PrintingResult).set}
                  </span>
                  <span className="text-xs text-gray-300 flex-1 truncate min-w-0">
                    {(p as unknown as PrintingResult).set_name}
                  </span>
                  <span className={`text-[11px] flex-shrink-0 ${
                    price === null ? "text-gray-600"
                    : price < 5 ? "text-green-400"
                    : price < 20 ? "text-blue-400"
                    : "text-orange-400"
                  }`}>
                    {price !== null ? `$${price.toFixed(2)}` : "—"}
                  </span>
                  {isCurrent && (
                    <span className="text-yellow-400 text-[10px] flex-shrink-0">✓</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Buy */}
      <div className="border-t border-gray-800 pt-0.5">
        <a
          href={tcgUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="block px-3 py-2 hover:bg-gray-800 transition-colors text-gray-200"
        >
          🛒 Buy on TCGPlayer
        </a>
      </div>

      {/* Wishlist + Pondering */}
      <div className="border-t border-gray-800 pt-0.5">
        <button
          onClick={() => {
            if (wishlistDone) return;
            onAddToWishlist();
            setWishlistDone(true);
            setTimeout(onClose, 900);
          }}
          className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
        >
          {wishlistDone
            ? <span className="text-green-400">✓ Added to Wishlist</span>
            : <span className="text-gray-200">⭐ Add to Wishlist</span>
          }
        </button>

        {onMoveToPondering && (
          <button
            onClick={() => { onMoveToPondering(); onClose(); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors text-gray-200"
          >
            🤔 Move to Pondering
          </button>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(menu, document.body);
}
