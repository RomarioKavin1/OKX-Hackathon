"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { fmtUsdc } from "@/lib/business/format";
import { TIER_NAME } from "@/lib/types";
import { Tier } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ContestRow {
  contestId: string;
  matchday: number;
  entryFee: string;   // string representation of bigint (USDC 6dp)
  rakeBps: number;
  minTier: number;
  pool: string;       // string representation of bigint (USDC 6dp)
  rakeTaken: boolean;
  entrants: number;
}

// ── Module-scope sub-components ───────────────────────────────────────────────

interface ContestCardProps {
  contest: ContestRow;
  address: Address | undefined;
}

function ContestCard({ contest, address }: ContestCardProps) {
  const entryFee = BigInt(contest.entryFee);
  const pool = BigInt(contest.pool);
  const isFree = entryFee === 0n;
  const minTierLabel = TIER_NAME[contest.minTier as Tier] ?? `Tier ${contest.minTier}`;
  const contestIdBigInt = BigInt(contest.contestId);

  // Request objects built at module scope (inside the component fn is fine since they are stable per render)
  const enterRequest = {
    address: ADDRESSES.ContestEscrow,
    abi: ABIS.ContestEscrow,
    functionName: "enter",
    args: [contestIdBigInt] as const,
  } as const;

  const approveRequest = {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "approve",
    args: [ADDRESSES.ContestEscrow, entryFee] as const,
  } as const;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-zinc-400">Contest #{contest.contestId.slice(-8)}</p>
          <p className="text-sm font-semibold">
            {isFree ? "Free Entry" : `Entry: ${fmtUsdc(entryFee)} USDC`}
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          {minTierLabel}+
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="font-semibold">{fmtUsdc(pool)}</p>
          <p className="text-zinc-400">Pool (USDC)</p>
        </div>
        <div>
          <p className="font-semibold">{contest.entrants}</p>
          <p className="text-zinc-400">Entrants</p>
        </div>
        <div>
          <p className="font-semibold">{(contest.rakeBps / 100).toFixed(1)}%</p>
          <p className="text-zinc-400">Rake</p>
        </div>
      </div>

      {!address ? (
        <p className="text-xs text-amber-700">Connect a wallet to enter.</p>
      ) : isFree ? (
        // Free contest — single enter button
        <TxButton
          request={enterRequest}
          label="Enter (free)"
        />
      ) : (
        // Paid contest — approve then enter
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Step 1: approve {fmtUsdc(entryFee)} USDC for escrow
          </p>
          <TxButton
            request={approveRequest}
            label={`Approve ${fmtUsdc(entryFee)} USDC`}
          />
          <p className="text-xs text-zinc-500">Step 2: enter contest</p>
          <TxButton
            request={enterRequest}
            label="Enter contest"
          />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContestsPage() {
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const [matchday, setMatchday] = useState(1);
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contests?matchday=${matchday}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { contests: ContestRow[] };
        if (!cancelled) setContests(data.contests);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matchday, refreshKey]);

  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Contests</h1>
        <p className="text-sm opacity-70">Enter a contest to compete for prizes.</p>
      </header>

      {/* Matchday selector */}
      <section className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="matchday-select">
          Matchday
        </label>
        <select
          id="matchday-select"
          className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          value={matchday}
          onChange={(e) => setMatchday(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <option key={d} value={d}>
              Matchday {d}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50"
        >
          Refresh
        </button>
      </section>

      {/* Loading / error */}
      {loading && <p className="text-sm opacity-60">Loading contests…</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load contests: {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && contests.length === 0 && (
        <p className="text-sm opacity-60">No contests found for Matchday {matchday}.</p>
      )}

      {/* Contest grid */}
      {!loading && contests.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {contests.map((c) => (
            <ContestCard key={c.contestId} contest={c} address={address} />
          ))}
        </section>
      )}
    </main>
  );
}
