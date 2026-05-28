import Link from "next/link";
import { WalletButton } from "./WalletButton";

const NAV_LINKS = [
  { href: "/play", label: "Play" },
  { href: "/contests", label: "Contests" },
  { href: "/market", label: "Marketplace" },
  { href: "/rentals", label: "Rentals" },
  { href: "/packs", label: "Packs" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/transparency", label: "Transparency" },
] as const;

/**
 * Top navigation bar.
 * Server component — WalletButton is client-only and imported separately.
 */
export function Nav() {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-40 flex w-full items-center justify-between gap-4 border-b bg-background px-6 py-3"
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        <Link
          href="/"
          className="mr-4 text-base font-bold text-[var(--pitch-green)] whitespace-nowrap"
        >
          ManagerCup
        </Link>
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded px-2 py-1 text-sm opacity-80 hover:opacity-100 whitespace-nowrap"
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex-shrink-0">
        <WalletButton />
      </div>
    </nav>
  );
}
