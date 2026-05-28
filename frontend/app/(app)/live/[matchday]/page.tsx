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

/** A rank badge: 1st is gold-ish, 2nd silver, 3rd bronze, rest plain. */
function rankClass(rank: number | null): string {
  if (rank === 1) return "font-bold text-amber-700";
  if (rank === 2) return "font-bold text-zinc-500";
  if (rank === 3) return "font-bold text-amber-600";
  return "text-zinc-600";
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
  return (
    <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
      <td
        className={`py-2 pl-3 pr-4 text-sm tabular-nums w-10 ${rankClass(displayRank)}`}
        aria-label={`Rank ${displayRank}`}
      >
        {displayRank}
      </td>
      <td className="py-2 pr-4 text-sm font-mono text-zinc-700">
        {fmtWallet(entry.wallet)}
      </td>
      <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums text-zinc-900">
        {entry.score.toFixed(2)}
      </td>
    </tr>
  );
}

interface TickerItemProps {
  event: TickerEvent;
}

function TickerItem({ event }: TickerItemProps) {
  const isGain = event.delta >= 0;
  const deltaClass = isGain ? "text-emerald-700" : "text-red-600";
  return (
    <li className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-1.5 text-xs">
      <span className="font-mono text-zinc-500">{fmtWallet(event.wallet)}</span>
      <span className="text-zinc-400">scored</span>
      <span className="font-semibold text-zinc-900">{event.newScore.toFixed(2)}</span>
      <span className={`font-semibold ${deltaClass}`}>({fmtDelta(event.delta)})</span>
      <time className="ml-auto text-[10px] text-zinc-400" dateTime={event.at}>
        {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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

  // Leaderboard state: wallet → row (latest snapshot)
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

    // ── Initial fetch: populate leaderboard without waiting for a change event
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

    // ── Realtime subscription ──────────────────────────────────────────────
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

  // ── Invalid matchday guard ─────────────────────────────────────────────────

  if (!Number.isFinite(matchday) || matchday < 0) {
    return (
      <main className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold">Invalid Matchday</h1>
        <p className="text-sm text-zinc-500">
          The matchday parameter must be a non-negative integer.
        </p>
      </main>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Matchday {matchday} — Live Scoring
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Leaderboard updates in real-time as match events arrive.
          </p>
        </div>
        {/* Connection indicator */}
        <div
          className="flex items-center gap-1.5 mt-1"
          role="status"
          aria-label={connected ? "Live feed connected" : "Live feed disconnected"}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"
            }`}
            aria-hidden="true"
          />
          <span className="text-xs text-zinc-500">
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {/* Error banner */}
      {loadError && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {/* Leaderboard table */}
      <section aria-labelledby="leaderboard-heading">
        <h2
          id="leaderboard-heading"
          className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600"
        >
          Leaderboard
        </h2>

        {sorted.length === 0 ? (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            {connected
              ? "Waiting for scores… The replay may not have started yet."
              : "Connecting to live feed…"}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-left" aria-label={`Matchday ${matchday} live leaderboard`}>
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th
                    scope="col"
                    className="py-2 pl-3 pr-4 text-xs font-semibold text-zinc-500 w-10"
                  >
                    Rank
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-4 text-xs font-semibold text-zinc-500"
                  >
                    Wallet
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-3 text-right text-xs font-semibold text-zinc-500"
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
        )}
      </section>

      {/* Ticker: live score-change events */}
      <section aria-labelledby="ticker-heading">
        <h2
          id="ticker-heading"
          className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600"
        >
          Recent Updates
        </h2>

        {ticker.length === 0 ? (
          <p className="text-sm text-zinc-400">No score updates yet.</p>
        ) : (
          <ul
            className="flex flex-col gap-1"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Recent score updates"
          >
            {ticker.map((event) => (
              <TickerItem key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      {/* Footer note */}
      <footer className="text-xs text-zinc-400">
        Scores computed by the oracle replay worker using the same formula as
        the on-chain settlement (spec §4.9). Replay must be running (
        <code>npm run replay {matchday}</code>) for this page to update.
      </footer>
    </main>
  );
}
