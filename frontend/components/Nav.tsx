import Link from "next/link";
import { WalletButton } from "./WalletButton";

const NAV_LINKS = [
  { label: "Play", href: "/play" },
  { label: "Contests", href: "/contests" },
  { label: "Marketplace", href: "/market" },
  { label: "Rentals", href: "/rentals" },
  { label: "Packs", href: "/packs" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Transparency", href: "/transparency" },
] as const;

export function Nav() {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-40 border-b border-foreground/10 bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        {/* Brand */}
        <Link
          href="/"
          className="mr-4 text-lg font-bold tracking-tight text-pitch-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
        >
          ManagerCup
        </Link>

        {/* Nav links */}
        <ul className="flex items-center gap-1 overflow-x-auto" role="list">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <Link
                href={href}
                className="rounded px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Spacer */}
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
