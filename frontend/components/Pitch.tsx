"use client";

/**
 * Pitch.tsx — Formation slot grid displayed as a tactics board.
 *
 * Each slot is:
 *  - A valid HTML5 DnD drop target (dragover/drop)
 *  - Keyboard-accessible: tabIndex=0, activatable with Enter/Space to receive
 *    the currently "selected" card from the builder's keyboard flow.
 *  - Has aria-label describing position + occupant name (if any).
 *  - Shows OOP (out-of-position) slots in a color-blind-safe way: warn border
 *    + "OOP" label icon (not just color alone, per §8.5).
 */

import type { KeyboardEvent } from "react";
import type { Position } from "@/lib/types";
import type { CardChipData } from "./CardChip";
import { CardChip } from "./CardChip";
import { cx, Pill } from "@/components/ui";

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

  // Slot surface: OOP = warn accent, pending = cobalt accent, empty = dashed line, filled = subtle
  const slotBase = cx(
    "relative flex flex-col items-center justify-center rounded-sm border-2 min-w-[70px] min-h-[80px] p-1",
    "transition-[border-color,background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-expo)]",
    "cursor-pointer",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
  );

  const slotSurface = slot.isOop
    ? "border-warn/70 bg-warn/8"
    : isPending
      ? "border-cobalt/60 bg-cobalt/8"
      : isEmpty
        ? "border-dashed border-line-2 bg-paper-3/60 hover:bg-paper-3 hover:border-line-2"
        : "border-line bg-paper-2/70";

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
      className={cx(slotBase, slotSurface)}
    >
      {/* Position label */}
      <span className="absolute top-0.5 left-1 text-[9px] font-semibold text-muted uppercase tracking-wider">
        {slot.position}
      </span>

      {/* OOP badge — color-blind-safe: text + icon + warn token */}
      {slot.isOop && (
        <span
          className="absolute top-0.5 right-0.5 rounded-xs bg-warn/20 border border-warn/50 px-0.5 text-[8px] font-bold text-[color:var(--ink-2)]"
          aria-label="Out of position"
          title="Out of position"
        >
          OOP
        </span>
      )}

      {/* Formation mult badge — restyled as Pill */}
      {slot.card && slot.formationMult !== 1 && (
        <span className="absolute bottom-0.5 right-0.5">
          <Pill
            tone={slot.formationMult > 1 ? "ok" : "warn"}
            aria-label={`Formation multiplier: ${slot.formationMult.toFixed(2)}x`}
            className="!text-[8px] !px-1 !py-0"
          >
            ×{slot.formationMult.toFixed(2)}
          </Pill>
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
        <span className="text-[10px] text-muted text-center leading-tight select-none">
          {isPending ? "drop here" : `+ ${slot.position}`}
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
      className="grain relative flex flex-col gap-3 rounded-card bg-panel border border-[color:var(--panel-2)] p-4 overflow-hidden"
    >
      {/*
        Decorative pitch markings — thin hairlines only, low-opacity grass color.
        No green flood-fill; the panel surface does the heavy lifting.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Halfway line */}
        <div
          className="absolute left-4 right-4"
          style={{
            top: "50%",
            height: "1px",
            background: `oklch(0.62 0.150 150 / 0.18)`,
          }}
        />
        {/* Center circle */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "64px",
            height: "64px",
            border: "1px solid oklch(0.62 0.150 150 / 0.18)",
          }}
        />
      </div>

      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex justify-center gap-2 flex-wrap relative z-10">
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
