"use client";

/**
 * /leaderboard — Season standings + claim
 *
 * Shows the aggregated season leaderboard fetched from /api/season.
 * Connected wallets can see their own season rank and, if the season
 * has been finalized (ScoreOracle.seasonFinalized()), claim their USDC prize
 * via a TxButton → SeasonLeaderboard.claim(amount, proof).
 *
 * ── Data flow ───────────────────────────────────────────────────────────────
 *  GET /api/season          → top-50 standings list (no wallet)
 *  GET /api/season?wallet=  → wallet's rank + proof + amount
 *
 * ── Claim flow ──────────────────────────────────────────────────────────────
 *  SeasonLeaderboard.claim(uint256 amount, bytes32[] proof)
 *  writes.ts: claimSeason(wallet, amount, proof)   ← arg order: wallet first
 *  TxButton delegates signing to the Privy wallet client.
 *
 * ── Season finalized guard ──────────────────────────────────────────────────
 *  The "Claim" button is shown only when seasonFinalized() === true on-chain.
 *  When not finalized, a status banner explains the season is still in progress.
 */

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { fmtUsdc } from "@/lib/business/format";
import { publicClient } from "@/lib/clients";
import {
  Button,
  EmptyState,
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  Stat,
  cx,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StandingRow {
  rank: number;
  wallet: string;
  score: number;
  amount: string;
}

interface WalletEntry {
  rank: number | null;
  score: number;
  amount: string;
  proof: string[];
  eligible?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Rank 1-3 accent: gold / violet / cobalt. Returns Tailwind text + bg classes. */
function podiumStyle(rank: number): { cell: string; rankText: string } {
  if (rank === 1) return { cell: "bg-gold/10", rankText: "text-[color:var(--gold)]" };
  if (rank === 2) return { cell: "bg-violet/10", rankText: "text-violet" };
  if (rank === 3) return { cell: "bg-cobalt/8", rankText: "text-cobalt-ink" };
  return { cell: "", rankText: "text-muted" };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { wallets } = useWallets();
  const connectedAddress = wallets[0]?.address as Address | undefined;

  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [walletEntry, setWalletEntry] = useState<WalletEntry | null>(null);
  const [isFinalized, setIsFinalized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load standings + finalization status ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Season standings (top-50)
        const standingsRes = await fetch("/api/season?limit=50");
        if (!standingsRes.ok) {
          throw new Error(`/api/season failed: ${standingsRes.status}`);
        }
        const standingsData = (await standingsRes.json()) as {
          standings?: StandingRow[];
          error?: string;
        };
        if (!cancelled) {
          setStandings(standingsData.standings ?? []);
        }

        // On-chain seasonFinalized check
        try {
          const finalized = await publicClient.readContract({
            address: ADDRESSES.ScoreOracle,
            abi: ABIS.ScoreOracle,
            functionName: "seasonFinalized",
            args: [],
          });
          if (!cancelled) setIsFinalized(finalized as boolean);
        } catch {
          // If the call reverts (e.g. function not yet added to ABI or season not started)
          if (!cancelled) setIsFinalized(false);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load wallet-specific entry when wallet connects ───────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      if (!connectedAddress) {
        if (!cancelled) setWalletEntry(null);
        return;
      }
      try {
        const res = await fetch(`/api/season?wallet=${connectedAddress}`);
        if (!res.ok) {
          if (!cancelled) setWalletEntry(null);
          return;
        }
        const data = (await res.json()) as WalletEntry | { eligible: false };
        if (!cancelled) {
          if ("eligible" in data && data.eligible === false && !("rank" in data)) {
            setWalletEntry(null);
          } else {
            setWalletEntry(data as WalletEntry);
          }
        }
      } catch {
        // Silently fail wallet lookup
      }
    }

    loadWallet();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress]);

  // ── Claim TxRequest ───────────────────────────────────────────────────────
  const claimRequest =
    walletEntry && walletEntry.amount && BigInt(walletEntry.amount) > 0n
      ? ({
          address: ADDRESSES.SeasonLeaderboard,
          abi: ABIS.SeasonLeaderboard,
          functionName: "claim",
          args: [
            BigInt(walletEntry.amount),
            walletEntry.proof as `0x${string}`[],
          ] as const,
        } as const)
      : null;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="flex flex-col gap-8 py-2">
        <SectionHeading
          kicker="2026 World Cup"
          title="Season Table"
        />
        <Panel variant="paper" className="overflow-hidden">
          <div className="flex flex-col gap-0 divide-y divide-line">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-6 shrink-0" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-14" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Panel>
      </main>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="flex flex-col gap-8 py-2">
        <SectionHeading
          kicker="2026 World Cup"
          title="Season Table"
        />
        <EmptyState
          icon="⚠"
          title="Could not load standings"
          hint={`Network or API error: ${error}`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          }
        />
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col gap-8 py-2">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <SectionHeading
        kicker="2026 World Cup"
        title="Season Table"
        action={
          isFinalized === true ? (
            <Pill tone="ok">Finalized</Pill>
          ) : isFinalized === false ? (
            <Pill tone="warn">In progress</Pill>
          ) : null
        }
      />

      {/* ── Season status banners ────────────────────────────────────────── */}
      {isFinalized === false && (
        <Panel variant="outline" className="px-4 py-3">
          <div role="status">
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Season in progress.</span>{" "}
              Standings shown are the latest computed projection. Claims will be
              available once the oracle posts the final Merkle root.
            </p>
          </div>
        </Panel>
      )}
      {isFinalized === true && (
        <Panel variant="outline" className="border-ok/40 bg-ok/6 px-4 py-3">
          <div role="status">
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Season finalized.</span>{" "}
              Eligible wallets can claim their USDC prize below.
            </p>
          </div>
        </Panel>
      )}

      {/* ── My season result ─────────────────────────────────────────────── */}
      {connectedAddress && walletEntry && (
        <section aria-labelledby="my-season-heading">
          <h2
            id="my-season-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted"
          >
            Your result
          </h2>
          <Panel variant="ink" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-6">
              {/* stats row */}
              <dl className="flex flex-wrap gap-8">
                <div>
                  <Stat
                    tone="on-panel"
                    value={
                      walletEntry.rank !== null ? (
                        <span className="flex items-baseline gap-2">
                          <span>#{walletEntry.rank}</span>
                          {walletEntry.rank <= 3 && (
                            <Pill
                              tone={
                                walletEntry.rank === 1
                                  ? "gold"
                                  : walletEntry.rank === 2
                                    ? "violet"
                                    : "cobalt"
                              }
                              className="mb-1 self-end text-[10px]"
                            >
                              Top {walletEntry.rank}
                            </Pill>
                          )}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                    label="Rank"
                  />
                </div>
                <div>
                  <Stat
                    tone="on-panel"
                    value={walletEntry.score.toFixed(1)}
                    label="Season pts"
                  />
                </div>
                <div>
                  <Stat
                    tone="on-panel"
                    value={
                      BigInt(walletEntry.amount ?? "0") > 0n
                        ? `${fmtUsdc(BigInt(walletEntry.amount))} USDC`
                        : "—"
                    }
                    label="Prize"
                  />
                </div>
              </dl>

              {/* claim / status */}
              <div className="flex flex-col items-end gap-2">
                {isFinalized && claimRequest && (
                  <TxButton
                    request={claimRequest}
                    label="Claim season prize"
                    onSuccess={(hash) => {
                      // Optimistic UI: clear amount so the button disappears
                      setWalletEntry((prev) =>
                        prev ? { ...prev, amount: "0" } : prev,
                      );
                      console.info("[leaderboard] claimSeason mined:", hash);
                    }}
                  />
                )}
                {isFinalized &&
                  BigInt(walletEntry.amount ?? "0") === 0n &&
                  walletEntry.rank !== null && (
                    <p className="text-xs text-on-panel-muted">
                      Rank outside the top-100 paid positions — no prize to claim.
                    </p>
                  )}
                {!isFinalized && BigInt(walletEntry.amount ?? "0") > 0n && (
                  <p className="text-xs text-on-panel-muted">
                    Claiming opens once the oracle posts the final root.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </section>
      )}

      {!connectedAddress && (
        <p className="text-sm text-muted">
          Connect your wallet to see your season rank and claim your prize.
        </p>
      )}

      {/* ── Standings table ──────────────────────────────────────────────── */}
      <section aria-labelledby="standings-heading">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2
            id="standings-heading"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
          >
            Top {standings.length > 0 ? standings.length : 50} managers
          </h2>
          {standings.length > 0 && (
            <p className="text-xs text-muted">Ranks 101+ are not paid</p>
          )}
        </div>

        {standings.length === 0 ? (
          <EmptyState
            icon="⚽"
            title="No standings yet"
            hint="The World Cup kicks off June 11, 2026. Standings will appear once matchdays have been scored and aggregated by the oracle."
          />
        ) : (
          <Panel variant="paper" className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                aria-label="Season standings"
              >
                <thead>
                  <tr className="border-b border-line-2 bg-paper-3">
                    <th
                      scope="col"
                      className="py-2.5 pl-4 pr-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      Rank
                    </th>
                    <th
                      scope="col"
                      className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      Manager
                    </th>
                    <th
                      scope="col"
                      className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      Points
                    </th>
                    <th
                      scope="col"
                      className="py-2.5 pl-3 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      Prize (USDC)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {standings.map((row) => {
                    const isMe =
                      connectedAddress &&
                      row.wallet.toLowerCase() ===
                        connectedAddress.toLowerCase();
                    const { cell, rankText } = podiumStyle(row.rank);

                    return (
                      <tr
                        key={row.wallet}
                        className={cx(
                          "transition-colors duration-100",
                          isMe
                            ? "bg-cobalt/8 font-semibold"
                            : row.rank <= 3
                              ? cell
                              : "hover:bg-paper-3",
                          // podium rows get their cell bg unless it's the current user
                          isMe ? "" : cell,
                        )}
                        aria-current={isMe ? "true" : undefined}
                      >
                        {/* Rank */}
                        <td className="py-2.5 pl-4 pr-2 tabular-nums">
                          <span
                            className={cx(
                              "font-mono text-sm font-semibold",
                              rankText,
                            )}
                          >
                            {row.rank <= 3 ? (
                              <span
                                aria-label={`Rank ${row.rank}`}
                                className="display text-base"
                              >
                                {row.rank}
                              </span>
                            ) : (
                              <span className="text-muted">#{row.rank}</span>
                            )}
                          </span>
                        </td>

                        {/* Manager address */}
                        <td className="py-2.5 px-3">
                          <span className="flex items-center gap-2">
                            <span
                              className="font-mono text-xs text-ink-2"
                              title={row.wallet}
                            >
                              {shortAddr(row.wallet)}
                            </span>
                            {isMe && (
                              <Pill tone="cobalt" className="text-[10px]">
                                you
                              </Pill>
                            )}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {row.score.toFixed(1)}
                        </td>

                        {/* Prize */}
                        <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums">
                          {BigInt(row.amount) > 0n ? (
                            <span className="font-semibold text-ink">
                              {fmtUsdc(BigInt(row.amount))}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </section>
    </main>
  );
}
