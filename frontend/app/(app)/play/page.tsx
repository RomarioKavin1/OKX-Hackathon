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

// ── Types ────────────────────────────────────────────────────────────────────

interface PortfolioCard {
  tokenId: string;
  playerId: string;
  tier: number;
  state: string;
}

// ── Module-scope sub-components (avoid "components created during render") ───

interface SlotSelectProps {
  slotIndex: number;
  position: string;
  selectedTokenId: string;
  cards: PortfolioCard[];
  onSelect: (slotIndex: number, tokenId: string) => void;
}

function SlotSelect({ slotIndex, position, selectedTokenId, cards, onSelect }: SlotSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs font-bold text-zinc-500">{position}</span>
      <select
        className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        value={selectedTokenId}
        onChange={(e) => onSelect(slotIndex, e.target.value)}
      >
        <option value="">— pick a card —</option>
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

  // Reset slots when formation changes (slot count is always 11 but positions change)
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
        // controllerOf: if the tokenId is in the controllable set we return the wallet address,
        // otherwise a zero address so the validator rejects it.
        (tokenId) =>
          controllableSet.has(tokenId.toString())
            ? address
            : "0x0000000000000000000000000000000000000000"
      )
    : { ok: false, errors: ["No wallet connected"] };

  // All 11 slots filled
  const allFilled = slotTokenIds.every((id) => id !== "");

  // ── TxButton request for commitLineup ──────────────────────────────────────
  // args: [matchday (uint256), tokenIds (uint256[]), formation (uint8), captainIdx (uint8), viceIdx (uint8), chipId (uint8)]
  // Mirrors writes.ts commitLineup arg order exactly.
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

  // ── Chip options ───────────────────────────────────────────────────────────
  const CHIP_OPTIONS: { label: string; value: ChipId }[] = [
    { label: "None", value: ChipId.None },
    { label: "Triple Captain", value: ChipId.TripleCaptain },
    { label: "Doubler", value: ChipId.Doubler },
    { label: "Wildcard", value: ChipId.Wildcard },
    { label: "Free Hit", value: ChipId.FreeHit },
  ];

  const needsMoreCards = !loadingCards && cards.length < LINEUP_SIZE;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Pick your lineup</h1>
        <p className="text-sm opacity-70">Commit your squad for a matchday to earn points.</p>
      </header>

      {!address && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect your wallet to build a lineup.
        </p>
      )}

      {/* Matchday selector */}
      <section className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="matchday-select">
          Matchday
        </label>
        <select
          id="matchday-select"
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={matchday}
          onChange={(e) => setMatchday(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              Matchday {d}
            </option>
          ))}
        </select>
      </section>

      {/* Cards loading state */}
      {loadingCards && <p className="text-sm opacity-60">Loading your cards…</p>}
      {cardsError && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load cards: {cardsError}
        </p>
      )}

      {/* Not enough cards CTA */}
      {needsMoreCards && address && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            You need {LINEUP_SIZE} controllable cards to commit a lineup. You currently have{" "}
            <strong>{cards.length}</strong>.
          </p>
          <Link
            href="/rentals"
            className="mt-2 inline-block text-sm font-medium text-amber-900 underline"
          >
            Rent more cards →
          </Link>
        </div>
      )}

      {/* Formation picker */}
      <section className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="formation-select">
          Formation
        </label>
        <select
          id="formation-select"
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={formationIndex}
          onChange={(e) => handleFormationChange(Number(e.target.value))}
        >
          {FORMATIONS.map((f, i) => (
            <option key={f.name} value={i}>
              {f.name}
            </option>
          ))}
        </select>
      </section>

      {/* Slot selectors */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Assign cards to positions</h2>
        {formation.slots.map((pos, i) => (
          <SlotSelect
            key={i}
            slotIndex={i}
            position={pos}
            selectedTokenId={slotTokenIds[i]}
            cards={cards}
            onSelect={handleSlotSelect}
          />
        ))}
      </section>

      {/* Captain + Vice pickers */}
      {allFilled && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm font-medium" htmlFor="captain-select">
              Captain
            </label>
            <select
              id="captain-select"
              className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm font-medium" htmlFor="vice-select">
              Vice Captain
            </label>
            <select
              id="vice-select"
              className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
        </section>
      )}

      {/* Chip selector */}
      <section className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="chip-select">
          Chip
        </label>
        <select
          id="chip-select"
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={chipId}
          onChange={(e) => setChipId(Number(e.target.value) as ChipId)}
        >
          {CHIP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      {/* Validation errors */}
      {allFilled && !validation.ok && (
        <section className="rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-xs font-semibold text-red-700">Lineup errors:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {validation.errors.map((err, i) => (
              <li key={i} className="text-xs text-red-600">
                {err}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Commit button — only if enough cards, all filled, and validation passes */}
      {!needsMoreCards && allFilled && validation.ok && address && (
        <section>
          <TxButton
            request={commitRequest}
            label={`Commit lineup — Matchday ${matchday}`}
            onSuccess={(hash) => {
              console.info("LineupCommitted tx:", hash);
            }}
          />
        </section>
      )}

      {/* No-wallet fallback */}
      {!address && allFilled && (
        <p className="text-sm opacity-60">Connect a wallet to commit this lineup.</p>
      )}
    </main>
  );
}
