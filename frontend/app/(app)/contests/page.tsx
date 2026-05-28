"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { fmtUsdc } from "@/lib/business/format";
import { TIER_NAME } from "@/lib/types";
import { Tier } from "@/lib/types";
import {
  Panel,
  Pill,
  Stat,
  SectionHeading,
  EmptyState,
  Skeleton,
  TierBadge,
  buttonClasses,
  cx,
} from "@/components/ui";
import type { TierId } from "@/components/ui";

// ── Geofence ─────────────────────────────────────────────────────────────────

interface GeoCookie {
  iso: string;
  free: "allow" | "kyc" | "block";
  paid: "allow" | "kyc" | "block";
}

function readGeoCookie(): GeoCookie | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)mc-geo=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as GeoCookie;
  } catch {
    return null;
  }
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when the contest has a high enough prize pool to warrant ink-panel marquee treatment. */
function isMarqueePaid(contest: ContestRow): boolean {
  return BigInt(contest.entryFee) > 0n && BigInt(contest.pool) >= 10_000_000n; // >= $10 USDC
}

/** Short hex suffix used as a legible contest identifier. */
function contestShort(id: string): string {
  return id.slice(-6).toUpperCase();
}

// ── Module-scope sub-components ───────────────────────────────────────────────

interface ContestCardProps {
  contest: ContestRow;
  address: Address | undefined;
  geo: GeoCookie | null;
}

// ── Free contest card ─────────────────────────────────────────────────────────

function FreeContestCard({ contest, address, geo: _geo }: ContestCardProps) {
  const pool = BigInt(contest.pool);
  const contestIdBigInt = BigInt(contest.contestId);

  const enterRequest = {
    address: ADDRESSES.ContestEscrow,
    abi: ABIS.ContestEscrow,
    functionName: "enter",
    args: [contestIdBigInt] as const,
  } as const;

  const tierAsId = (contest.minTier <= 3 ? contest.minTier : 0) as TierId;

  return (
    <Panel
      variant="paper"
      className="flex flex-col gap-5 p-5 transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-lift"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Pill tone="ok">Free entry</Pill>
            {contest.minTier > 0 && (
              <TierBadge tier={tierAsId} />
            )}
          </div>
          <p className="font-mono text-xs text-muted">#{contestShort(contest.contestId)}</p>
        </div>
        {pool > 0n && (
          <div className="text-right">
            <p className="text-base font-semibold tabular-nums text-ink">{fmtUsdc(pool)}</p>
            <p className="text-xs text-muted">prize pool</p>
          </div>
        )}
      </div>

      {/* Stats row */}
      <dl className="flex gap-6">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Entrants</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{contest.entrants}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Rake</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
            {(contest.rakeBps / 100).toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Min tier</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">
            {TIER_NAME[contest.minTier as Tier] ?? `Tier ${contest.minTier}`}+
          </dd>
        </div>
      </dl>

      {/* CTA */}
      <div className="mt-auto pt-1">
        {!address ? (
          <Pill tone="warn">Connect a wallet to enter.</Pill>
        ) : (
          <TxButton
            request={enterRequest}
            label="Enter free contest"
          />
        )}
      </div>
    </Panel>
  );
}

// ── Marquee paid card (ink panel scoreboard) ──────────────────────────────────

function MarqueeContestCard({ contest, address, geo }: ContestCardProps) {
  const entryFee = BigInt(contest.entryFee);
  const pool = BigInt(contest.pool);
  const contestIdBigInt = BigInt(contest.contestId);

  const geoBlocked = geo != null && geo.paid !== "allow";
  const geoMessage =
    geo?.paid === "block"
      ? "Paid contests not available in your region"
      : geo?.paid === "kyc"
      ? "KYC required for paid contests in your region"
      : null;

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

  const tierAsId = (contest.minTier <= 3 ? contest.minTier : 0) as TierId;

  return (
    <Panel
      variant="ink"
      className="flex flex-col gap-6 p-6 transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-lift"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <TierBadge tier={tierAsId} />
          <p className="font-mono text-xs text-on-panel-muted">#{contestShort(contest.contestId)}</p>
        </div>
        <Pill tone="flame">Paid</Pill>
      </div>

      {/* Prize pool — big scoreboard number */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
          Prize pool
        </p>
        <Stat value={fmtUsdc(pool)} label="USDC" tone="on-panel" />
      </div>

      {/* Stats row */}
      <dl className="flex gap-6 border-t border-[color:var(--panel-2)] pt-4">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-on-panel-muted">Entry</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-on-panel">
            {fmtUsdc(entryFee)} USDC
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-on-panel-muted">Entrants</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-on-panel">{contest.entrants}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-on-panel-muted">Rake</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-on-panel">
            {(contest.rakeBps / 100).toFixed(1)}%
          </dd>
        </div>
      </dl>

      {/* CTA */}
      <div>
        {!address ? (
          <Pill tone="warn">Connect a wallet to enter.</Pill>
        ) : geoBlocked ? (
          <button
            disabled
            aria-disabled="true"
            className={cx(
              buttonClasses("secondary", "md", "w-full cursor-not-allowed opacity-50"),
            )}
          >
            {geoMessage ?? "Unavailable in your region"}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-sm border border-[color:var(--panel-2)] px-3 py-2">
              <p className="text-xs font-medium text-on-panel-muted">
                Step 1 — approve {fmtUsdc(entryFee)} USDC for escrow
              </p>
            </div>
            <TxButton
              request={approveRequest}
              label={`Approve ${fmtUsdc(entryFee)} USDC`}
            />
            <div className="rounded-sm border border-[color:var(--panel-2)] px-3 py-2">
              <p className="text-xs font-medium text-on-panel-muted">
                Step 2 — enter contest
              </p>
            </div>
            <TxButton
              request={enterRequest}
              label="Enter contest"
            />
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── Standard paid card (paper panel) ─────────────────────────────────────────

function PaidContestCard({ contest, address, geo }: ContestCardProps) {
  const entryFee = BigInt(contest.entryFee);
  const pool = BigInt(contest.pool);
  const contestIdBigInt = BigInt(contest.contestId);

  const geoBlocked = geo != null && geo.paid !== "allow";
  const geoMessage =
    geo?.paid === "block"
      ? "Paid contests not available in your region"
      : geo?.paid === "kyc"
      ? "KYC required for paid contests in your region"
      : null;

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

  const tierAsId = (contest.minTier <= 3 ? contest.minTier : 0) as TierId;

  return (
    <Panel
      variant="paper"
      className="flex flex-col gap-5 p-5 transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-lift"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Pill tone="cobalt">Paid</Pill>
            <TierBadge tier={tierAsId} />
          </div>
          <p className="font-mono text-xs text-muted">#{contestShort(contest.contestId)}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tabular-nums text-ink">{fmtUsdc(pool)}</p>
          <p className="text-xs text-muted">prize pool</p>
        </div>
      </div>

      {/* Stats row */}
      <dl className="flex gap-6">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Entry fee</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
            {fmtUsdc(entryFee)} USDC
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Entrants</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{contest.entrants}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Rake</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
            {(contest.rakeBps / 100).toFixed(1)}%
          </dd>
        </div>
      </dl>

      {/* CTA */}
      <div className="mt-auto pt-1">
        {!address ? (
          <Pill tone="warn">Connect a wallet to enter.</Pill>
        ) : geoBlocked ? (
          <button
            disabled
            aria-disabled="true"
            className={cx(
              buttonClasses("secondary", "md", "w-full cursor-not-allowed opacity-50"),
            )}
          >
            {geoMessage ?? "Unavailable in your region"}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              Step 1: approve {fmtUsdc(entryFee)} USDC for escrow
            </p>
            <TxButton
              request={approveRequest}
              label={`Approve ${fmtUsdc(entryFee)} USDC`}
            />
            <p className="text-xs text-muted">Step 2: enter contest</p>
            <TxButton
              request={enterRequest}
              label="Enter contest"
            />
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── Contest card dispatcher ───────────────────────────────────────────────────

function ContestCard(props: ContestCardProps) {
  const { contest } = props;
  const isFree = BigInt(contest.entryFee) === 0n;
  if (isFree) return <FreeContestCard {...props} />;
  if (isMarqueePaid(contest)) return <MarqueeContestCard {...props} />;
  return <PaidContestCard {...props} />;
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function ContestSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading contests">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-4 rounded-card border border-line bg-paper-2 p-5 shadow-sticker">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex gap-6">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-8 w-14" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
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
  const [geo] = useState<GeoCookie | null>(readGeoCookie);

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

  const freeContests = contests.filter((c) => BigInt(c.entryFee) === 0n);
  const paidContests = contests.filter((c) => BigInt(c.entryFee) > 0n);

  return (
    <main className="flex max-w-3xl flex-col gap-8 py-2">

      {/* Page heading + matchday selector */}
      <div className="flex flex-col gap-5">
        <SectionHeading
          kicker="Matchday contests"
          title="Pick your bracket"
        />

        {/* Matchday selector + refresh */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="matchday-select"
            className="text-sm font-medium text-ink-2 shrink-0"
          >
            Matchday
          </label>
          <select
            id="matchday-select"
            className={cx(
              "h-9 rounded-sm border border-line-2 bg-paper-2 px-3 text-sm text-ink",
              "transition-[border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-expo)]",
              "hover:border-ink-2",
              "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
            )}
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
            className={buttonClasses("ghost", "sm")}
            aria-label="Refresh contests"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Panel variant="outline" className="px-4 py-3">
          <p className="text-sm text-danger" role="alert">
            Could not load contests: {error}
          </p>
        </Panel>
      )}

      {/* Loading skeletons */}
      {loading && <ContestSkeletons />}

      {/* Empty state */}
      {!loading && !error && contests.length === 0 && (
        <EmptyState
          icon="🏆"
          title={`No contests for Matchday ${matchday}`}
          hint="Contests open before kickoff. Check back when the matchday schedule is confirmed."
          action={
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className={buttonClasses("secondary", "sm")}
            >
              Try again
            </button>
          }
        />
      )}

      {/* Free contests section */}
      {!loading && freeContests.length > 0 && (
        <section aria-label="Free contests">
          <SectionHeading
            kicker="No entry fee"
            title="Free contests"
            className="mb-4"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {freeContests.map((c) => (
              <ContestCard key={c.contestId} contest={c} address={address} geo={geo} />
            ))}
          </div>
        </section>
      )}

      {/* Paid contests section */}
      {!loading && paidContests.length > 0 && (
        <section aria-label="Paid contests">
          <SectionHeading
            kicker="Prize contests"
            title="Paid brackets"
            className="mb-4"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {paidContests.map((c) => (
              <ContestCard key={c.contestId} contest={c} address={address} geo={geo} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
