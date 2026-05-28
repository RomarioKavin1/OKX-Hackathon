"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { cx } from "./ui";

const NAV_LINKS = [
  { href: "/play", label: "Play" },
  { href: "/schedule", label: "Cup" },
  { href: "/packs", label: "Packs" },
  { href: "/market", label: "Market" },
  { href: "/rentals", label: "Rentals" },
  { href: "/contests", label: "Contests" },
  { href: "/portfolio", label: "Squad" },
  { href: "/leaderboard", label: "Table" },
  { href: "/transparency", label: "Proof" },
] as const;

/** The PANENKA wordmark: a chipped-ball mark + condensed display type. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="PANENKA home"
      className={cx("group flex items-center gap-2 whitespace-nowrap", className)}
    >
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full bg-flame text-on-panel shadow-sticker transition-transform duration-200 [transition-timing-function:var(--ease-out-expo)] group-hover:-translate-y-0.5"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7l2.6 1.9-1 3.1H10.4l-1-3.1L12 7z" fill="currentColor" />
        </svg>
      </span>
      <span className="display text-xl leading-none text-ink">PANENKA</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40">
      <div aria-hidden className="h-0.5 w-full bg-flame" />
      <nav
        aria-label="Main navigation"
        className="flex w-full items-center justify-between gap-4 border-b border-line bg-paper/85 px-4 py-2.5 backdrop-blur-md sm:px-6"
      >
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          <Wordmark className="mr-3" />
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative rounded-sm px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                  active
                    ? "text-ink"
                    : "text-muted hover:text-ink hover:bg-paper-3",
                )}
              >
                {label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-cobalt"
                  />
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex-shrink-0">
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}