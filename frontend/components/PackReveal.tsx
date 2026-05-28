"use client";

/**
 * PackReveal — animated sticker-pack reveal for up to 5 cards.
 *
 * Animation: each card starts face-down (pack back) and reveals face-up with
 * a staggered Y-axis flip using --ease-out-expo. No layout properties animated.
 * Unique cards get the foil treatment on the front face.
 */

import type { ReactNode } from "react";
import { Tier, TIER_NAME } from "@/lib/types";
import { TIER_META, cx, Button } from "@/components/ui";

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

// ── Tier front-face styling: uses design tokens ────────────────────────────────

const TIER_FRONT: Record<Tier, { border: string; ribbon: string; ribbonText: string }> = {
  [Tier.Common]:    {
    border: "border-line-2",
    ribbon: "bg-paper-3 text-ink-2",
    ribbonText: "",
  },
  [Tier.Rare]:      {
    border: "border-cobalt/55",
    ribbon: "bg-cobalt text-on-panel",
    ribbonText: "",
  },
  [Tier.SuperRare]: {
    border: "border-violet/55",
    ribbon: "bg-violet text-on-panel",
    ribbonText: "",
  },
  [Tier.Unique]:    {
    border: "border-gold/70",
    ribbon: "foil text-[color:oklch(0.22_0.02_265)]",
    ribbonText: "✦ ",
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FlipCardProps {
  card: RevealedCard;
  /** Zero-based index, drives stagger delay */
  index: number;
}

function FlipCard({ card, index }: FlipCardProps) {
  const tier = card.tier ?? Tier.Common;
  const front = TIER_FRONT[tier];
  const meta = TIER_META[tier];
  // Stagger: 150 ms per card, ease-out-expo throughout
  const delayMs = index * 150;

  return (
    <div
      role="img"
      aria-label={`Card #${card.tokenId} — ${TIER_NAME[tier]}`}
      style={{
        perspective: "900px",
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
          animation: `packReveal 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms both`,
        }}
      >
        {/* ── Back face: pack sleeve ── */}
        <div
          className="rounded-card border-2 border-line-2 bg-panel grain flex flex-col items-center justify-center gap-2"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          {/* Simple pack pattern: two horizontal rules + logo area */}
          <div
            aria-hidden
            className="w-10 h-10 rounded-full border-2 border-on-panel/20 flex items-center justify-center"
          >
            <span className="text-on-panel/40 text-xl select-none font-display">P</span>
          </div>
          <div aria-hidden className="w-12 h-px bg-on-panel/15" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-panel/30 select-none">
            Panenka
          </span>
        </div>

        {/* ── Front face: revealed card ── */}
        <div
          className={cx(
            "rounded-card border-2 bg-paper-2 flex flex-col overflow-hidden shadow-lift",
            front.border,
            tier === Tier.Unique && "foil-sheen",
          )}
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* Rarity ribbon — mirrors PlayerCard pattern */}
          <div
            className={cx(
              "flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              front.ribbon,
            )}
          >
            <span>{front.ribbonText}{meta.name}</span>
            <span className="opacity-70 font-mono">{meta.abbr}</span>
          </div>

          {/* Card body */}
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-2">
            {/* Tier icon */}
            <span className="text-2xl select-none" aria-hidden>
              {tier === Tier.Unique
                ? "✦"
                : tier === Tier.SuperRare
                  ? "◆"
                  : tier === Tier.Rare
                    ? "◈"
                    : "○"}
            </span>
          </div>

          {/* Token ID footer */}
          <div className="border-t border-line px-2 py-1.5">
            <span className="font-mono text-[9px] text-muted break-all leading-tight">
              #{card.tokenId.toString()}
            </span>
          </div>
        </div>
      </div>

      {/* Keyframe — scoped animation name, ease-out-expo curve */}
      <style>{`
        @keyframes packReveal {
          0%   { transform: rotateY(0deg) scale(0.92); opacity: 0.6; }
          40%  { opacity: 1; }
          100% { transform: rotateY(180deg) scale(1); }
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-panel/95 p-6"
      style={{ backdropFilter: "blur(2px)" }}
    >
      {/* Heading */}
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-on-panel-muted">
          Sticker pack
        </p>
        <h2 className="display text-4xl text-on-panel">
          Pack Revealed
        </h2>
      </div>

      {/* Cards row */}
      <div className="flex flex-wrap items-end justify-center gap-4">
        {cards.map((card, i) => (
          <FlipCard key={card.tokenId.toString()} card={card} index={i} />
        ))}
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <Button
          type="button"
          variant="cta"
          size="lg"
          onClick={onDismiss}
        >
          Collect cards
        </Button>
      )}
    </div>
  );
}
