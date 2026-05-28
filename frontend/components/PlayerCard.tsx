/**
 * PlayerCard — the PANENKA collectible sticker.
 *
 * The product's emotional core: a player rendered as a Panini-style card with
 * rarity-driven treatment (Common → Rare → Super Rare → Unique foil). Used on
 * market, portfolio, packs, and the home showcase. Presentational + server-safe.
 *
 * No player photographs exist (likeness rights are an open product decision), so
 * identity is conveyed by a kit-colored crest disc + initials + national flag.
 */
import type { ReactNode } from "react";
import { NATION_COLOR, NATION_FLAG, NATION_NAME, type Nation } from "@/lib/data/nations";
import { TIER_META, type TierId, cx } from "./ui";

export interface PlayerCardProps {
  name: string;
  nation: Nation;
  position: "GK" | "DEF" | "MID" | "FWD";
  tier: TierId;
  /** Overall rating 0–99; if omitted, derived from stats average. */
  rating?: number;
  stats?: { pace: number; shooting: number; passing: number; defense: number; physical: number };
  size?: "sm" | "md";
  selected?: boolean;
  dimmed?: boolean;
  /** Optional footer slot (price, action, stamina, etc.) */
  footer?: ReactNode;
  /** Optional top-right corner slot (badge, checkbox). */
  corner?: ReactNode;
  className?: string;
}

const TIER_BORDER: Record<TierId, string> = {
  0: "border-line-2",
  1: "border-cobalt/55",
  2: "border-violet/55",
  3: "border-gold/70",
};

const TIER_RIBBON: Record<TierId, string> = {
  0: "bg-paper-3 text-ink-2",
  1: "bg-cobalt text-on-panel",
  2: "bg-violet text-on-panel",
  3: "foil text-[color:oklch(0.22_0.02_265)]",
};

function initials(name: string): string {
  const parts = name.replace(/[.''-]/g, " ").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function overall(p: PlayerCardProps): number {
  if (p.rating != null) return p.rating;
  if (!p.stats) return 0;
  const { pace, shooting, passing, defense, physical } = p.stats;
  return Math.round((pace + shooting + passing + defense + physical) / 5);
}

export function PlayerCard(props: PlayerCardProps) {
  const { name, nation, position, tier, size = "md", selected, dimmed, footer, corner, className } = props;
  const meta = TIER_META[tier];
  const ovr = overall(props);
  const sm = size === "sm";

  return (
    <article
      aria-label={`${name}, ${NATION_NAME[nation]}, ${meta.name}`}
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-card border-2 bg-paper-2 text-ink shadow-sticker",
        "transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)]",
        "hover:-translate-y-1 hover:shadow-lift focus-within:-translate-y-1 focus-within:shadow-lift",
        tier === 3 && "foil-sheen",
        TIER_BORDER[tier],
        selected && "ring-2 ring-cobalt ring-offset-2 ring-offset-paper",
        dimmed && "opacity-45 saturate-50",
        className,
      )}
    >
      {/* rarity ribbon */}
      <div
        className={cx(
          "flex items-center justify-between px-2.5 font-semibold uppercase tracking-wide",
          sm ? "py-1 text-[10px]" : "py-1.5 text-xs",
          TIER_RIBBON[tier],
        )}
      >
        <span className="flex items-center gap-1">
          {meta.foil && <span aria-hidden>✦</span>}
          {meta.name}
        </span>
        <span className="font-mono opacity-80">{position}</span>
      </div>

      {corner && <div className="absolute right-2 top-9 z-10">{corner}</div>}

      {/* crest + rating */}
      <div className={cx("flex items-center gap-3 px-3", sm ? "py-2.5" : "py-3.5")}>
        <span
          aria-hidden
          className={cx(
            "grid shrink-0 place-items-center rounded-full font-display text-ink/85 shadow-inner ring-1 ring-black/5",
            sm ? "size-10 text-base" : "size-12 text-lg",
          )}
          style={{ background: NATION_COLOR[nation] }}
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={cx("display tabular-nums leading-none text-ink", sm ? "text-2xl" : "text-3xl")}>
              {ovr || "—"}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">OVR</span>
          </div>
          <p className={cx("truncate font-semibold leading-tight text-ink", sm ? "text-xs" : "text-sm")}>
            {name}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <span aria-hidden>{NATION_FLAG[nation]}</span>
            {NATION_NAME[nation]}
          </p>
        </div>
      </div>

      {footer && (
        <div className="mt-auto border-t border-line px-3 py-2 text-xs">{footer}</div>
      )}
    </article>
  );
}