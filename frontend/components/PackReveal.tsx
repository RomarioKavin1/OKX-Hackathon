"use client";

/**
 * PackReveal — animated card-flip reveal for up to 5 cards.
 *
 * Animation: each card starts face-down and flips to face-up with a staggered
 * CSS 3D flip (rotateY 180°). No new npm dependency; no globals.css edits.
 * Inline styles drive the 3D perspective/transform; Tailwind handles colours.
 */

import { Tier, TIER_NAME } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevealedCard {
  tokenId: bigint;
  tier?: Tier;
}

export interface PackRevealProps {
  /** Token IDs of the revealed cards (up to 5). */
  tokenIds: bigint[];
  /** Optional per-card tier hint; falls back to Common if not provided. */
  tiers?: Tier[];
  /** Called when the user dismisses the reveal overlay. */
  onDismiss?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_COLOUR: Record<Tier, { bg: string; text: string; border: string }> = {
  [Tier.Common]:    { bg: "bg-zinc-700",    text: "text-zinc-100",  border: "border-zinc-500"    },
  [Tier.Rare]:      { bg: "bg-blue-700",    text: "text-blue-100",  border: "border-blue-400"    },
  [Tier.SuperRare]: { bg: "bg-purple-700",  text: "text-purple-100", border: "border-purple-400"  },
  [Tier.Unique]:    { bg: "bg-yellow-600",  text: "text-yellow-50", border: "border-yellow-300"  },
};

// ── Sub-components (module scope — no hook-in-loop; each is a proper component) ──

interface FlipCardProps {
  card: RevealedCard;
  /** Zero-based index, drives stagger delay */
  index: number;
}

function FlipCard({ card, index }: FlipCardProps) {
  const tier = card.tier ?? Tier.Common;
  const colours = TIER_COLOUR[tier];
  // Stagger: 150 ms per card
  const delayMs = index * 150;

  return (
    <div
      role="img"
      aria-label={`Card #${card.tokenId} — ${TIER_NAME[tier]}`}
      style={{
        perspective: "800px",
        width: "120px",
        height: "168px",
        flexShrink: 0,
      }}
    >
      {/* Rotating wrapper */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          animation: `packFlip 0.6s ease-out ${delayMs}ms both`,
        }}
      >
        {/* ── Back face (face-down) ── */}
        <div
          className="rounded-xl border-2 border-zinc-600 bg-zinc-800 flex items-center justify-center"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          <span className="text-3xl select-none" aria-hidden>🃏</span>
        </div>

        {/* ── Front face (revealed) ── */}
        <div
          className={`rounded-xl border-2 ${colours.border} ${colours.bg} ${colours.text} flex flex-col items-center justify-between p-3`}
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <span className="text-xs font-bold uppercase tracking-wide opacity-80">
            {TIER_NAME[tier]}
          </span>
          <span className="text-2xl font-bold select-none" aria-hidden>
            {tier === Tier.Unique ? "🌟" : tier === Tier.SuperRare ? "✨" : tier === Tier.Rare ? "💫" : "⚽"}
          </span>
          <span className="font-mono text-xs break-all text-center opacity-70">
            #{card.tokenId.toString()}
          </span>
        </div>
      </div>

      {/* Keyframe injected inline — scoped by unique animation name. */}
      <style>{`
        @keyframes packFlip {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(180deg); }
        }
      `}</style>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function PackReveal({ tokenIds, tiers, onDismiss }: PackRevealProps) {
  const cards: RevealedCard[] = tokenIds.slice(0, 5).map((tokenId, i) => ({
    tokenId,
    tier: tiers?.[i],
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pack revealed"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/80 p-6"
    >
      <h2 className="text-2xl font-bold text-white tracking-wide">
        Pack Revealed!
      </h2>

      {/* Cards row */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {cards.map((card, i) => (
          <FlipCard key={card.tokenId.toString()} card={card} index={i} />
        ))}
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 rounded-lg bg-white px-6 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Collect cards
        </button>
      )}
    </div>
  );
}
