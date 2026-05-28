/**
 * PANENKA UI primitives — the shared component vocabulary.
 *
 * Presentational + server-safe (no hooks, no "use client"). Pages compose these
 * so buttons, panels, pills, headings, and rarity treatment stay identical
 * across every surface. Tokens come from globals.css.
 */
import type { ReactNode, ButtonHTMLAttributes } from "react";

/* ----------------------------- class helper ----------------------------- */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------- Button --------------------------------- */
type ButtonVariant = "primary" | "cta" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-sm select-none " +
  "transition-[transform,background-color,border-color,color,box-shadow] duration-150 " +
  "[transition-timing-function:var(--ease-out-expo)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-45";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-cobalt text-on-panel hover:brightness-110 shadow-sticker hover:shadow-lift",
  cta:
    "bg-flame text-on-panel hover:brightness-110 shadow-sticker hover:shadow-lift",
  secondary:
    "bg-paper-2 text-ink border border-line-2 hover:border-ink-2 hover:bg-paper-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-3",
  danger: "bg-danger text-on-panel hover:brightness-110 shadow-sticker",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent opacity-70",
        className,
      )}
    />
  );
}

/* --------------------------------- Panel --------------------------------- */
type PanelVariant = "paper" | "ink" | "outline" | "sunken";

const PANEL_VARIANT: Record<PanelVariant, string> = {
  paper: "bg-paper-2 text-ink border border-line shadow-sticker",
  ink: "grain bg-panel text-on-panel border border-[color:var(--panel-2)]",
  outline: "bg-transparent text-ink border border-line",
  sunken: "bg-paper-3 text-ink border border-line",
};

export function Panel({
  variant = "paper",
  className,
  children,
}: {
  variant?: PanelVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("rounded-card", PANEL_VARIANT[variant], className)}>
      {children}
    </div>
  );
}

/* --------------------------------- Pill ---------------------------------- */
type Tone =
  | "neutral"
  | "cobalt"
  | "flame"
  | "gold"
  | "violet"
  | "ok"
  | "warn"
  | "danger";

const PILL_TONE: Record<Tone, string> = {
  neutral: "bg-paper-3 text-ink-2 border-line-2",
  cobalt: "bg-cobalt/12 text-cobalt-ink border-cobalt/30",
  flame: "bg-flame/12 text-flame border-flame/30",
  gold: "bg-gold/18 text-[color:var(--ink)] border-gold/45",
  violet: "bg-violet/12 text-violet border-violet/30",
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/15 text-[color:var(--ink-2)] border-warn/40",
  danger: "bg-danger/12 text-danger border-danger/30",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------- Section heading --------------------------- */
export function SectionHeading({
  kicker,
  title,
  action,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4", className)}>
      <div>
        {kicker && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flame">
            {kicker}
          </p>
        )}
        <h2 className="display text-2xl text-ink sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- Stat block ------------------------------ */
export function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: ReactNode;
  label: string;
  tone?: "ink" | "on-panel";
}) {
  return (
    <div>
      <div
        className={cx(
          "display text-3xl tabular-nums sm:text-4xl",
          tone === "on-panel" ? "text-on-panel" : "text-ink",
        )}
      >
        {value}
      </div>
      <div
        className={cx(
          "mt-0.5 text-xs font-medium uppercase tracking-wide",
          tone === "on-panel" ? "text-on-panel-muted" : "text-muted",
        )}
      >
        {label}
      </div>
    </div>
  );
}

/* --------------------------------- Tiers --------------------------------- */
export type TierId = 0 | 1 | 2 | 3;

export const TIER_META: Record<
  TierId,
  { name: string; tone: Tone; abbr: string; foil: boolean }
> = {
  0: { name: "Common", tone: "neutral", abbr: "C", foil: false },
  1: { name: "Rare", tone: "cobalt", abbr: "R", foil: false },
  2: { name: "Super Rare", tone: "violet", abbr: "SR", foil: false },
  3: { name: "Unique", tone: "gold", abbr: "U", foil: true },
};

export function TierBadge({ tier }: { tier: TierId }) {
  const meta = TIER_META[tier];
  return (
    <Pill tone={meta.tone}>
      {meta.foil && <span aria-hidden>✦</span>}
      {meta.name}
    </Pill>
  );
}

/* ----------------------------- Empty / loading --------------------------- */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Panel variant="sunken" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-3xl opacity-70" aria-hidden>{icon}</div>}
      <p className="display text-xl text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </Panel>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-sm bg-paper-3",
        className,
      )}
    />
  );
}