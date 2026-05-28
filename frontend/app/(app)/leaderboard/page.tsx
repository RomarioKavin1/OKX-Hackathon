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

function medalEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
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

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-pitch-green mb-6">Season Leaderboard</h1>
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-pitch-green mb-6">Season Leaderboard</h1>
        <p className="text-sm text-red-600">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-pitch-green mb-2">Season Leaderboard</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Cumulative fantasy points across all Cup matchdays. Top 100 wallets
        share the 2% season prize pool.
      </p>

      {/* ── Season status banner ─────────────────────────────────────────── */}
      {isFinalized === false && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <strong>Season in progress</strong> — The season has not been finalized
          on-chain yet. Standings shown are the latest computed projection. Claims
          will be available once the oracle posts the final root.
        </div>
      )}
      {isFinalized === true && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <strong>Season finalized!</strong> Eligible wallets can now claim their
          prize below.
        </div>
      )}

      {/* ── My season result card ────────────────────────────────────────── */}
      {connectedAddress && walletEntry && (
        <section
          aria-labelledby="my-season-heading"
          className="mb-8 rounded-xl border-2 border-gold bg-white p-5 shadow"
        >
          <h2 id="my-season-heading" className="text-lg font-semibold mb-3">
            My Season Result
          </h2>
          <dl className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <dt className="text-xs text-zinc-400 uppercase tracking-wide">Rank</dt>
              <dd className="text-2xl font-bold">
                {walletEntry.rank !== null ? `#${walletEntry.rank}` : "—"}
                {walletEntry.rank !== null && walletEntry.rank <= 3
                  ? ` ${medalEmoji(walletEntry.rank)}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400 uppercase tracking-wide">Score</dt>
              <dd className="text-2xl font-bold">{walletEntry.score.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400 uppercase tracking-wide">Prize</dt>
              <dd className="text-2xl font-bold">
                {BigInt(walletEntry.amount ?? "0") > 0n
                  ? `${fmtUsdc(BigInt(walletEntry.amount))} USDC`
                  : "—"}
              </dd>
            </div>
          </dl>

          {/* Claim button — gated on isFinalized + amount > 0 + claimRequest */}
          {isFinalized && claimRequest && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">
                Claim your season prize via SeasonLeaderboard.claim(amount, proof):
              </p>
              <TxButton
                request={claimRequest}
                label="Claim Season Prize"
                onSuccess={(hash) => {
                  // Optimistic UI: clear amount so the button disappears
                  setWalletEntry((prev) =>
                    prev ? { ...prev, amount: "0" } : prev,
                  );
                  console.info("[leaderboard] claimSeason mined:", hash);
                }}
              />
            </div>
          )}

          {isFinalized && BigInt(walletEntry.amount ?? "0") === 0n && walletEntry.rank !== null && (
            <p className="text-xs text-zinc-400 mt-2">
              Your rank is outside the top-100 paid positions — no prize to claim.
            </p>
          )}

          {!isFinalized && BigInt(walletEntry.amount ?? "0") > 0n && (
            <p className="text-xs text-amber-700 mt-2">
              Season must be finalized on-chain before claiming.
            </p>
          )}
        </section>
      )}

      {!connectedAddress && (
        <p className="mb-6 text-sm text-zinc-500">
          Connect your wallet to see your season rank and claim prize.
        </p>
      )}

      {/* ── Standings table ──────────────────────────────────────────────── */}
      {standings.length === 0 ? (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-6 text-center text-sm text-zinc-400">
          No season data yet — standings will appear once matchdays have been scored
          and aggregated by the oracle.
        </div>
      ) : (
        <section aria-labelledby="standings-heading">
          <h2 id="standings-heading" className="text-base font-semibold mb-3">
            Top {standings.length} Season Standings
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm">
            <table className="w-full text-sm" aria-label="Season standings">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="py-2 px-4 text-left w-12">Rank</th>
                  <th className="py-2 px-4 text-left">Manager</th>
                  <th className="py-2 px-4 text-right">Score</th>
                  <th className="py-2 px-4 text-right">Prize (USDC)</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const isMe =
                    connectedAddress &&
                    row.wallet.toLowerCase() === connectedAddress.toLowerCase();
                  return (
                    <tr
                      key={row.wallet}
                      className={`border-b border-zinc-50 last:border-0 transition-colors ${
                        isMe
                          ? "bg-gold/10 font-semibold"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <span className="font-mono">
                          {row.rank <= 3 ? medalEmoji(row.rank) : `#${row.rank}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        {shortAddr(row.wallet)}
                        {isMe && (
                          <span className="ml-2 rounded bg-pitch-green/10 px-1.5 py-0.5 text-[10px] text-pitch-green font-semibold">
                            you
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {row.score.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {BigInt(row.amount) > 0n
                          ? fmtUsdc(BigInt(row.amount))
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Showing top {standings.length} managers. Ranks 101+ are not paid.
          </p>
        </section>
      )}
    </main>
  );
}
