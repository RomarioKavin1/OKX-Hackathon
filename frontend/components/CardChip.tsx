"use client";

/**
 * CardChip.tsx — draggable/keyboard-focusable card tile used in the lineup builder.
 *
 * Accessibility: each card is focusable (tabIndex=0), has a descriptive aria-label,
 * and supports keyboard "select" via Enter/Space.  The parent drives selection state
 * (selectedCardId + onSelect callback).
 */

import type { KeyboardEvent } from "react";
import type { Tier } from "@/lib/types";
import { TIER_NAME } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface CardChipData {
  tokenId: string;
  playerId: string;
  playerName: string;
  nation: string;
  position: string; // "GK" | "DEF" | "MID" | "FWD"
  tier: Tier;
  stamina: number; // 0–100
  traits: string[];
  isOop?: boolean; // out-of-position flag (shown in slot, not in the bench tile)
}

export interface CardChipProps {
  card: CardChipData;
  /** Whether this card is the currently keyboard-selected card (Enter → slot selection mode). */
  isSelected: boolean;
  /** Whether this card is the captain. */
  isCaptain?: boolean;
  /** Whether this card is the vice-captain. */
  isVice?: boolean;
  /** Called when the card is clicked or activated via keyboard. */
  onSelect: (tokenId: string) => void;
  /** HTML5 DnD: drag start handler (from parent). */
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, tokenId: string) => void;
  /** Compact mode: used in slots (hides full detail). */
  compact?: boolean;
  /** Whether the card is already placed in a slot (visually dimmed in bench). */
  placed?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function staminaLabel(s: number): "Fresh" | "Normal" | "Fatigued" {
  if (s > 70) return "Fresh";
  if (s < 30) return "Fatigued";
  return "Normal";
}

// Color-blind-safe: pair each state with distinct label + shape (not just hue).
function staminaStyle(label: "Fresh" | "Normal" | "Fatigued"): string {
  if (label === "Fresh") return "bg-emerald-100 text-emerald-800 border border-emerald-300";
  if (label === "Fatigued") return "bg-orange-100 text-orange-800 border border-orange-300";
  return "bg-zinc-100 text-zinc-600 border border-zinc-300";
}

function staminaIcon(label: "Fresh" | "Normal" | "Fatigued"): string {
  if (label === "Fresh") return "▲"; // up arrow
  if (label === "Fatigued") return "▼"; // down arrow
  return "●";
}

const TIER_COLOR: Record<Tier, string> = {
  0: "border-zinc-400 bg-zinc-50",      // Common
  1: "border-blue-400 bg-blue-50",      // Rare
  2: "border-violet-400 bg-violet-50",  // SuperRare
  3: "border-amber-400 bg-amber-50",    // Unique
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CardChip({
  card,
  isSelected,
  isCaptain,
  isVice,
  onSelect,
  onDragStart,
  compact = false,
  placed = false,
}: CardChipProps) {
  const sl = staminaLabel(card.stamina);
  const tierBorder = TIER_COLOR[card.tier as keyof typeof TIER_COLOR] ?? TIER_COLOR[0];
  const isActive = isSelected;

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(card.tokenId);
    }
  }

  const label = `${card.playerName} (${card.position}, ${TIER_NAME[card.tier]}, ${card.nation}), stamina ${sl}${isCaptain ? ", Captain" : ""}${isVice ? ", Vice-captain" : ""}`;

  if (compact) {
    // Compact slot view — just show name + badges
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={isActive}
        draggable
        onDragStart={onDragStart ? (e) => onDragStart(e, card.tokenId) : undefined}
        onClick={() => onSelect(card.tokenId)}
        onKeyDown={handleKey}
        className={[
          "flex items-center gap-1 rounded px-1 py-0.5 text-xs border cursor-pointer",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900",
          tierBorder,
          isActive ? "ring-2 ring-zinc-900" : "",
          placed ? "opacity-50" : "",
        ].join(" ")}
      >
        <span className="font-medium truncate max-w-[80px]">{card.playerName}</span>
        {isCaptain && <span className="ml-0.5 font-bold text-amber-700 text-xs" aria-hidden>C</span>}
        {isVice && <span className="ml-0.5 font-bold text-zinc-500 text-xs" aria-hidden>V</span>}
        <span className={`ml-auto rounded px-0.5 text-[10px] ${staminaStyle(sl)}`} aria-hidden>
          {staminaIcon(sl)}
        </span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isActive}
      draggable
      onDragStart={onDragStart ? (e) => onDragStart(e, card.tokenId) : undefined}
      onClick={() => onSelect(card.tokenId)}
      onKeyDown={handleKey}
      className={[
        "relative flex flex-col gap-1 rounded border-2 p-2 cursor-pointer select-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
        tierBorder,
        isActive ? "ring-2 ring-zinc-900 shadow-md" : "hover:shadow-sm",
        placed ? "opacity-40" : "",
      ].join(" ")}
    >
      {/* Position + nation row */}
      <div className="flex items-center justify-between">
        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-bold text-white">
          {card.position}
        </span>
        <span className="text-[10px] text-zinc-500">{card.nation}</span>
      </div>

      {/* Name */}
      <p className="text-xs font-semibold leading-tight text-zinc-800 truncate">
        {card.playerName}
        {isCaptain && <span className="ml-1 text-amber-600 font-bold" aria-label="Captain"> (C)</span>}
        {isVice && <span className="ml-1 text-zinc-500 font-bold" aria-label="Vice-captain"> (V)</span>}
      </p>

      {/* Tier badge */}
      <p className="text-[10px] text-zinc-400">{TIER_NAME[card.tier]}</p>

      {/* Stamina badge — color-blind-safe: icon + text + color */}
      <div
        className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] w-fit ${staminaStyle(sl)}`}
        aria-label={`Stamina: ${sl}`}
      >
        <span aria-hidden>{staminaIcon(sl)}</span>
        <span>{sl}</span>
      </div>

      {/* Traits */}
      {card.traits.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {card.traits.map((t) => (
            <span key={t} className="rounded bg-zinc-100 px-1 text-[9px] text-zinc-600 border border-zinc-200">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Selected highlight */}
      {isActive && (
        <span
          className="absolute top-0.5 right-0.5 rounded-full bg-zinc-900 text-white text-[9px] w-4 h-4 flex items-center justify-center"
          aria-hidden
        >
          ✓
        </span>
      )}
    </div>
  );
}
