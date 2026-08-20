"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ScryfallCard } from "@/types/mtg";
import { getCardImage } from "@/lib/scryfall";

type Phase = "starting" | "ready" | "processing" | "confirming" | "error";

interface ScanResult {
  card?: ScryfallCard;
  rawName?: string;
  candidates?: string[];
  error?: string;
}

interface Props {
  onAddCard: (card: ScryfallCard) => void;
  onClose: () => void;
}

export default function CardScanner({ onAddCard, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Start camera on mount
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) setPhase("ready");
      } catch {
        if (!cancelled) {
          setErrorMsg("Camera access denied. Please allow camera access in your browser settings and try again.");
          setPhase("error");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const retake = useCallback(() => {
    setResult(null);
    setErrorMsg("");
    setPhase("ready");
  }, []);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container || phase !== "ready") return;

    setPhase("processing");

    // Compute the displayed region of the video (object-fit: cover)
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const videoAspect = vW / vH;
    const containerAspect = cW / cH;

    let srcX = 0, srcY = 0, srcW = vW, srcH = vH;
    if (videoAspect > containerAspect) {
      srcW = vH * containerAspect;
      srcX = (vW - srcW) / 2;
    } else {
      srcH = vW / containerAspect;
      srcY = (vH - srcH) / 2;
    }

    // Card overlay in CSS coords (same as container coords)
    const cardW = Math.min(cW * 0.72, 280);
    const cardH = cardW / 0.714;
    const cardX = (cW - cardW) / 2;
    const cardY = (cH - cardH) / 2 - 40;

    // Name strip: top 15% of card
    const nameH = cardH * 0.15;

    // Map the name strip from CSS coords into video source coords
    const scaleX = srcW / cW;
    const scaleY = srcH / cH;
    const nsX = srcX + cardX * scaleX;
    const nsY = srcY + cardY * scaleY;
    const nsW = cardW * scaleX;
    const nsHv = nameH * scaleY;

    // Render to canvas at 3× for better OCR
    const targetW = Math.round(nsW * 3);
    const targetH = Math.round(nsHv * 3);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    ctx.filter = "contrast(1.5) brightness(1.05) saturate(0)";
    ctx.drawImage(video, nsX, nsY, nsW, nsHv, 0, 0, targetW, targetH);

    const imageData = canvas.toDataURL("image/jpeg", 0.92);

    try {
      const res = await fetch("/api/scan-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
      });
      const data = await res.json() as ScanResult;
      setResult(data);
      setPhase(data.card ? "confirming" : "error");
      if (!data.card && !data.candidates?.length) {
        setErrorMsg(data.error ?? "Could not identify card. Try again with better lighting.");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setPhase("error");
    }
  }, [phase]);

  const confirmCard = useCallback(() => {
    if (!result?.card) return;
    onAddCard(result.card);
    onClose();
  }, [result, onAddCard, onClose]);

  const confirmCandidate = useCallback(async (name: string) => {
    setPhase("processing");
    try {
      const res = await fetch(`/api/scryfall/card?name=${encodeURIComponent(name)}`);
      const card = await res.json() as ScryfallCard;
      if (card.id) {
        setResult({ card });
        setPhase("confirming");
      } else {
        setErrorMsg(`Could not load "${name}"`);
        setPhase("error");
      }
    } catch {
      setErrorMsg("Failed to load card data.");
      setPhase("error");
    }
  }, []);

  // Card overlay dimensions (computed from viewport)
  const cardW = typeof window !== "undefined" ? Math.min(window.innerWidth * 0.72, 280) : 260;
  const cardH = cardW / 0.714;
  const nameStripH = cardH * 0.15;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera view */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay: darken everything outside the card box */}
        {(phase === "ready" || phase === "processing") && (
          <div className="absolute inset-0 pointer-events-none">
            {/* The card box "hole" via box-shadow */}
            <div
              className="absolute rounded-lg"
              style={{
                width: cardW,
                height: cardH,
                left: `calc(50% - ${cardW / 2}px)`,
                top: `calc(50% - ${cardH / 2}px - 40px)`,
                boxShadow: "0 0 0 2000px rgba(0,0,0,0.62)",
                border: "2px solid rgba(234,179,8,0.7)",
              }}
            >
              {/* Amber name-strip highlight */}
              <div
                className="absolute top-0 left-0 right-0 rounded-t-lg"
                style={{
                  height: nameStripH,
                  background: "rgba(234,179,8,0.28)",
                  borderBottom: "1.5px solid rgba(234,179,8,0.8)",
                }}
              />
            </div>

            {/* Instruction label */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center"
              style={{ top: `calc(50% - ${cardH / 2}px - 40px - 36px)` }}
            >
              <span className="text-yellow-400 text-xs font-medium bg-black/50 px-2 py-1 rounded-full">
                Align the card name with the amber bar
              </span>
            </div>
          </div>
        )}

        {/* Starting spinner */}
        {phase === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-300 text-sm">Starting camera…</span>
          </div>
        )}

        {/* Processing overlay */}
        {phase === "processing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
            <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-medium">Reading card name…</span>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="flex-shrink-0 bg-gray-950 border-t border-gray-800 pb-[env(safe-area-inset-bottom)]">

        {/* READY — capture button */}
        {phase === "ready" && (
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={onClose} className="text-gray-400 hover:text-white text-sm transition-colors px-2 py-1">
              Cancel
            </button>
            <button
              onClick={capture}
              aria-label="Capture card"
              className="w-16 h-16 rounded-full bg-yellow-500 hover:bg-yellow-400 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-yellow-900/40"
            >
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-900">
                <circle cx="12" cy="12" r="5" />
                <path d="M2 10a2 2 0 0 1 2-2h1l1.5-2h7L15 8h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
              </svg>
            </button>
            <div className="w-14" />  {/* spacer for centering */}
          </div>
        )}

        {/* CONFIRMING — show detected card */}
        {phase === "confirming" && result?.card && (
          <div className="flex items-center gap-3 px-4 py-4">
            {getCardImage(result.card, "small") && (
              <img
                src={getCardImage(result.card, "small")}
                alt={result.card.name}
                className="w-14 rounded-lg flex-shrink-0 shadow-md"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold truncate">{result.card.name}</div>
              <div className="text-gray-400 text-xs truncate">{result.card.type_line}</div>
              {result.card.mana_cost && (
                <div className="text-gray-500 text-xs mt-0.5">{result.card.mana_cost}</div>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={confirmCard}
                className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-semibold text-sm px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                + Add to Deck
              </button>
              <button
                onClick={retake}
                className="text-gray-400 hover:text-white text-xs text-center transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ERROR — candidates or plain error */}
        {phase === "error" && (
          <div className="px-4 py-4">
            {result?.candidates?.length ? (
              <>
                <div className="text-gray-400 text-xs mb-2">
                  OCR read <span className="text-yellow-400">&ldquo;{result.rawName}&rdquo;</span> — did you mean:
                </div>
                <div className="flex flex-col gap-1 mb-3">
                  {result.candidates.map((name) => (
                    <button
                      key={name}
                      onClick={() => confirmCandidate(name)}
                      className="text-left text-sm text-white bg-gray-800 hover:bg-gray-700 active:bg-gray-600 px-3 py-2 rounded-lg transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-300 text-sm mb-3">{errorMsg}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={retake}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white font-medium text-sm py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* STARTING/PROCESSING with cancel */}
        {(phase === "starting" || phase === "processing") && (
          <div className="px-4 py-3 flex justify-center">
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
