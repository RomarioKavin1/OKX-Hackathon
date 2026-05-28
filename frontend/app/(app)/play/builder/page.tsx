"use client";

/**
 * /play/builder — Full lineup builder (Task 6.2)
 *
 * Features:
 *  - Formation picker (6 from FORMATIONS)
 *  - Pitch slot grid (Pitch component)
 *  - Bench: fetched cards from /api/portfolio?wallet=
 *  - Drag-drop (native HTML5 DnD) AND keyboard-accessible path:
 *      1. Focus a bench card, press Enter → it becomes the "pending" card.
 *      2. Focus an empty slot, press Enter → card is placed.
 *      3. A slot with a card: Enter → slot enters replace mode; press Enter on
 *         a bench card → swaps it in.
 *      Announce state changes via aria-live region.
 *  - Captain + vice pickers; chip selector (balances via chipBalance)
 *  - Live synergy panel from previewLineup (no duplicated math)
 *  - validateLineup before enabling commit; commit via TxButton
 */

import { useEffect, useReducer, useCallback, useRef } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";

import { FORMATIONS, LINEUP_SIZE } from "@/lib/constants";
import { validateLineup } from "@/lib/business/lineup";
import type { LineupDraft } from "@/lib/business/lineup";
import { previewLineup } from "@/lib/business/synergyPreview";
import type { PreviewCard, PreviewInput } from "@/lib/business/synergyPreview";
import { chipBalance } from "@/lib/actions/reads";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { ChipId } from "@/lib/types";
import type { Position } from "@/lib/types";
import type { TxRequest } from "@/components/TxButton";
import { TxButton } from "@/components/TxButton";
import { Pitch } from "@/components/Pitch";
import type { SlotState } from "@/components/Pitch";
import { CardChip } from "@/components/CardChip";
import type { CardChipData } from "@/components/CardChip";
import { PLAYER_BY_ID } from "@/lib/data/players";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PortfolioCard {
  tokenId: string;
  playerId: string;
  tier: number;
  state: string;
  stamina?: number;
}

interface ChipOption {
  label: string;
  value: ChipId;
  description: string;
}

const CHIP_OPTIONS: ChipOption[] = [
  { label: "None", value: ChipId.None, description: "No chip" },
  { label: "Triple Captain", value: ChipId.TripleCaptain, description: "Captain scores ×3" },
  { label: "Doubler", value: ChipId.Doubler, description: "All points ×2" },
  { label: "Wildcard", value: ChipId.Wildcard, description: "Unlimited transfers (stamina resets to Normal)" },
  { label: "Free Hit", value: ChipId.FreeHit, description: "Temporary squad for one matchday (stamina resets to Normal)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Builder state (useReducer keeps state updates outside render)
// ─────────────────────────────────────────────────────────────────────────────

interface BuilderState {
  matchday: number;
  formationIndex: number;
  /** tokenId placed in each slot (empty string = empty). Length = 11. */
  slotTokenIds: string[];
  captainIdx: number;
  viceIdx: number;
  chipId: ChipId;
  /** The tokenId currently "pending" for keyboard-placement (null = none). */
  pendingCardId: string | null;
}

type BuilderAction =
  | { type: "SET_MATCHDAY"; value: number }
  | { type: "SET_FORMATION"; index: number }
  | { type: "PLACE_CARD"; slotIndex: number; tokenId: string }
  | { type: "REMOVE_CARD"; slotIndex: number }
  | { type: "SET_CAPTAIN"; idx: number }
  | { type: "SET_VICE"; idx: number }
  | { type: "SET_CHIP"; chipId: ChipId }
  | { type: "SET_PENDING"; tokenId: string | null };

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_MATCHDAY":
      return { ...state, matchday: action.value };

    case "SET_FORMATION":
      return {
        ...state,
        formationIndex: action.index,
        slotTokenIds: Array(LINEUP_SIZE).fill(""),
        pendingCardId: null,
      };

    case "PLACE_CARD": {
      const next = [...state.slotTokenIds];
      // Remove the card from any previous slot it occupied
      const prev = next.indexOf(action.tokenId);
      if (prev !== -1) next[prev] = "";
      next[action.slotIndex] = action.tokenId;
      return {
        ...state,
        slotTokenIds: next,
        pendingCardId: null,
      };
    }

    case "REMOVE_CARD": {
      const next = [...state.slotTokenIds];
      next[action.slotIndex] = "";
      return { ...state, slotTokenIds: next };
    }

    case "SET_CAPTAIN":
      if (action.idx === state.viceIdx) return state; // can't be both
      return { ...state, captainIdx: action.idx };

    case "SET_VICE":
      if (action.idx === state.captainIdx) return state; // can't be both
      return { ...state, viceIdx: action.idx };

    case "SET_CHIP":
      return { ...state, chipId: action.chipId };

    case "SET_PENDING":
      return { ...state, pendingCardId: action.tokenId };

    default:
      return state;
  }
}

const INITIAL_STATE: BuilderState = {
  matchday: 1,
  formationIndex: 0,
  slotTokenIds: Array(LINEUP_SIZE).fill(""),
  captainIdx: 0,
  viceIdx: 1,
  chipId: ChipId.None,
  pendingCardId: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve player info from playerId (bytes32)
// ─────────────────────────────────────────────────────────────────────────────

function resolveCard(
  pc: PortfolioCard,
  slotPosition?: Position,
): CardChipData {
  const pid = pc.playerId as `0x${string}`;
  const def = PLAYER_BY_ID.get(pid);
  const naturalPos = (def?.position ?? "MID") as Position;
  return {
    tokenId: pc.tokenId,
    playerId: pc.playerId,
    playerName: def?.name ?? `#${pc.tokenId.slice(-6)}`,
    nation: def?.nation ?? "???",
    position: naturalPos,
    tier: pc.tier as import("@/lib/types").Tier,
    stamina: pc.stamina ?? 80,
    traits: def ? [def.primaryTrait, def.secondaryTrait] : [],
    isOop: slotPosition !== undefined && naturalPos !== slotPosition,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Synergy panel sub-component (module-scope)
// ─────────────────────────────────────────────────────────────────────────────

interface SynergyPanelProps {
  input: PreviewInput | null;
}

function SynergyPanel({ input }: SynergyPanelProps) {
  if (!input || input.cards.length < LINEUP_SIZE) {
    return (
      <aside
        aria-label="Lineup synergy preview"
        className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-400"
      >
        Fill all 11 slots to see synergy preview.
      </aside>
    );
  }

  const preview = previewLineup(input);

  function multLabel(m: number): string {
    if (m > 1) return `+${((m - 1) * 100).toFixed(0)}%`;
    if (m < 1) return `${((m - 1) * 100).toFixed(0)}%`;
    return "×1";
  }

  function staminaIcon(s: "Fresh" | "Normal" | "Fatigued"): string {
    if (s === "Fresh") return "▲";
    if (s === "Fatigued") return "▼";
    return "●";
  }

  function staminaStyle(s: "Fresh" | "Normal" | "Fatigued"): string {
    if (s === "Fresh") return "text-emerald-700 font-semibold";
    if (s === "Fatigued") return "text-orange-700 font-semibold";
    return "text-zinc-600";
  }

  return (
    <aside
      aria-label="Lineup synergy preview"
      aria-live="polite"
      aria-atomic="true"
      className="rounded border border-zinc-200 bg-zinc-50 p-3 flex flex-col gap-3 text-sm"
    >
      <h3 className="font-semibold text-zinc-700">Lineup Analysis</h3>

      {/* Country synergy */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Country Synergy</p>
        <p className="text-zinc-800">
          <span className={preview.countryMult > 1 ? "text-emerald-700 font-bold" : "text-zinc-500"}>
            ×{preview.countryMult.toFixed(2)}
          </span>
          {preview.countryMult > 1 && (
            <span className="ml-1 text-xs text-zinc-400">
              ({Math.round((preview.countryMult - 1) * 100)}% bonus)
            </span>
          )}
        </p>
      </div>

      {/* Active formation synergies */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
          Formation Synergies
          {preview.activeSynergies.length === 0 && (
            <span className="ml-1 normal-case font-normal text-zinc-400">(none active)</span>
          )}
        </p>
        {preview.activeSynergies.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {preview.activeSynergies.map((s) => (
              <li
                key={s}
                className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-800"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-card breakdown */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Per-Card</p>
        <ul className="flex flex-col gap-1">
          {input.cards.map((c, i) => {
            const sl = preview.staminaFlags[i];
            const oop = preview.oopFlags[i];
            const fm = preview.formationMultForCard[i];
            const hints = preview.perCardTraitHints[i];
            const def = PLAYER_BY_ID.get(c.playerId);
            return (
              <li key={c.playerId} className="flex flex-wrap items-start gap-1 border-b border-zinc-100 pb-1">
                <span className="font-medium text-zinc-700 min-w-[90px] text-xs truncate">
                  {def?.name ?? c.playerId.slice(0, 8)}
                </span>

                {/* Stamina — color-blind-safe: icon + text + color */}
                <span className={`text-[10px] flex items-center gap-0.5 ${staminaStyle(sl)}`} aria-label={`Stamina: ${sl}`}>
                  <span aria-hidden>{staminaIcon(sl)}</span>
                  {sl}
                </span>

                {/* Formation mult */}
                {fm !== 1 && (
                  <span
                    className={[
                      "text-[10px] rounded px-0.5 border",
                      fm > 1
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-orange-50 border-orange-300 text-orange-800",
                    ].join(" ")}
                    aria-label={`Formation multiplier ${multLabel(fm)}`}
                  >
                    {multLabel(fm)}
                  </span>
                )}

                {/* OOP — color-blind-safe: text + icon + orange */}
                {oop && (
                  <span
                    className="text-[10px] rounded px-0.5 bg-orange-100 border border-orange-300 text-orange-800 font-bold"
                    aria-label="Out of position — scoring penalty applies"
                  >
                    ⚠ OOP
                  </span>
                )}

                {/* Trait hints */}
                {hints.length > 0 && (
                  <span className="text-[9px] text-zinc-400 flex-1">
                    boosts: {hints.join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  // ── Server data ────────────────────────────────────────────────────────────
  const [portfolioCards, setPortfolioCards] = useReducerShim<PortfolioCard[]>([]);
  const [loadingCards, setLoadingCards] = useReducerShim(false);
  const [cardsError, setCardsError] = useReducerShim<string | null>(null);
  const [chipBalances, setChipBalances] = useReducerShim<Record<number, bigint>>({});

  // ── Builder state ──────────────────────────────────────────────────────────
  const [state, dispatch] = useReducer(builderReducer, INITIAL_STATE);

  // ── Live region ref for announcements ─────────────────────────────────────
  const liveRef = useRef<HTMLParagraphElement>(null);

  function announce(msg: string) {
    if (liveRef.current) {
      liveRef.current.textContent = msg;
    }
  }

  // ── Fetch portfolio ────────────────────────────────────────────────────────
  useEffect(
    () => {
      if (!address) return;
      let cancelled = false;
      void (async () => {
        setLoadingCards(true);
        setCardsError(null);
        try {
          const res = await fetch(`/api/portfolio?wallet=${address}`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          const data = await res.json() as { cards: PortfolioCard[] };
          if (!cancelled) {
            const controllable = data.cards.filter(
              (c) => c.state === "OWN" || c.state === "RENTING_IN",
            );
            setPortfolioCards(controllable);
          }
        } catch (err) {
          if (!cancelled) setCardsError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!cancelled) setLoadingCards(false);
        }
      })();
      return () => { cancelled = true; };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address], // setters are stable dispatch fns (useReducer guarantee)
  );

  // ── Fetch chip balances ────────────────────────────────────────────────────
  useEffect(
    () => {
      if (!address) return;
      let cancelled = false;
      void (async () => {
        try {
          const chips = [ChipId.TripleCaptain, ChipId.Doubler, ChipId.Wildcard, ChipId.FreeHit];
          const entries = await Promise.all(
            chips.map(async (id) => [id, await chipBalance(address, id)] as [ChipId, bigint]),
          );
          if (!cancelled) setChipBalances(Object.fromEntries(entries));
        } catch {
          // chip balance fetch failure is non-fatal
        }
      })();
      return () => { cancelled = true; };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address], // setChipBalances is stable dispatch
  );

  // ── Derived: controllable card set ────────────────────────────────────────
  const controllableSet = new Set(portfolioCards.map((c) => c.tokenId));
  const cardByTokenId = new Map(portfolioCards.map((c) => [c.tokenId, c]));

  const formation = FORMATIONS[state.formationIndex];

  // ── Slot states ────────────────────────────────────────────────────────────
  const slotStates: SlotState[] = formation.slots.map((pos, i) => {
    const tid = state.slotTokenIds[i];
    const pc = tid ? cardByTokenId.get(tid) : null;
    const slotPos = pos as Position;
    const card = pc ? resolveCard(pc, slotPos) : null;
    const naturalPos = card ? (card.position as Position) : slotPos;
    const isOop = card ? naturalPos !== slotPos : false;

    // Stamina band from card (preview will compute the canonical value)
    let staminaBand: "Fresh" | "Normal" | "Fatigued" = "Normal";
    if (card) {
      const s = card.stamina;
      staminaBand = s > 70 ? "Fresh" : s < 30 ? "Fatigued" : "Normal";
    }

    return {
      position: slotPos,
      card,
      isOop,
      staminaBand,
      formationMult: 1,  // overridden below after previewLineup
      traitHints: [],
    };
  });

  // ── Preview input (only when all 11 slots filled) ─────────────────────────
  const allFilled = state.slotTokenIds.every((id) => id !== "");

  let previewInput: PreviewInput | null = null;
  if (allFilled) {
    const previewCards: PreviewCard[] = slotStates.map((s, i) => {
      const pc = cardByTokenId.get(state.slotTokenIds[i]);
      const def = pc ? PLAYER_BY_ID.get(pc.playerId as `0x${string}`) : null;
      return {
        playerId: (pc?.playerId ?? "0x0") as `0x${string}`,
        naturalPosition: (def?.position ?? s.position) as Position,
        scoringPosition: s.position,
        nation: def?.nation ?? "???",
        traits: def ? [def.primaryTrait, def.secondaryTrait] : [],
        stamina: pc?.stamina ?? 80,
      };
    });

    previewInput = {
      formation: formation.name,
      captainIdx: state.captainIdx,
      viceIdx: state.viceIdx,
      cards: previewCards,
    };

    // Backfill formationMult into slotStates from previewLineup result
    const preview = previewLineup(previewInput);
    for (let i = 0; i < LINEUP_SIZE; i++) {
      slotStates[i].formationMult = preview.formationMultForCard[i];
      slotStates[i].traitHints = preview.perCardTraitHints[i];
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const draft: LineupDraft = {
    tokenIds: state.slotTokenIds.map((id) => (id ? BigInt(id) : 0n)),
    formationIndex: state.formationIndex,
    captainIdx: state.captainIdx,
    viceIdx: state.viceIdx,
  };

  const validation = address
    ? validateLineup(
        draft,
        address,
        (tokenId) =>
          controllableSet.has(tokenId.toString())
            ? address
            : "0x0000000000000000000000000000000000000000",
      )
    : { ok: false, errors: ["No wallet connected"] };

  // ── TxButton request ───────────────────────────────────────────────────────
  // Arg order mirrors writes.ts commitLineup:
  //   [BigInt(matchday), tokenIds, formation, captainIdx, viceIdx, chipId]
  const commitRequest: TxRequest = {
    address: ADDRESSES.GameRegistry,
    abi: ABIS.GameRegistry,
    functionName: "commitLineup",
    args: [
      BigInt(state.matchday),
      state.slotTokenIds.map((id) => BigInt(id || "0")),
      state.formationIndex,
      state.captainIdx,
      state.viceIdx,
      state.chipId,
    ] as const,
  };

  // ── Drag-drop handlers ─────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent<HTMLDivElement>, tokenId: string) {
    e.dataTransfer.setData("text/plain", tokenId);
    e.dataTransfer.effectAllowed = "move";
  }

  const handleDropCard = useCallback((slotIndex: number, tokenId: string) => {
    dispatch({ type: "PLACE_CARD", slotIndex, tokenId });
    const def = PLAYER_BY_ID.get(tokenId as `0x${string}`);
    announce(`${def?.name ?? tokenId} placed in slot ${slotIndex + 1} (${formation.slots[slotIndex]})`);
  }, [formation.slots]);

  // ── Keyboard-accessible placement ─────────────────────────────────────────
  // Flow: (1) Select bench card (Enter → sets pendingCardId)
  //       (2) Activate a slot (Enter → places card in slot)
  const handleSlotActivate = useCallback((slotIndex: number) => {
    if (state.pendingCardId) {
      // Place pending card into this slot
      dispatch({ type: "PLACE_CARD", slotIndex, tokenId: state.pendingCardId });
      const def = PLAYER_BY_ID.get(state.pendingCardId as `0x${string}`);
      announce(
        `${def?.name ?? state.pendingCardId} placed in slot ${slotIndex + 1} (${formation.slots[slotIndex]}). Slot ${slotIndex + 1} now filled.`,
      );
    } else if (state.slotTokenIds[slotIndex]) {
      // Slot has a card — remove it (or let user swap by selecting bench card next)
      dispatch({ type: "REMOVE_CARD", slotIndex });
      announce(`Slot ${slotIndex + 1} cleared.`);
    } else {
      announce(
        `Slot ${slotIndex + 1} (${formation.slots[slotIndex]}) is empty. Select a bench card first, then press Enter here to place it.`,
      );
    }
  }, [state.pendingCardId, state.slotTokenIds, formation.slots]);

  const handleRemoveCard = useCallback((slotIndex: number) => {
    dispatch({ type: "REMOVE_CARD", slotIndex });
    announce(`Slot ${slotIndex + 1} cleared.`);
  }, []);

  function handleCardSelect(tokenId: string) {
    if (state.pendingCardId === tokenId) {
      // Deselect
      dispatch({ type: "SET_PENDING", tokenId: null });
      announce("Card deselected.");
    } else {
      dispatch({ type: "SET_PENDING", tokenId });
      const def = PLAYER_BY_ID.get(tokenId as `0x${string}`);
      announce(
        `${def?.name ?? tokenId} selected. Now focus an empty slot and press Enter to place, or drag to a slot.`,
      );
    }
  }

  // ── Placed token set (to dim bench cards) ─────────────────────────────────
  const placedSet = new Set(state.slotTokenIds.filter(Boolean));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex max-w-5xl flex-col gap-6">
      {/* aria-live region for keyboard/synergy announcements */}
      <p
        ref={liveRef}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        role="status"
      />

      <header>
        <h1 className="text-2xl font-bold">Lineup Builder</h1>
        <p className="text-sm opacity-70">
          Build your 11-player squad, pick your captain, chip, and commit for a matchday.
        </p>
      </header>

      {!address && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect your wallet to build a lineup.
        </p>
      )}

      {/* Two-column layout on wider screens */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Left column: controls + pitch ──────────────────────────────── */}
        <div className="flex flex-col gap-5 flex-1">

          {/* Matchday + Formation row */}
          <section className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="matchday-select">Matchday</label>
              <select
                id="matchday-select"
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={state.matchday}
                onChange={(e) => dispatch({ type: "SET_MATCHDAY", value: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>Matchday {d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="formation-select">Formation</label>
              <select
                id="formation-select"
                className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                value={state.formationIndex}
                onChange={(e) => dispatch({ type: "SET_FORMATION", index: Number(e.target.value) })}
              >
                {FORMATIONS.map((f, i) => (
                  <option key={f.name} value={i}>{f.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Keyboard instructions */}
          <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded px-3 py-2">
            <strong>Keyboard:</strong> Tab to a card below, press Enter to select it (it glows).
            Then Tab to a slot on the pitch and press Enter to place it. Press Delete on a slot to clear it.
            Or drag cards directly onto slots.
          </p>

          {/* Pitch */}
          <section aria-label="Football pitch">
            <Pitch
              slots={slotStates}
              captainIdx={state.captainIdx}
              viceIdx={state.viceIdx}
              pendingCardId={state.pendingCardId}
              onDropCard={handleDropCard}
              onSlotActivate={handleSlotActivate}
              onRemoveCard={handleRemoveCard}
            />
          </section>

          {/* Captain + Vice (only when all slots filled) */}
          {allFilled && (
            <section className="flex flex-wrap gap-4" aria-label="Captain and vice-captain">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-28" htmlFor="captain-select">Captain (C)</label>
                <select
                  id="captain-select"
                  className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  value={state.captainIdx}
                  onChange={(e) => dispatch({ type: "SET_CAPTAIN", idx: Number(e.target.value) })}
                >
                  {state.slotTokenIds.map((id, i) => {
                    const pc = cardByTokenId.get(id);
                    const def = pc ? PLAYER_BY_ID.get(pc.playerId as `0x${string}`) : null;
                    return (
                      <option key={i} value={i} disabled={i === state.viceIdx}>
                        Slot {i + 1} — {formation.slots[i]} — {def?.name ?? `#${id.slice(-6)}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium w-28" htmlFor="vice-select">Vice (V)</label>
                <select
                  id="vice-select"
                  className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  value={state.viceIdx}
                  onChange={(e) => dispatch({ type: "SET_VICE", idx: Number(e.target.value) })}
                >
                  {state.slotTokenIds.map((id, i) => {
                    const pc = cardByTokenId.get(id);
                    const def = pc ? PLAYER_BY_ID.get(pc.playerId as `0x${string}`) : null;
                    return (
                      <option key={i} value={i} disabled={i === state.captainIdx}>
                        Slot {i + 1} — {formation.slots[i]} — {def?.name ?? `#${id.slice(-6)}`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </section>
          )}

          {/* Chip selector */}
          <section aria-label="Chip selection" className="flex flex-col gap-2">
            <fieldset>
              <legend className="text-sm font-medium mb-1">Chip</legend>
              <div className="flex flex-wrap gap-2">
                {CHIP_OPTIONS.map((opt) => {
                  const bal: bigint | undefined = opt.value === ChipId.None ? undefined : chipBalances[opt.value];
                  const hasChip = opt.value === ChipId.None || (bal !== undefined && bal > 0n);
                  const isSelected = state.chipId === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!hasChip}
                      onClick={() => dispatch({ type: "SET_CHIP", chipId: opt.value })}
                      title={opt.description + (bal !== undefined ? ` (balance: ${bal})` : "")}
                      className={[
                        "rounded border px-3 py-1 text-xs font-medium transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900",
                        isSelected
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500",
                        !hasChip ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                      ].join(" ")}
                    >
                      {opt.label}
                      {bal !== undefined && (
                        <span className="ml-1 text-[10px] opacity-60">×{bal.toString()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Stamina note for Wildcard / FreeHit */}
              {(state.chipId === ChipId.Wildcard || state.chipId === ChipId.FreeHit) && (
                <p className="mt-1 text-xs text-zinc-500">
                  Note: {state.chipId === ChipId.Wildcard ? "Wildcard" : "Free Hit"} resets stamina to Normal for all cards.
                </p>
              )}
            </fieldset>
          </section>

          {/* Validation errors */}
          {allFilled && !validation.ok && (
            <section
              aria-label="Lineup validation errors"
              className="rounded border border-red-200 bg-red-50 p-3"
            >
              <p className="mb-1 text-xs font-semibold text-red-700">Lineup issues:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {validation.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600">{err}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Commit button */}
          {!loadingCards && portfolioCards.length >= LINEUP_SIZE && allFilled && validation.ok && address && (
            <section aria-label="Commit lineup">
              <TxButton
                request={commitRequest}
                label={`Commit Lineup — Matchday ${state.matchday}`}
                disabled={!validation.ok}
                onSuccess={(hash) => {
                  announce(`Lineup committed! Transaction: ${hash}`);
                  console.info("LineupCommitted tx:", hash);
                }}
              />
            </section>
          )}

          {!address && allFilled && (
            <p className="text-sm text-zinc-500">Connect a wallet to commit this lineup.</p>
          )}
        </div>

        {/* ── Right column: bench + synergy panel ────────────────────────── */}
        <div className="flex flex-col gap-4 lg:w-72">

          {/* Bench cards */}
          <section aria-label="Your cards (bench)">
            <h2 className="text-sm font-semibold mb-2">
              Your Cards
              <span className="ml-1 text-xs font-normal text-zinc-400">
                ({portfolioCards.length} controllable)
              </span>
            </h2>

            {loadingCards && <p className="text-xs text-zinc-400">Loading cards…</p>}
            {cardsError && (
              <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Could not load cards: {cardsError}
              </p>
            )}

            {!loadingCards && portfolioCards.length === 0 && address && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">
                  No controllable cards found. You need {LINEUP_SIZE} to commit a lineup.
                </p>
                <Link
                  href="/rentals"
                  className="mt-1 inline-block text-xs font-medium text-amber-900 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                >
                  Rent cards →
                </Link>
              </div>
            )}

            {portfolioCards.length > 0 && (
              <ul className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-1" role="list">
                {portfolioCards.map((pc) => {
                  const card = resolveCard(pc);
                  return (
                    <li key={pc.tokenId} role="listitem">
                      <CardChip
                        card={card}
                        isSelected={state.pendingCardId === pc.tokenId}
                        isCaptain={state.slotTokenIds[state.captainIdx] === pc.tokenId}
                        isVice={state.slotTokenIds[state.viceIdx] === pc.tokenId}
                        onSelect={handleCardSelect}
                        onDragStart={handleDragStart}
                        placed={placedSet.has(pc.tokenId)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Synergy panel (driven entirely by previewLineup) */}
          <SynergyPanel input={previewInput} />
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny useState-like wrapper backed by useReducer (avoids state updates during
// render and keeps exhaustive-deps lint happy in the main component).
// ─────────────────────────────────────────────────────────────────────────────

function useReducerShim<T>(initial: T): [T, (v: T) => void] {
  const [state, dispatch] = useReducer((_: T, next: T) => next, initial);
  return [state, dispatch];
}
