import type { ProfileCard, TierSummary } from "@/app/api/profile/route";
import { PLAYER_BY_ID } from "@/lib/data/players";
import { fmtUsdc } from "@/lib/business/format";

// ── Module-scope sub-components ───────────────────────────────────────────────

const TIER_LABEL = ["Common", "Rare", "Super Rare", "Unique"] as const;
const TIER_COLOR = [
  "text-zinc-600",
  "text-sky-600",
  "text-purple-600",
  "text-amber-600",
] as const;

interface TierBadgeProps {
  tier: number;
}

function TierBadge({ tier }: TierBadgeProps) {
  const label = TIER_LABEL[tier] ?? `Tier ${tier}`;
  const color = TIER_COLOR[tier] ?? "text-zinc-600";
  return <span className={`font-medium ${color}`}>{label}</span>;
}

interface ProfileCardRowProps {
  card: ProfileCard;
}

function ProfileCardRow({ card }: ProfileCardRowProps) {
  const player = PLAYER_BY_ID.get(card.playerId as `0x${string}`);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-zinc-900">
          {player ? player.name : `Player ${card.playerId.slice(0, 10)}…`}
        </p>
        <p className="text-xs text-zinc-500">
          {player ? (
            <>
              <span>{player.nation}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{player.position}</span>
              <span className="mx-1 opacity-40">·</span>
            </>
          ) : null}
          <TierBadge tier={card.tier} />
          <span className="mx-1 opacity-40">·</span>
          <span>#{card.serialNumber}</span>
        </p>
      </div>
    </div>
  );
}

interface SummaryBarProps {
  summary: TierSummary;
}

function SummaryBar({ summary }: SummaryBarProps) {
  const items = [
    { label: "Common", count: summary.common, color: "bg-zinc-400" },
    { label: "Rare", count: summary.rare, color: "bg-sky-500" },
    { label: "Super Rare", count: summary.superRare, color: "bg-purple-500" },
    { label: "Unique", count: summary.unique, color: "bg-amber-500" },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {items
        .filter((i) => i.count > 0)
        .map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
            <span className="text-xs text-zinc-600">
              {item.label}: <strong>{item.count}</strong>
            </span>
          </div>
        ))}
      <span className="text-xs text-zinc-500">
        Total: <strong>{summary.total}</strong>
      </span>
    </div>
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

interface CareerStatsServerProps {
  stats: CareerStats;
}

function CareerStatsServer({ stats }: CareerStatsServerProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4">
      <h2 className="mb-3 text-sm font-semibold text-zinc-700">Career Stats</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-zinc-500">Matchdays played</dt>
          <dd className="font-mono font-medium">{stats.matchdaysPlayed}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Total points</dt>
          <dd className="font-mono font-medium">{stats.totalPoints.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Best day</dt>
          <dd className="font-mono font-medium">{stats.bestDayScore.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Total won</dt>
          <dd className="font-mono font-medium">{fmtUsdc(BigInt(stats.totalWon))} USDC</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Total spent</dt>
          <dd className="font-mono font-medium">{fmtUsdc(BigInt(stats.totalSpent))} USDC</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Season rank</dt>
          <dd className="font-mono font-medium">
            {stats.seasonRank === null ? "—" : `#${stats.seasonRank}`}
          </dd>
        </div>
      </dl>
    </section>
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

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Manager Profile</h1>
        <p className="font-mono text-sm text-zinc-500 break-all">{address}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Public card holdings for{" "}
          <span className="font-semibold">{shortenAddress(address)}</span>
        </p>
      </header>

      {fetchError && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load profile: {fetchError}
        </p>
      )}

      {profileData && (
        <>
          {/* Tier summary */}
          <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-700">
              Card Holdings
            </h2>
            <SummaryBar summary={profileData.summary} />
          </section>

          {/* Career stats */}
          {careerData && <CareerStatsServer stats={careerData} />}

          {/* Card list */}
          {profileData.cards.length === 0 ? (
            <p className="text-sm text-zinc-500">
              This manager doesn&apos;t own any cards yet.
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-700">
                Cards ({profileData.cards.length})
              </h2>
              <div className="flex flex-col gap-2">
                {profileData.cards.map((card) => (
                  <ProfileCardRow key={card.tokenId} card={card} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!fetchError && !profileData && (
        <p className="text-sm opacity-60">Loading profile…</p>
      )}
    </main>
  );
}
