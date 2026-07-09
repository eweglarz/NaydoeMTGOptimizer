"use client";

import { ScryfallCard } from "@/types/mtg";
import { getCardImage, getCardPrice } from "@/lib/scryfall";
import { useState, useRef } from "react";
import Image from "next/image";

interface Props {
  card: ScryfallCard;
  children: React.ReactNode;
  side?: "left" | "right";
}

export default function CardTooltip({ card, children, side }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<"left" | "right">("right");
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (side) {
      setPos(side);
    } else if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      setPos(spaceRight >= 290 || spaceRight >= spaceLeft ? "right" : "left");
    }
    setShow(true);
  };

  const src = getCardImage(card, "normal");
  const price = getCardPrice(card);

  return (
    <div
      ref={ref}
      className="relative block w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 ${pos === "right" ? "left-full ml-2" : "right-full mr-2"} top-0 pointer-events-none`}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-2 w-[270px]">
            {src && (
              <Image
                src={src}
                alt={card.name}
                width={260}
                height={363}
                className="rounded-lg w-full"
                unoptimized
              />
            )}
            <div className="mt-2 text-xs space-y-1">
              <div className="font-semibold text-white">{card.name}</div>
              <div className="text-gray-400">{card.type_line}</div>
              {card.oracle_text && (
                <div className="text-gray-300 leading-relaxed">{card.oracle_text}</div>
              )}
              {price !== null && (
                <div className="text-yellow-400 font-medium">${price.toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
