"use client";

import { ScryfallCard } from "@/types/mtg";
import { getCardImage, getCardPrice } from "@/lib/scryfall";
import { useState, useRef } from "react";
import Image from "next/image";

interface Props {
  card: ScryfallCard;
  children: React.ReactNode;
  side?: "left" | "right";
  /** For MDFC/DFC cards: 0 = front face, 1 = back face */
  faceIdx?: number;
}

export default function CardTooltip({ card, children, side, faceIdx = 0 }: Props) {
  const [show, setShow] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);

  const isMdfc = (card.card_faces?.length ?? 0) >= 2 && card.card_faces?.[1]?.image_uris != null;
  const face = isMdfc ? card.card_faces![faceIdx] : null;

  const handleMouseEnter = () => {
    if (!ref.current) { setShow(true); return; }
    const rect = ref.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    const useRight = side === "right" || (side !== "left" && (spaceRight >= 290 || spaceRight >= spaceLeft));
    setStyle({
      position: "fixed",
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 420)),
      ...(useRight ? { left: rect.right + 8 } : { right: window.innerWidth - rect.left + 8 }),
      zIndex: 9999,
      pointerEvents: "none",
    });
    setShow(true);
  };

  const src = isMdfc
    ? (face?.image_uris?.normal ?? getCardImage(card, "normal"))
    : getCardImage(card, "normal");

  const displayName = isMdfc ? (face?.name ?? card.name) : card.name;
  const displayType = isMdfc ? (face?.type_line ?? card.type_line) : card.type_line;
  const displayText = isMdfc ? face?.oracle_text : card.oracle_text;
  const price = getCardPrice(card);

  return (
    <div ref={ref} className="relative block w-full" onMouseEnter={handleMouseEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={style}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-2 w-[270px]">
            {src && (
              <Image src={src} alt={displayName} width={260} height={363} className="rounded-lg w-full" unoptimized />
            )}
            <div className="mt-2 text-xs space-y-1">
              <div className="font-semibold text-white">{displayName}</div>
              <div className="text-gray-400">{displayType}</div>
              {displayText && <div className="text-gray-300 leading-relaxed">{displayText}</div>}
              {price !== null && <div className="text-yellow-400 font-medium">${price.toFixed(2)}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
