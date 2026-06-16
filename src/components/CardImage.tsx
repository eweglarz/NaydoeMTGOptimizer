"use client";

import { ScryfallCard } from "@/types/mtg";
import { getCardImage } from "@/lib/scryfall";
import { useState } from "react";
import Image from "next/image";

interface Props {
  card: ScryfallCard;
  size?: "small" | "normal" | "large" | "art_crop";
  className?: string;
  width?: number;
  height?: number;
}

export default function CardImage({ card, size = "normal", className = "", width = 200, height = 279 }: Props) {
  const [error, setError] = useState(false);
  const src = getCardImage(card, size);

  if (!src || error) {
    return (
      <div
        className={`bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-gray-500 text-xs text-center p-2 ${className}`}
        style={{ width, height }}
      >
        {card.name}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={card.name}
      width={width}
      height={height}
      className={`rounded-lg object-cover ${className}`}
      onError={() => setError(true)}
      unoptimized
    />
  );
}
