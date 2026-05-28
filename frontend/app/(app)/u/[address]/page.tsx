import type { ProfileCard, TierSummary } from "@/app/api/profile/route";
import { PLAYER_BY_ID, tierStats } from "@/lib/data/players";
import { fmtUsdc } from "@/lib/business/format";
import { Tier } from "@/lib/types";
import {
  Panel,
  Pill,
  SectionHeading,
  Stat,
  EmptyState,
  Skeleton,
  TierBadge,
  cx,
} from "@/components/ui";
import { PlayerCard } from "@/components/PlayerCard";
import type { TierId } from "@/components/ui";

// ── Module-scope sub-components ───────────────────────────────────────────────

/** Shorten 0x… address to "0x1234…abcd" */
function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Tier distribution strip ───────────────────────────────────────────────────

interface TierDistributionProps {
  summary: TierSummary;
}

function TierDistribution({ summary }: TierDistributionProps) {
  const items: { label: string; count: number; tone: "neutral" | "cobalt" | "violet" | "gold" }[] = [
    { label: "Common", count: summary.common, tone: "neutral" },
    { label: "Rare", count: summary.rare, tone: "cobalt" },
    { label: "Super Rare", count: summary.superRare, tone: "violet" },
    { label: "Unique", count: summary.unique, tone: "gold" },
  ];

  const active = items.filter((i) => i.count > 0);

  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Card tier distribution">
      {active.map((item) => (
        <Pill key={item.label} tone={item.tone}>
          {item.label}: {item.count}
        </Pill>
      ))}
      <span className="text-xs text-muted">
        {summary.total} total
      </span>
    </div>
  );
}

// ── Single card grid item ─────────────────────────────────────────────────────

interface ProfileCardItemProps {
  card: ProfileCard;
}

function ProfileCardItem({ card }: ProfileCardItemProps) {
  const player = PLAYER_BY_ID.get(card.playerId as `0x${string}`);

  if (!player) {
    // Unknown player: render a minimal fallback row
    return (
      <Panel variant="outline" className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            Player {card.playerId.slice(0, 10)}…
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <TierBadge tier={card.tier as TierId} />
            <span aria-hidden className="opacity-40">·</span>
            <span className="font-mono">#{card.serialNumber}</span>
          </p>
        </div>
      </Panel>
    );
  }

  const tier = card.tier as TierId;
  const stats = tierStats(player.base, tier as unknown as Tier);

  return (
    <PlayerCard
      name={player.name}
      nation={player.nation}
      position={player.position}
      tier={tier}
      stats={stats}
      size="sm"
      footer={
        <span className="font-mono text-xs text-muted" aria-label={`Serial number ${card.serialNumber}`}>
          #{card.serialNumber}
        </span>
      }
    />
  );
}

// ── Career Stats ───────────────────────────────────────────────────────────────

interface CareerStats {
  matchdaysPlayed: number;
  totalPoints: number;
  bestDayScore: number;
  totalWon: string;
  totalSpent: string;
  seasonRank: number | null;
}

interface CareerStatsPanelProps {
  stats: CareerStats;
}

function CareerStatsPanel({ stats }: CareerStatsPanelProps) {
  return (
    <Panel variant="ink" className="p-6">
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
        Career totals
      </p>
      <dl
        className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3"
        aria-label="Career statistics"
      >
        <div>
          <Stat
            value={stats.matchdaysPlayed}
            label="Matchdays played"
            tone="on-panel"
          />
        </div>
        <div>
          <Stat
            value={stats.totalPoints.toFixed(1)}
            label="Total points"
            tone="on-panel"
          />
        </div>
        <div>
          <Stat
            value={stats.bestDayScore.toFixed(1)}
            label="Best day"
            tone="on-panel"
          />
        </div>
        <div>
          <Stat
            value={`${fmtUsdc(BigInt(stats.totalWon))} USDC`}
            label="Total won"
            tone="on-panel"
          />
        </div>
        <div>
          <Stat
            value={`${fmtUsdc(BigInt(stats.totalSpent))} USDC`}
            label="Total spent"
            tone="on-panel"
          />
        </div>
        <div>
          <Stat
            value={stats.seasonRank === null ? "—" : `#${stats.seasonRank}`}
            label="Season rank"
            tone="on-panel"
          />
        </div>
      </dl>
    </Panel>
  );
}

// ── Page (server component, async params) ────────────────────────────────────

interface ProfileData {
  address: string;
  cards: ProfileCard[];
  summary: TierSummary;
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  // Fetch profile data server-side via the internal API
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  let profileData: ProfileData | null = null;
  let careerData: CareerStats | null = null;
  let fetchError: string | null = null;

  try {
    const [profileRes, careerRes] = await Promise.all([
      fetch(
        `${baseUrl}/api/profile?address=${encodeURIComponent(address)}`,
        // Opt out of full-route caching so the data is fresh per request
        { cache: "no-store" }
      ),
      fetch(
        `${baseUrl}/api/profile/career?wallet=${encodeURIComponent(address.toLowerCase())}`,
        { cache: "no-store" }
      ),
    ]);

    if (!profileRes.ok) {
      const body = (await profileRes.json().catch(() => ({}))) as { error?: string };
      fetchError = body.error ?? `HTTP ${profileRes.status}`;
    } else {
      profileData = (await profileRes.json()) as ProfileData;
    }

    // Career stats failure is non-fatal — render profile without them
    if (careerRes.ok) {
      careerData = (await careerRes.json()) as CareerStats;
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="flex max-w-3xl flex-col gap-10">
      {/* Page header */}
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flame">
          Manager
        </p>
        <h1 className="display text-4xl text-ink sm:text-5xl">
          {shortenAddress(address)}
        </h1>
        <p
          className="font-mono text-sm text-muted break-all"
          aria-label={`Full address: ${address}`}
        >
          {address}
        </p>
      </header>

      {/* Error state */}
      {fetchError && (
        <Panel variant="paper" className="p-5">
          <p
            className="flex items-center gap-2 text-sm text-danger"
            role="alert"
          >
            <span aria-hidden>✗</span>
            Could not load profile: {fetchError}
          </p>
        </Panel>
      )}

      {/* Loading skeleton (no data, no error) */}
      {!fetchError && !profileData && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-36 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-card" />
            ))}
          </div>
        </div>
      )}

      {profileData && (
        <>
          {/* Holdings summary + tier distribution */}
          <section aria-label="Card holdings">
            <SectionHeading
              kicker="Collection"
              title="Card Holdings"
              className="mb-4"
            />
            <Panel variant="paper" className="p-5">
              {profileData.summary.total === 0 ? (
                <p className="text-sm text-muted">No cards held.</p>
              ) : (
                <TierDistribution summary={profileData.summary} />
              )}
            </Panel>
          </section>

          {/* Career stats */}
          {careerData && (
            <section aria-label="Career statistics">
              <CareerStatsPanel stats={careerData} />
            </section>
          )}

          {/* Card collection grid */}
          <section aria-label={`Cards (${profileData.cards.length})`}>
            <SectionHeading
              kicker="Stickers"
              title={`Cards (${profileData.cards.length})`}
              className="mb-4"
            />

            {profileData.cards.length === 0 ? (
              <EmptyState
                icon="🗂"
                title="No cards yet"
                hint="This manager does not own any cards yet."
              />
            ) : (
              <div
                className={cx(
                  "grid gap-3",
                  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
                )}
              >
                {profileData.cards.map((card) => (
                  <ProfileCardItem key={card.tokenId} card={card} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
