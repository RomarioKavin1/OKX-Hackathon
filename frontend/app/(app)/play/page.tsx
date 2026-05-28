"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { FORMATIONS, LINEUP_SIZE } from "@/lib/constants";
import { validateLineup } from "@/lib/business/lineup";
import type { LineupDraft } from "@/lib/business/lineup";
import { ChipId } from "@/lib/types";
import {
  Button,
  buttonClasses,
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  EmptyState,
  cx,
} from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

interface PortfolioCard {
  tokenId: string;
  playerId: string;
  tier: number;
  state: string;
}

// ── Module-scope sub-components ───────────────────────────────────────────────

interface SlotSelectProps {
  slotIndex: number;
  position: string;
  selectedTokenId: string;
  cards: PortfolioCard[];
  onSelect: (slotIndex: number, tokenId: string) => void;
}

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm focus-visible:outline-2 focus-visible:outline-cobalt";

function SlotSelect({ slotIndex, position, selectedTokenId, cards, onSelect }: SlotSelectProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-10 shrink-0 rounded-xs bg-paper-3 px-1.5 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
        aria-hidden
      >
        {position}
      </span>
      <select
        aria-label={`Slot ${slotIndex + 1} — ${position}`}
        className={cx(FORM_CONTROL, "flex-1")}
        value={selectedTokenId}
        onChange={(e) => onSelect(slotIndex, e.target.value)}
      >
        <option value="">Pick a card</option>
        {cards.map((c) => (
          <option key={c.tokenId} value={c.tokenId}>
            #{c.tokenId.slice(-6)} · Tier {c.tier} · {c.playerId.slice(0, 10)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PlayPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  // ── Server data ────────────────────────────────────────────────────────────
  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);

  useEffect(() => {
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
            (c) => c.state === "OWN" || c.state === "RENTING_IN"
          );
          setCards(controllable);
        }
      } catch (err) {
        if (!cancelled) setCardsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  // ── Draft state ────────────────────────────────────────────────────────────
  const [matchday, setMatchday] = useState(1);
  const [formationIndex, setFormationIndex] = useState(0);
  const [slotTokenIds, setSlotTokenIds] = useState<string[]>(
    Array(LINEUP_SIZE).fill("")
  );
  const [captainIdx, setCaptainIdx] = useState(0);
  const [viceIdx, setViceIdx] = useState(1);
  const [chipId, setChipId] = useState<ChipId>(ChipId.None);

  const handleFormationChange = (idx: number) => {
    setFormationIndex(idx);
    setSlotTokenIds(Array(LINEUP_SIZE).fill(""));
  };

  const handleSlotSelect = (slotIndex: number, tokenId: string) => {
    setSlotTokenIds((prev) => {
      const next = [...prev];
      next[slotIndex] = tokenId;
      return next;
    });
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const controllableSet = new Set(cards.map((c) => c.tokenId));

  const draft: LineupDraft = {
    tokenIds: slotTokenIds.map((id) => (id ? BigInt(id) : 0n)),
    formationIndex,
    captainIdx,
    viceIdx,
  };

  const validation = address
    ? validateLineup(
        draft,
        address,
        (tokenId) =>
          controllableSet.has(tokenId.toString())
            ? address
            : "0x0000000000000000000000000000000000000000"
      )
    : { ok: false, errors: ["No wallet connected"] };

  const allFilled = slotTokenIds.every((id) => id !== "");

  const commitRequest = {
    address: ADDRESSES.GameRegistry,
    abi: ABIS.GameRegistry,
    functionName: "commitLineup",
    args: [
      BigInt(matchday),
      slotTokenIds.map((id) => BigInt(id || "0")),
      formationIndex,
      captainIdx,
      viceIdx,
      chipId,
    ] as const,
  } as const;

  const formation = FORMATIONS[formationIndex];

  const CHIP_OPTIONS: { label: string; value: ChipId }[] = [
    { label: "None", value: ChipId.None },
    { label: "Triple Captain", value: ChipId.TripleCaptain },
    { label: "Doubler", value: ChipId.Doubler },
    { label: "Wildcard", value: ChipId.Wildcard },
    { label: "Free Hit", value: ChipId.FreeHit },
  ];

  const needsMoreCards = !loadingCards && cards.length < LINEUP_SIZE;
  const filledCount = slotTokenIds.filter(Boolean).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex max-w-2xl flex-col gap-8">
      {/* Page heading */}
      <SectionHeading
        kicker="Matchday lineup"
        title="Pick your squad"
        action={
          <Link href="/play/builder" className={buttonClasses("secondary", "sm")}>
            Open full builder
          </Link>
        }
      />

      {/* No wallet notice */}
      {!address && (
        <Panel variant="outline" className="px-4 py-3">
          <p className="text-sm text-ink-2">Connect your wallet to build a lineup.</p>
        </Panel>
      )}

      {/* Matchday + formation row */}
      <Panel variant="paper" className="p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="matchday-select">
              Matchday
            </label>
            <select
              id="matchday-select"
              className={FORM_CONTROL}
              value={matchday}
              onChange={(e) => setMatchday(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  Matchday {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="formation-select">
              Formation
            </label>
            <select
              id="formation-select"
              className={FORM_CONTROL}
              value={formationIndex}
              onChange={(e) => handleFormationChange(Number(e.target.value))}
            >
              {FORMATIONS.map((f, i) => (
                <option key={f.name} value={i}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Squad readiness indicator */}
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Squad
            </span>
            {loadingCards ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <Pill tone={filledCount === LINEUP_SIZE ? "ok" : filledCount > 0 ? "warn" : "neutral"}>
                {filledCount}/{LINEUP_SIZE} filled
              </Pill>
            )}
          </div>
        </div>
      </Panel>

      {/* Cards error */}
      {cardsError && (
        <Pill tone="danger" className="px-4 py-2 rounded-sm text-xs">
          Could not load cards: {cardsError}
        </Pill>
      )}

      {/* Not enough cards */}
      {needsMoreCards && address && (
        <EmptyState
          icon="🃏"
          title="Not enough cards"
          hint={`You need ${LINEUP_SIZE} controllable cards to commit a lineup. You currently have ${cards.length}.`}
          action={
            <Link href="/rentals" className={buttonClasses("secondary", "sm")}>
              Rent cards
            </Link>
          }
        />
      )}

      {/* Slot selectors */}
      {!needsMoreCards && (
        <Panel variant="paper" className="p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Assign cards to positions
          </h2>
          <div className="flex flex-col gap-2.5">
            {loadingCards
              ? Array.from({ length: LINEUP_SIZE }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))
              : formation.slots.map((pos, i) => (
                  <SlotSelect
                    key={i}
                    slotIndex={i}
                    position={pos}
                    selectedTokenId={slotTokenIds[i]}
                    cards={cards}
                    onSelect={handleSlotSelect}
                  />
                ))}
          </div>
        </Panel>
      )}

      {/* Captain + Vice pickers */}
      {allFilled && (
        <Panel variant="paper" className="p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Armband
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-5">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="captain-select">
                Captain
              </label>
              <select
                id="captain-select"
                className={FORM_CONTROL}
                value={captainIdx}
                onChange={(e) => setCaptainIdx(Number(e.target.value))}
              >
                {slotTokenIds.map((id, i) => (
                  <option key={i} value={i} disabled={i === viceIdx}>
                    Slot {i + 1} — {formation.slots[i]} #{id.slice(-6)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="vice-select">
                Vice Captain
              </label>
              <select
                id="vice-select"
                className={FORM_CONTROL}
                value={viceIdx}
                onChange={(e) => setViceIdx(Number(e.target.value))}
              >
                {slotTokenIds.map((id, i) => (
                  <option key={i} value={i} disabled={i === captainIdx}>
                    Slot {i + 1} — {formation.slots[i]} #{id.slice(-6)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Panel>
      )}

      {/* Chip selector */}
      <Panel variant="paper" className="p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="chip-select">
            Chip
          </label>
          <select
            id="chip-select"
            className={FORM_CONTROL}
            value={chipId}
            onChange={(e) => setChipId(Number(e.target.value) as ChipId)}
          >
            {CHIP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {/* Validation errors */}
      {allFilled && !validation.ok && (
        <section aria-label="Lineup validation errors">
          <div className="flex flex-col gap-1.5">
            {validation.errors.map((err, i) => (
              <Pill key={i} tone="danger" className="w-fit px-3 py-1 text-xs">
                {err}
              </Pill>
            ))}
          </div>
        </section>
      )}

      {/* Commit section */}
      {!needsMoreCards && allFilled && validation.ok && address && (
        <Panel variant="ink" className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-on-panel">
              Ready to commit
            </p>
            <Pill tone="cobalt">Matchday {matchday}</Pill>
          </div>
          <TxButton
            request={commitRequest}
            label={`Commit lineup — Matchday ${matchday}`}
            onSuccess={(hash) => {
              console.info("LineupCommitted tx:", hash);
            }}
          />
        </Panel>
      )}

      {/* No-wallet fallback when all slots filled */}
      {!address && allFilled && (
        <p className="text-sm text-muted">Connect a wallet to commit this lineup.</p>
      )}
    </main>
  );
}
