"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { WalletButton } from "@/components/WalletButton";
import { PlayerCard } from "@/components/PlayerCard";
import { Panel, Pill, Stat, buttonClasses, cx } from "@/components/ui";
import { usdcBalance } from "@/lib/actions/reads";
import { fmtUsdc } from "@/lib/business/format";
import { PLAYERS, tierStats } from "@/lib/data/players";
import { Tier } from "@/lib/types";
import type { TierId } from "@/components/ui";
import type { Address } from "viem";

const showcasePlayer = (key: string) => PLAYERS.find((p) => p.key === key)!;

/** Real catalog players, dressed as a fanned collectible spread. */
const SHOWCASE: { key: string; tier: TierId; pos: string }[] = [
  { key: "BRA-11-Vinicius", tier: 1, pos: "left-0 top-10 -rotate-12" },
  { key: "ENG-8-Bellingham", tier: 2, pos: "left-1/2 top-2 -translate-x-1/2 -rotate-3 z-20" },
  { key: "FRA-10-Mbappe", tier: 3, pos: "right-0 top-8 rotate-12 z-10" },
];

const ACTIONS = [
  { href: "/packs", label: "Open packs", hint: "Rip a pack, reveal your cards", accent: "flame" as const },
  { href: "/market", label: "Browse the market", hint: "Buy and sell player cards", accent: "cobalt" as const },
  { href: "/rentals", label: "Rent a star", hint: "One matchday, from ~$0.30", accent: "violet" as const },
  { href: "/portfolio", label: "Your squad", hint: "Cards you own and rent", accent: "neutral" as const },
];

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!address) return;
    usdcBalance(address).then(setBalance).catch(() => setBalance(null));
  }, [address]);

  const signedIn = ready && authenticated && address;

  return (
    <div className="flex flex-col gap-10 py-2">
      {/* ---------------------------------- HERO --------------------------------- */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <Pill tone="flame">
            <span aria-hidden>●</span> 2026 FIFA World Cup · X Layer
          </Pill>
          <h1 className="display text-5xl leading-[0.9] text-ink sm:text-6xl lg:text-7xl">
            Own your XI.<br />
            <span className="text-cobalt-ink">Rent the legends.</span>
          </h1>
          <p className="max-w-md text-base text-ink-2">
            Daily fantasy football where every player is a card you actually own.
            Set a lineup each matchday, rent a superstar for a single match, and
            score on real results. Prizes settle in USDC, on-chain.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Link href="/play" className={buttonClasses("cta", "lg")}>
                Set your lineup →
              </Link>
            ) : ready ? (
              <WalletButton />
            ) : (
              <div className="h-12 w-40 animate-pulse rounded-sm bg-paper-3" />
            )}
            <Link href="/demo" className={buttonClasses("secondary", "lg")}>
              Watch the on-chain demo
            </Link>
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <Stat value="5" label="Free starter cards" />
            </div>
            <div>
              <Stat value="~$0.30" label="To rent a star" />
            </div>
            <div>
              <Stat value="USDC" label="Prizes, on-chain" />
            </div>
          </dl>
        </div>

        {/* fanned card showcase */}
        <div className="relative mx-auto h-80 w-full max-w-sm">
          <div aria-hidden className="hairline-grid absolute inset-4 rounded-card opacity-40" />
          {SHOWCASE.map(({ key, tier, pos }) => {
            const p = showcasePlayer(key);
            return (
              <div key={key} className={cx("absolute w-36 transition-transform duration-300 hover:z-30 [transition-timing-function:var(--ease-out-expo)]", pos)}>
                <PlayerCard
                  name={p.name}
                  nation={p.nation}
                  position={p.position}
                  tier={tier}
                  stats={tierStats(p.base, tier as unknown as Tier)}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------ DASHBOARD -------------------------------- */}
      {signedIn ? (
        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          {/* wallet scoreboard */}
          <Panel variant="ink" className="flex flex-col justify-between gap-6 p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
                Your balance
              </span>
              <Pill tone="cobalt">X Layer Testnet</Pill>
            </div>
            <div>
              <div className="display text-5xl tabular-nums text-on-panel">
                {balance != null ? fmtUsdc(balance) : "…"}
              </div>
              <div className="mt-1 text-sm text-on-panel-muted">USDC available</div>
            </div>
            <p className="truncate font-mono text-xs text-on-panel-muted" title={address}>
              {address}
            </p>
          </Panel>

          {/* quick actions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/play"
              className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-card border border-cobalt/30 bg-cobalt/10 p-5 transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-1 hover:shadow-lift sm:row-span-2"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cobalt-ink">Next matchday</p>
                <h3 className="display mt-2 text-3xl text-ink">Set your XI</h3>
                <p className="mt-2 max-w-[22ch] text-sm text-ink-2">
                  Pick a formation, name a captain, play a chip. Commit before kickoff.
                </p>
              </div>
              <span className="text-sm font-semibold text-cobalt-ink">Build lineup →</span>
            </Link>

            {ACTIONS.slice(0, 3).map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center justify-between gap-3 rounded-card border border-line bg-paper-2 p-4 shadow-sticker transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-1 hover:shadow-lift"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{a.label}</h3>
                  <p className="truncate text-xs text-muted">{a.hint}</p>
                </div>
                <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        /* logged-out: how it works */
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { n: "01", t: "Claim your squad", d: "Connect and mint a free 5-card starter XI. One per wallet, airdropped on X Layer." },
            { n: "02", t: "Rent + rotate", d: "Buy packs, trade on the market, or rent a superstar for a single matchday." },
            { n: "03", t: "Score + win", d: "Commit your XI, score on real results via a verifiable oracle, claim USDC." },
          ].map((s) => (
            <Panel key={s.n} className="flex flex-col gap-2 p-5">
              <span className="display text-2xl text-flame">{s.n}</span>
              <h3 className="font-semibold text-ink">{s.t}</h3>
              <p className="text-sm text-muted">{s.d}</p>
            </Panel>
          ))}
        </section>
      )}

      {/* ------------------------------- TRUST STRIP ----------------------------- */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-paper-2 px-5 py-4">
        <p className="text-sm text-ink-2">
          Scoring is deterministic and public. Re-run it yourself, or audit the oracle.
        </p>
        <div className="flex gap-2">
          <Link href="/transparency" className={buttonClasses("secondary", "sm")}>Proof &amp; oracle</Link>
          <Link href="/leaderboard" className={buttonClasses("ghost", "sm")}>Table</Link>
        </div>
      </section>
    </div>
  );
}