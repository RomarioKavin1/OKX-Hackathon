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
import { cx, Pill } from "@/components/ui";

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
// Uses design tokens: ok/warn/danger.
function staminaTone(label: "Fresh" | "Normal" | "Fatigued"): "ok" | "warn" | "danger" {
  if (label === "Fresh") return "ok";
  if (label === "Fatigued") return "danger";
  return "warn";
}

function staminaIcon(label: "Fresh" | "Normal" | "Fatigued"): string {
  if (label === "Fresh") return "▲"; // up arrow
  if (label === "Fatigued") return "▼"; // down arrow
  return "●";
}

// Tier border — collectible rarity spine
const TIER_BORDER: Record<Tier, string> = {
  0: "border-line-2",          // Common
  1: "border-cobalt/55",       // Rare
  2: "border-violet/55",       // Super Rare
  3: "border-gold/70",         // Unique
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
  const tierBorder = TIER_BORDER[card.tier as keyof typeof TIER_BORDER] ?? TIER_BORDER[0];
  const isUnique = card.tier === 3;
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
        className={cx(
          "flex items-center gap-1 rounded-sm border-2 bg-paper-2 px-1.5 py-1 text-xs cursor-pointer select-none",
          "shadow-sticker transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out-expo)]",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt",
          isUnique && "foil-sheen",
          tierBorder,
          isActive ? "ring-2 ring-cobalt ring-offset-1 ring-offset-paper" : "hover:shadow-lift",
          placed ? "opacity-45 saturate-50" : "",
        )}
      >
        <span className="font-semibold truncate max-w-[80px] text-ink">{card.playerName}</span>
        {isCaptain && (
          <Pill tone="gold" className="ml-0.5 !px-1 !py-0">
            C
          </Pill>
        )}
        {isVice && (
          <Pill tone="cobalt" className="ml-0.5 !px-1 !py-0">
            V
          </Pill>
        )}
        <span aria-hidden className="ml-auto">
          <Pill tone={staminaTone(sl)} className="!px-1 !py-0">
            {staminaIcon(sl)}
          </Pill>
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
      className={cx(
        "relative flex flex-col gap-1.5 rounded-sm border-2 bg-paper-2 p-2 cursor-pointer select-none",
        "shadow-sticker transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out-expo)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
        isUnique && "foil-sheen",
        tierBorder,
        isActive
          ? "ring-2 ring-cobalt ring-offset-2 ring-offset-paper shadow-lift"
          : "hover:-translate-y-px hover:shadow-lift",
        placed ? "opacity-45 saturate-50" : "",
      )}
    >
      {/* Position + nation row */}
      <div className="flex items-center justify-between gap-1">
        <span className="rounded-xs bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-on-panel uppercase tracking-wide">
          {card.position}
        </span>
        <span className="text-[10px] text-muted truncate">{card.nation}</span>
      </div>

      {/* Name */}
      <p className="text-xs font-semibold leading-tight text-ink truncate">
        {card.playerName}
        {isCaptain && (
          <span className="ml-1 font-bold text-[color:var(--gold)]" aria-label="Captain"> (C)</span>
        )}
        {isVice && (
          <span className="ml-1 font-bold text-cobalt-ink" aria-label="Vice-captain"> (V)</span>
        )}
      </p>

      {/* Tier label */}
      <p className="text-[10px] text-muted font-medium">{TIER_NAME[card.tier]}</p>

      {/* Stamina badge — color-blind-safe: icon + text + token color */}
      <div aria-label={`Stamina: ${sl}`}>
        <Pill tone={staminaTone(sl)} className="gap-0.5">
          <span aria-hidden>{staminaIcon(sl)}</span>
          <span>{sl}</span>
        </Pill>
      </div>

      {/* Traits */}
      {card.traits.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {card.traits.map((t) => (
            <Pill key={t} tone="neutral" className="!text-[9px] !px-1">
              {t}
            </Pill>
          ))}
        </div>
      )}

      {/* Selected highlight */}
      {isActive && (
        <span
          className="absolute top-0.5 right-0.5 rounded-full bg-cobalt text-on-panel text-[9px] w-4 h-4 flex items-center justify-center shadow-sticker"
          aria-hidden
        >
          ✓
        </span>
      )}
    </div>
  );
}
