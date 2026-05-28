"use client";

/**
 * /live/[matchday] — Real-time leaderboard + ticker (Task 6.3 — FR-S3 / US-17)
 *
 * Architecture:
 *   - Full client component (needs Supabase Realtime + browser APIs).
 *   - Next 16: params is a Promise; unwrapped with React.use().
 *   - Subscribes to the Supabase Realtime channel `live:<matchday>` for
 *     postgres_changes on the live_scores table.
 *   - Renders a per-wallet leaderboard sorted by score (desc) + a rolling
 *     ticker showing the last few score-change events.
 *   - Subscription is set up in useEffect with proper cleanup (channel.unsubscribe).
 *   - Updates are ≤5 s because Supabase Realtime delivers changes within 2–3 s
 *     of each upsert, and the replay worker upserts every simulated minute
 *     (≥16 ms at speed=60).
 *
 * Accessibility:
 *   - aria-live="polite" on the ticker so screen readers announce new events.
 *   - aria-label on rank columns.
 *   - Color-blind safe: rank position is conveyed by number + text, not hue alone.
 */

import { use, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  Panel,
  Pill,
  SectionHeading,
  EmptyState,
  cx,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveScoreRow {
  matchday: number;
  wallet: string;
  score: number;
  rank: number | null;
  updated_at: string;
}

interface TickerEvent {
  id: string; // for React key (wallet + timestamp)
  wallet: string;
  newScore: number;
  delta: number; // change from previous score
  at: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a wallet address to a display-friendly form. */
function fmtWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/** Format a score delta with sign for the ticker. */
function fmtDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
}

/**
 * Rank medal indicator: 1st gold, 2nd silver, 3rd cobalt, rest muted.
 * Conveyed by text + tone, never by hue alone.
 */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span
        className="display text-base tabular-nums text-gold"
        aria-label={`Rank ${rank}`}
      >
        1
      </span>
    );
  if (rank === 2)
    return (
      <span
        className="display text-base tabular-nums text-on-panel-muted"
        aria-label={`Rank ${rank}`}
      >
        2
      </span>
    );
  if (rank === 3)
    return (
      <span
        className="display text-base tabular-nums text-cobalt"
        aria-label={`Rank ${rank}`}
      >
        3
      </span>
    );
  return (
    <span
      className="tabular-nums text-sm text-on-panel-muted"
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Module-scope sub-components
// ---------------------------------------------------------------------------

interface LeaderboardRowProps {
  entry: LiveScoreRow;
  position: number; // 1-based index in sorted array
}

function LeaderboardRow({ entry, position }: LeaderboardRowProps) {
  const displayRank = entry.rank ?? position;
  const isTop3 = displayRank <= 3;
  return (
    <tr
      className={cx(
        "border-b border-panel-2 last:border-0 transition-colors duration-150 [transition-timing-function:var(--ease-out-expo)]",
        isTop3 ? "bg-panel-2/60" : "hover:bg-panel-2/40",
      )}
    >
      <td className="w-10 py-3 pl-4 pr-3">
        <RankBadge rank={displayRank} />
      </td>
      <td className="py-3 pr-4 font-mono text-sm text-on-panel-muted">
        {fmtWallet(entry.wallet)}
      </td>
      <td className="py-3 pr-4 text-right">
        <span className="display text-lg tabular-nums text-on-panel">
          {entry.score.toFixed(2)}
        </span>
      </td>
    </tr>
  );
}

interface TickerItemProps {
  event: TickerEvent;
}

function TickerItem({ event }: TickerItemProps) {
  const isGain = event.delta >= 0;
  return (
    <li className="flex items-center gap-2 rounded-sm border border-panel-2 bg-panel-2/50 px-3 py-2 text-xs">
      <span className="font-mono text-on-panel-muted">{fmtWallet(event.wallet)}</span>
      <span className="text-on-panel-muted">scored</span>
      <span className="display tabular-nums text-on-panel">{event.newScore.toFixed(2)}</span>
      <span
        className={cx(
          "font-semibold tabular-nums",
          isGain ? "text-grass" : "text-danger",
        )}
      >
        ({fmtDelta(event.delta)})
      </span>
      <time
        className="ml-auto text-[10px] tabular-nums text-on-panel-muted"
        dateTime={event.at}
      >
        {new Date(event.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function LiveMatchdayPage({
  params,
}: {
  params: Promise<{ matchday: string }>;
}) {
  // Next 16 — async params for client components via React.use()
  const { matchday: matchdayStr } = use(params);
  const matchday = parseInt(matchdayStr, 10);

  // Leaderboard state: wallet -> row (latest snapshot)
  const [rows, setRows] = useState<Map<string, LiveScoreRow>>(new Map());
  // Ticker: last 8 score-change events (newest first)
  const [ticker, setTicker] = useState<TickerEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track previous scores to compute deltas in the ticker
  const prevScores = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!Number.isFinite(matchday)) return;

    let client: ReturnType<typeof supabaseBrowser>;
    try {
      client = supabaseBrowser();
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadError(
        `Live updates unavailable: ${(e as Error).message}. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env.`,
      );
      return;
    }

    // -- Initial fetch: populate leaderboard without waiting for a change event
    const fetchInitial = async () => {
      const { data, error } = await client
        .from("live_scores")
        .select("matchday, wallet, score, rank, updated_at")
        .eq("matchday", matchday)
        .order("score", { ascending: false });

      if (error) {
        setLoadError(`Failed to load live scores: ${error.message}`);
        return;
      }
      if (data && data.length > 0) {
        const initial = new Map<string, LiveScoreRow>();
        for (const row of data as LiveScoreRow[]) {
          initial.set(row.wallet, row);
          prevScores.current.set(row.wallet, row.score);
        }
        setRows(initial);
      }
    };

    void fetchInitial();

    // -- Realtime subscription -----------------------------------------------
    const channel = client
      .channel(`live:${matchday}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT + UPDATE
          schema: "public",
          table: "live_scores",
          filter: `matchday=eq.${matchday}`,
        },
        (payload) => {
          const incoming = payload.new as LiveScoreRow;
          if (!incoming || !incoming.wallet) return;

          // Compute delta for the ticker
          const prevScore = prevScores.current.get(incoming.wallet) ?? 0;
          const delta = incoming.score - prevScore;
          prevScores.current.set(incoming.wallet, incoming.score);

          // Update leaderboard map
          setRows((prev) => {
            const next = new Map(prev);
            next.set(incoming.wallet, incoming);
            return next;
          });

          // Prepend to ticker (keep max 8 events)
          if (Math.abs(delta) > 0.001) {
            const tickerEvent: TickerEvent = {
              id: `${incoming.wallet}-${incoming.updated_at}`,
              wallet: incoming.wallet,
              newScore: incoming.score,
              delta,
              at: incoming.updated_at,
            };
            setTicker((prev) => [tickerEvent, ...prev].slice(0, 8));
          }
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    // Cleanup: unsubscribe when matchday changes or component unmounts
    return () => {
      void channel.unsubscribe();
    };
  }, [matchday]);

  // Sort leaderboard by score descending
  const sorted = [...rows.values()].sort((a, b) => b.score - a.score);

  // -- Invalid matchday guard ------------------------------------------------

  if (!Number.isFinite(matchday) || matchday < 0) {
    return (
      <main className="flex max-w-2xl flex-col gap-6 py-4">
        <EmptyState
          icon="⚠"
          title="Invalid Matchday"
          hint="The matchday parameter must be a non-negative integer."
        />
      </main>
    );
  }

  // -- Render ----------------------------------------------------------------

  return (
    <main className="flex max-w-3xl flex-col gap-8 py-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          kicker={`Matchday ${matchday}`}
          title="Live Scoring"
        />

        {/* Connection status indicator */}
        <div
          className="mt-1 flex shrink-0 items-center gap-1.5"
          role="status"
          aria-label={connected ? "Live feed connected" : "Live feed disconnected"}
        >
          {connected ? (
            <Pill tone="flame">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"
              />
              Live
            </Pill>
          ) : (
            <Pill tone="neutral">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              Connecting
            </Pill>
          )}
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <Panel variant="outline" className="px-4 py-3">
          <p className="text-sm text-danger" role="alert">
            {loadError}
          </p>
        </Panel>
      )}

      {/* Scoreboard — ink panel */}
      <section aria-labelledby="leaderboard-heading">
        <p
          id="leaderboard-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Leaderboard
        </p>

        {sorted.length === 0 ? (
          <EmptyState
            icon="⚽"
            title="Matches begin June 11, 2026"
            hint={
              connected
                ? "Waiting for scores. The replay may not have started yet."
                : "Connecting to the live feed..."
            }
          />
        ) : (
          <Panel variant="ink" className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table
                className="w-full text-left"
                aria-label={`Matchday ${matchday} live leaderboard`}
              >
                <thead>
                  <tr className="border-b border-panel-2">
                    <th
                      scope="col"
                      className="w-10 py-3 pl-4 pr-3 text-xs font-semibold uppercase tracking-[0.15em] text-on-panel-muted"
                    >
                      #
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-on-panel-muted"
                    >
                      Wallet
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 text-right text-xs font-semibold uppercase tracking-[0.15em] text-on-panel-muted"
                    >
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((entry, i) => (
                    <LeaderboardRow
                      key={entry.wallet}
                      entry={entry}
                      position={i + 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </section>

      {/* Ticker: live score-change events */}
      <section aria-labelledby="ticker-heading">
        <p
          id="ticker-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Recent Updates
        </p>

        {ticker.length === 0 ? (
          <p className="text-sm text-muted">No score updates yet.</p>
        ) : (
          <Panel variant="ink" className="p-3">
            <ul
              className="flex flex-col gap-1.5"
              aria-live="polite"
              aria-atomic="false"
              aria-label="Recent score updates"
            >
              {ticker.map((event) => (
                <TickerItem key={event.id} event={event} />
              ))}
            </ul>
          </Panel>
        )}
      </section>

      {/* Footer note */}
      <footer className="text-xs text-muted">
        Scores computed by the oracle replay worker using the same formula as
        the on-chain settlement (spec §4.9). Replay must be running (
        <code className="font-mono">npm run replay {matchday}</code>) for this
        page to update.
      </footer>
    </main>
  );
}
