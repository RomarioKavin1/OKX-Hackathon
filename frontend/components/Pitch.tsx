"use client";

/**
 * Pitch.tsx — Formation slot grid displayed as a football pitch visual.
 *
 * Each slot is:
 *  - A valid HTML5 DnD drop target (dragover/drop)
 *  - Keyboard-accessible: tabIndex=0, activatable with Enter/Space to receive
 *    the currently "selected" card from the builder's keyboard flow.
 *  - Has aria-label describing position + occupant name (if any).
 *  - Shows OOP (out-of-position) slots in a color-blind-safe way: orange border
 *    + "OOP" label icon (not just color alone, per §8.5).
 */

import type { KeyboardEvent } from "react";
import type { Position } from "@/lib/types";
import type { CardChipData } from "./CardChip";
import { CardChip } from "./CardChip";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotState {
  position: Position;
  card: CardChipData | null;
  /** Out-of-position: card's natural position != this slot's position. */
  isOop: boolean;
  staminaBand: "Fresh" | "Normal" | "Fatigued";
  formationMult: number;
  traitHints: string[];
}

export interface PitchProps {
  slots: SlotState[];        // length 11
  captainIdx: number;
  viceIdx: number;
  /** The tokenId the user has currently "keyboard-selected" for placement. */
  pendingCardId: string | null;
  onDropCard: (slotIndex: number, tokenId: string) => void;
  onSlotActivate: (slotIndex: number) => void;
  onRemoveCard: (slotIndex: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers: group slots by row for a football-pitch visual
// ─────────────────────────────────────────────────────────────────────────────

/** Build display rows: GK bottom, DEF next, MID, FWD top (attack-upward). */
function pitchRows(slots: SlotState[]): SlotState[][] {
  const gk   = slots.filter((s) => s.position === "GK");
  const def  = slots.filter((s) => s.position === "DEF");
  const mid  = slots.filter((s) => s.position === "MID");
  const fwd  = slots.filter((s) => s.position === "FWD");
  return [fwd, mid, def, gk];
}

function slotIndexOf(slot: SlotState, slots: SlotState[]): number {
  return slots.indexOf(slot);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot component (module-scope to avoid "component created during render")
// ─────────────────────────────────────────────────────────────────────────────

interface PitchSlotProps {
  slot: SlotState;
  slotIndex: number;
  isCaptain: boolean;
  isVice: boolean;
  isPending: boolean;          // keyboard-selected card can be placed here
  onDrop: (slotIndex: number, tokenId: string) => void;
  onActivate: (slotIndex: number) => void;
  onRemove: (slotIndex: number) => void;
  onCardSelect: (tokenId: string) => void;
}

function PitchSlot({
  slot,
  slotIndex,
  isCaptain,
  isVice,
  isPending,
  onDrop,
  onActivate,
  onRemove,
  onCardSelect,
}: PitchSlotProps) {
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData("text/plain");
    if (tokenId) onDrop(slotIndex, tokenId);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(slotIndex);
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onRemove(slotIndex);
    }
  }

  const isEmpty = slot.card === null;
  const oopClass = slot.isOop
    ? "border-orange-400 bg-orange-50"
    : isEmpty
      ? "border-dashed border-zinc-400 bg-zinc-50/60 hover:bg-zinc-100/80"
      : "border-green-700/40 bg-green-900/5";
  const pendingClass = isPending ? "ring-2 ring-zinc-900 bg-zinc-100/80" : "";

  const slotAriaLabel = slot.card
    ? `Slot ${slotIndex + 1} ${slot.position}: ${slot.card.playerName}${slot.isOop ? ", out of position" : ""}${isCaptain ? ", Captain" : ""}${isVice ? ", Vice" : ""}. Press Enter to replace, Delete to remove.`
    : `Slot ${slotIndex + 1} ${slot.position}: empty${isPending ? ". Press Enter to place selected card." : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={slotAriaLabel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => onActivate(slotIndex)}
      className={[
        "relative flex flex-col items-center justify-center rounded border-2 min-w-[70px] min-h-[80px] p-1 transition-colors cursor-pointer",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
        oopClass,
        pendingClass,
      ].join(" ")}
    >
      {/* Position label */}
      <span className="absolute top-0.5 left-1 text-[9px] font-bold text-zinc-500 uppercase">
        {slot.position}
      </span>

      {/* OOP badge — color-blind-safe: text + icon + orange color */}
      {slot.isOop && (
        <span
          className="absolute top-0.5 right-0.5 rounded bg-orange-500 px-0.5 text-[8px] font-bold text-white"
          aria-label="Out of position"
          title="Out of position"
        >
          OOP
        </span>
      )}

      {/* Formation mult badge */}
      {slot.card && slot.formationMult !== 1 && (
        <span
          className={[
            "absolute bottom-0.5 right-0.5 rounded text-[8px] font-bold px-0.5",
            slot.formationMult > 1
              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
              : "bg-orange-100 text-orange-800 border border-orange-300",
          ].join(" ")}
          aria-label={`Formation multiplier: ${slot.formationMult.toFixed(2)}x`}
          title={`Formation ×${slot.formationMult.toFixed(2)}`}
        >
          ×{slot.formationMult.toFixed(2)}
        </span>
      )}

      {/* Card or empty placeholder */}
      {slot.card ? (
        <CardChip
          card={slot.card}
          isSelected={false}
          isCaptain={isCaptain}
          isVice={isVice}
          onSelect={onCardSelect}
          compact
        />
      ) : (
        <span className="text-[10px] text-zinc-400 text-center leading-tight">
          {isPending ? "← drop here" : `+ ${slot.position}`}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pitch component
// ─────────────────────────────────────────────────────────────────────────────

export function Pitch({
  slots,
  captainIdx,
  viceIdx,
  pendingCardId,
  onDropCard,
  onSlotActivate,
  onRemoveCard,
}: PitchProps) {
  const rows = pitchRows(slots);

  return (
    <div
      aria-label="Football pitch lineup grid"
      className="relative flex flex-col gap-2 rounded-xl bg-green-800/10 border border-green-700/30 p-3"
    >
      {/* Pitch markings (purely decorative) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
        <div className="w-24 h-24 rounded-full border-2 border-green-700" />
      </div>
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px bg-green-700/20" />

      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex justify-center gap-2 flex-wrap">
          {row.map((slot) => {
            const si = slotIndexOf(slot, slots);
            return (
              <PitchSlot
                key={si}
                slot={slot}
                slotIndex={si}
                isCaptain={si === captainIdx}
                isVice={si === viceIdx}
                isPending={pendingCardId !== null && slot.card === null}
                onDrop={onDropCard}
                onActivate={onSlotActivate}
                onRemove={onRemoveCard}
                onCardSelect={() => {
                  // clicking a filled slot triggers removal flow via onSlotActivate
                  onSlotActivate(si);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
