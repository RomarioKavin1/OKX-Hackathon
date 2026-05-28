"use client";

/**
 * /play/builder — Full lineup builder
 *
 * Panini Collector reskin: formation/captain/chip as styled controls,
 * bench/available list with token-design vocabulary, commit via TxButton,
 * validation messages as semantic Pills.
 *
 * Preserves: all hooks, formation logic, contract commit, drag/keyboard, aria-*.
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
import {
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  EmptyState,
  buttonClasses,
  cx,
} from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm focus-visible:outline-2 focus-visible:outline-cobalt";

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
  slotTokenIds: string[];
  captainIdx: number;
  viceIdx: number;
  chipId: ChipId;
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
      const prev = next.indexOf(action.tokenId);
      if (prev !== -1) next[prev] = "";
      next[action.slotIndex] = action.tokenId;
      return { ...state, slotTokenIds: next, pendingCardId: null };
    }

    case "REMOVE_CARD": {
      const next = [...state.slotTokenIds];
      next[action.slotIndex] = "";
      return { ...state, slotTokenIds: next };
    }

    case "SET_CAPTAIN":
      if (action.idx === state.viceIdx) return state;
      return { ...state, captainIdx: action.idx };

    case "SET_VICE":
      if (action.idx === state.captainIdx) return state;
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

function resolveCard(pc: PortfolioCard, slotPosition?: Position): CardChipData {
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
      <Panel
        variant="sunken"
        aria-label="Lineup synergy preview"
        className="flex items-center justify-center px-4 py-6 text-center"
      >
        <p className="text-xs text-muted">Fill all 11 slots to see synergy.</p>
      </Panel>
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

  function staminaTone(s: "Fresh" | "Normal" | "Fatigued"): "ok" | "warn" | "neutral" {
    if (s === "Fresh") return "ok";
    if (s === "Fatigued") return "warn";
    return "neutral";
  }

  return (
    <Panel
      variant="paper"
      aria-label="Lineup synergy preview"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-col gap-4 p-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Lineup analysis
      </h3>

      {/* Country synergy */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">Country synergy</span>
        <Pill tone={preview.countryMult > 1 ? "ok" : "neutral"}>
          ×{preview.countryMult.toFixed(2)}
          {preview.countryMult > 1 && (
            <span className="opacity-70">
              (+{Math.round((preview.countryMult - 1) * 100)}%)
            </span>
          )}
        </Pill>
      </div>

      {/* Active formation synergies */}
      <div>
        <p className="mb-1.5 text-xs text-ink-2">Formation synergies</p>
        {preview.activeSynergies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {preview.activeSynergies.map((s) => (
              <Pill key={s} tone="cobalt">{s}</Pill>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">None active</p>
        )}
      </div>

      {/* Per-card breakdown */}
      <div>
        <p className="mb-1.5 text-xs text-ink-2">Per card</p>
        <ul className="flex flex-col gap-2" role="list">
          {input.cards.map((c, i) => {
            const sl = preview.staminaFlags[i];
            const oop = preview.oopFlags[i];
            const fm = preview.formationMultForCard[i];
            const hints = preview.perCardTraitHints[i];
            const def = PLAYER_BY_ID.get(c.playerId);
            return (
              <li
                key={c.playerId}
                className="flex flex-wrap items-center gap-1 border-b border-line pb-1.5 last:border-0 last:pb-0"
              >
                <span className="min-w-[72px] flex-1 truncate text-xs font-medium text-ink">
                  {def?.name ?? c.playerId.slice(0, 8)}
                </span>

                {/* Stamina — color-blind-safe: icon + text + tone */}
                <Pill tone={staminaTone(sl)}>
                  <span aria-hidden>{staminaIcon(sl)}</span>
                  <span aria-label={`Stamina: ${sl}`}>{sl}</span>
                </Pill>

                {/* Formation mult */}
                {fm !== 1 && (
                  <Pill tone={fm > 1 ? "ok" : "warn"} aria-label={`Formation multiplier ${multLabel(fm)}`}>
                    {multLabel(fm)}
                  </Pill>
                )}

                {/* OOP — color-blind-safe: text + icon + warn tone */}
                {oop && (
                  <Pill tone="warn" aria-label="Out of position — scoring penalty applies">
                    OOP
                  </Pill>
                )}

                {/* Trait hints */}
                {hints.length > 0 && (
                  <span className="w-full text-[10px] text-muted">
                    boosts: {hints.join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
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
    [address],
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
    [address],
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
      formationMult: 1,
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
  const handleSlotActivate = useCallback((slotIndex: number) => {
    if (state.pendingCardId) {
      dispatch({ type: "PLACE_CARD", slotIndex, tokenId: state.pendingCardId });
      const def = PLAYER_BY_ID.get(state.pendingCardId as `0x${string}`);
      announce(
        `${def?.name ?? state.pendingCardId} placed in slot ${slotIndex + 1} (${formation.slots[slotIndex]}). Slot ${slotIndex + 1} now filled.`,
      );
    } else if (state.slotTokenIds[slotIndex]) {
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
  const filledCount = state.slotTokenIds.filter(Boolean).length;

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

      {/* Page heading */}
      <SectionHeading
        kicker="Lineup builder"
        title="Build your XI"
        action={
          <Link href="/play" className={buttonClasses("ghost", "sm")}>
            Back to overview
          </Link>
        }
      />

      {/* No wallet notice */}
      {!address && (
        <Panel variant="outline" className="px-4 py-3">
          <p className="text-sm text-ink-2">Connect your wallet to build a lineup.</p>
        </Panel>
      )}

      {/* Two-column layout on wider screens */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* ── Left column: controls + pitch ──────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">

          {/* Controls bar: matchday, formation, squad readiness */}
          <Panel variant="paper" className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
                  htmlFor="matchday-select"
                >
                  Matchday
                </label>
                <select
                  id="matchday-select"
                  className={FORM_CONTROL}
                  value={state.matchday}
                  onChange={(e) => dispatch({ type: "SET_MATCHDAY", value: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>Matchday {d}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
                  htmlFor="formation-select"
                >
                  Formation
                </label>
                <select
                  id="formation-select"
                  className={FORM_CONTROL}
                  value={state.formationIndex}
                  onChange={(e) => dispatch({ type: "SET_FORMATION", index: Number(e.target.value) })}
                >
                  {FORMATIONS.map((f, i) => (
                    <option key={f.name} value={i}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="ml-auto flex flex-col items-end gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Squad
                </span>
                <Pill tone={filledCount === LINEUP_SIZE ? "ok" : filledCount > 0 ? "warn" : "neutral"}>
                  {filledCount}/{LINEUP_SIZE} placed
                </Pill>
              </div>
            </div>
          </Panel>

          {/* Keyboard instructions */}
          <Panel variant="sunken" className="px-4 py-2.5">
            <p className="text-xs text-ink-2">
              <span className="font-semibold text-ink">Keyboard:</span> Tab to a card, press{" "}
              <kbd className="rounded-xs border border-line-2 bg-paper-2 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
              to select it. Tab to a slot, press{" "}
              <kbd className="rounded-xs border border-line-2 bg-paper-2 px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
              to place. Press{" "}
              <kbd className="rounded-xs border border-line-2 bg-paper-2 px-1 py-0.5 font-mono text-[10px]">Delete</kbd>{" "}
              on a slot to clear it. Or drag cards directly onto slots.
            </p>
          </Panel>

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
            <Panel variant="paper" className="p-4" aria-label="Captain and vice-captain">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Armband
              </h2>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
                    htmlFor="captain-select"
                  >
                    Captain (C)
                  </label>
                  <select
                    id="captain-select"
                    className={FORM_CONTROL}
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

                <div className="flex flex-1 flex-col gap-1.5">
                  <label
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
                    htmlFor="vice-select"
                  >
                    Vice (V)
                  </label>
                  <select
                    id="vice-select"
                    className={FORM_CONTROL}
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
              </div>
            </Panel>
          )}

          {/* Chip selector */}
          <Panel variant="paper" className="p-4" aria-label="Chip selection">
            <fieldset>
              <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Chip
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
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
                      className={cx(
                        "rounded-sm border px-3 h-8 text-xs font-semibold transition-[background-color,border-color,color] duration-150 [transition-timing-function:var(--ease-out-expo)]",
                        "focus-visible:outline-2 focus-visible:outline-cobalt",
                        isSelected
                          ? "border-cobalt bg-cobalt text-on-panel"
                          : "border-line-2 bg-paper-2 text-ink-2 hover:border-ink-2 hover:text-ink",
                        !hasChip ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                      )}
                    >
                      {opt.label}
                      {bal !== undefined && (
                        <span className="ml-1 opacity-60">×{bal.toString()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(state.chipId === ChipId.Wildcard || state.chipId === ChipId.FreeHit) && (
                <p className="mt-2 text-xs text-muted">
                  {state.chipId === ChipId.Wildcard ? "Wildcard" : "Free Hit"} resets stamina to Normal for all cards.
                </p>
              )}
            </fieldset>
          </Panel>

          {/* Validation errors */}
          {allFilled && !validation.ok && (
            <section aria-label="Lineup validation errors" className="flex flex-col gap-1.5">
              {validation.errors.map((err, i) => (
                <Pill key={i} tone="danger" className="w-fit px-3 py-1.5 text-xs">
                  {err}
                </Pill>
              ))}
            </section>
          )}

          {/* Commit section */}
          {!loadingCards && portfolioCards.length >= LINEUP_SIZE && allFilled && validation.ok && address && (
            <Panel variant="ink" className="p-5" aria-label="Commit lineup">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-on-panel">Ready to commit</p>
                <Pill tone="cobalt">Matchday {state.matchday}</Pill>
              </div>
              <TxButton
                request={commitRequest}
                label={`Commit Lineup — Matchday ${state.matchday}`}
                disabled={!validation.ok}
                onSuccess={(hash) => {
                  announce(`Lineup committed! Transaction: ${hash}`);
                  console.info("LineupCommitted tx:", hash);
                }}
              />
            </Panel>
          )}

          {!address && allFilled && (
            <p className="text-sm text-muted">Connect a wallet to commit this lineup.</p>
          )}
        </div>

        {/* ── Right column: bench + synergy panel ────────────────────────── */}
        <div className="flex flex-col gap-4 lg:w-72">

          {/* Bench cards */}
          <section aria-label="Your cards (bench)">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Your cards
              </h2>
              {!loadingCards && (
                <Pill tone="neutral">{portfolioCards.length} controllable</Pill>
              )}
            </div>

            {loadingCards && (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}

            {cardsError && (
              <Pill tone="danger" className="px-3 py-2 text-xs w-full rounded-sm">
                Could not load cards: {cardsError}
              </Pill>
            )}

            {!loadingCards && portfolioCards.length === 0 && address && (
              <EmptyState
                icon="🃏"
                title="No controllable cards"
                hint={`You need ${LINEUP_SIZE} cards to commit a lineup.`}
                action={
                  <Link
                    href="/rentals"
                    className={buttonClasses("secondary", "sm")}
                  >
                    Rent cards
                  </Link>
                }
              />
            )}

            {portfolioCards.length > 0 && (
              <ul
                className="flex max-h-[480px] flex-col gap-1 overflow-y-auto pr-0.5"
                role="list"
              >
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

          {/* Synergy panel */}
          <SynergyPanel input={previewInput} />
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny useState-like wrapper backed by useReducer
// ─────────────────────────────────────────────────────────────────────────────

function useReducerShim<T>(initial: T): [T, (v: T) => void] {
  const [state, dispatch] = useReducer((_: T, next: T) => next, initial);
  return [state, dispatch];
}
