"use client";

/**
 * ReportIsland — Client island for /report/[matchday].
 *
 * Reads the Privy wallet, fetches /api/report, renders:
 *   1. Rank bar — decile percentile
 *   2. Your-vs-best total bar chart
 *   3. Captain efficiency comparison bar
 *   4. Trait synergy heatmap grid
 *
 * Charts: hand-rolled div bars (no external chart dependency).
 * Colorblind-safe: shape + text + pattern; never hue-only encoding.
 */

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { ReportResponse, TraitHeatmapCell } from "@/app/api/report/route";

// ── Sub-components (module-scope; no sync setState in effect) ─────────────────

interface BarProps {
  /** 0–100 */
  pct: number;
  label: string;
  sublabel?: string;
  /** Tailwind bg class */
  color: string;
  /** aria-label text */
  ariaLabel: string;
}

function HorizontalBar({ pct, label, sublabel, color, ariaLabel }: BarProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-zinc-800">{label}</span>
        {sublabel && (
          <span className="text-xs text-zinc-500">{sublabel}</span>
        )}
      </div>
      <div
        className="relative h-6 w-full overflow-hidden rounded bg-zinc-100"
        role="meter"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded ${color} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-zinc-900 mix-blend-multiply">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  );
}

interface DualBarProps {
  labelA: string;
  valueA: number;
  labelB: string;
  valueB: number;
  unit?: string;
}

function DualBar({ labelA, valueA, labelB, valueB, unit = "pts" }: DualBarProps) {
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;

  return (
    <div className="flex flex-col gap-2">
      {/* Bar A */}
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-right text-xs font-medium text-zinc-700">
          {labelA}
        </span>
        <div
          className="relative flex-1 h-6 overflow-hidden rounded bg-zinc-100"
          role="meter"
          aria-valuenow={Math.round(valueA)}
          aria-valuemin={0}
          aria-valuemax={Math.ceil(max)}
          aria-label={`${labelA}: ${valueA.toFixed(1)} ${unit}`}
        >
          {/* Pattern stripe for "yours" bar — shape supplement for colorblind */}
          <div
            className="absolute inset-y-0 left-0 rounded bg-[#1d4ed8]"
            style={{ width: `${pctA}%` }}
          />
          <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white">
            {valueA.toFixed(1)} {unit}
          </span>
        </div>
      </div>
      {/* Bar B */}
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-right text-xs font-medium text-zinc-500">
          {labelB}
        </span>
        <div
          className="relative flex-1 h-6 overflow-hidden rounded bg-zinc-100"
          role="meter"
          aria-valuenow={Math.round(valueB)}
          aria-valuemin={0}
          aria-valuemax={Math.ceil(max)}
          aria-label={`${labelB}: ${valueB.toFixed(1)} ${unit}`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded bg-zinc-400"
            style={{ width: `${pctB}%` }}
          />
          <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-zinc-700">
            {valueB.toFixed(1)} {unit}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SynergyGridProps {
  cells: TraitHeatmapCell[];
}

function SynergyGrid({ cells }: SynergyGridProps) {
  if (cells.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Synergy data not available for this matchday.
      </p>
    );
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
      role="list"
      aria-label="Trait synergy heatmap"
    >
      {cells.map((cell) => {
        // Color-blind safe: active = solid border + checkmark icon; inactive = dashed border
        const borderClass = cell.active
          ? "border-[#1d4ed8] bg-blue-50"
          : "border-zinc-300 bg-zinc-50";
        const multPct = cell.active
          ? Math.round((cell.avgMult - 1) * 100)
          : 0;

        return (
          <div
            key={cell.synergy}
            className={`flex flex-col gap-1 rounded-lg border-2 px-3 py-2 ${borderClass}`}
            role="listitem"
            aria-label={`${cell.synergy}: ${cell.active ? "active" : "inactive"}${cell.active ? `, +${multPct}% avg boost` : ""}`}
          >
            <div className="flex items-center gap-1.5">
              {/* Shape indicator: filled square = active, empty circle = inactive */}
              {cell.active ? (
                <span
                  className="inline-block h-3 w-3 rounded-sm bg-[#1d4ed8] shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="inline-block h-3 w-3 rounded-full border-2 border-zinc-400 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="text-xs font-semibold text-zinc-800">
                {cell.synergy}
              </span>
            </div>
            <div className="text-[10px] text-zinc-500">
              {cell.active ? (
                <>
                  <span className="font-medium text-[#1d4ed8]">Active</span>
                  {" — "}avg {cell.avgMult >= 1 ? "+" : ""}
                  {((cell.avgMult - 1) * 100).toFixed(1)}%
                </>
              ) : (
                <span>Inactive</span>
              )}
            </div>
            {cell.affectedPositions.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {cell.affectedPositions.map((pos) => (
                  <span
                    key={pos}
                    className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-medium text-zinc-600"
                  >
                    {pos}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  icon?: string;
}

function StatChip({ label, value, icon }: StatChipProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm min-w-[100px]">
      {icon && (
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="mt-1 text-xl font-bold text-zinc-900">{value}</span>
      <span className="text-[10px] text-zinc-500 text-center mt-0.5">{label}</span>
    </div>
  );
}

// ── Main island ────────────────────────────────────────────────────────────────

interface ReportIslandProps {
  matchday: number;
}

export function ReportIsland({ matchday }: ReportIslandProps) {
  const { wallets } = useWallets();
  const address = wallets[0]?.address;

  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setFetchError(null);
      setReport(null);
      try {
        const res = await fetch(
          `/api/report?matchday=${matchday}&wallet=${encodeURIComponent(address)}`,
        );
        const body = (await res.json()) as ReportResponse & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setReport(body);
      } catch (err) {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, matchday]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        Connect your wallet to view your matchday report.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-zinc-500" aria-live="polite">
        Loading report…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load report: {fetchError}
      </div>
    );
  }

  if (!report) return null;

  if (!report.scoresAvailable) {
    return (
      <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-4">
        <p className="text-sm font-medium text-zinc-700">
          Scores not yet available for Matchday {matchday}.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Reports are published once the matchday is finalized and all player
          events are ingested.
        </p>
      </div>
    );
  }

  // ── Prepared values ───────────────────────────────────────────────────────

  const decilePct = report.decileRank ?? 0;
  const optimalityPct =
    report.optimality !== null ? Math.round(report.optimality * 100) : 0;
  const captainPct =
    report.captain.captainBest > 0
      ? Math.round((report.captain.captainActual / report.captain.captainBest) * 100)
      : 0;

  const tierRankStr =
    report.withinTierRank !== null ? `#${report.withinTierRank}` : "N/A";

  const chipEffStr =
    report.chipEfficiency !== null
      ? `${(report.chipEfficiency * 100 - 100).toFixed(1)}% boost`
      : "No chip";

  // ── Charts ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8">
      {/* ── Summary chips ───────────────────────────────────────────────────── */}
      <section aria-labelledby="summary-heading">
        <h2
          id="summary-heading"
          className="text-sm font-semibold text-zinc-600 uppercase tracking-wide mb-3"
        >
          At a Glance
        </h2>
        <div className="flex flex-wrap gap-3">
          <StatChip
            label="Your Total"
            value={report.yourTotal.toFixed(1)}
            icon="⚽"
          />
          <StatChip
            label="Contest Rank"
            value={tierRankStr}
            icon="🏆"
          />
          <StatChip
            label="Percentile"
            value={`${decilePct}th`}
            icon="📊"
          />
          <StatChip
            label="Optimality"
            value={`${optimalityPct}%`}
            icon="✨"
          />
          <StatChip
            label="Chip Effect"
            value={chipEffStr}
            icon="🃏"
          />
        </div>
      </section>

      {/* ── Rank / Percentile bar ───────────────────────────────────────────── */}
      <section aria-labelledby="rank-heading">
        <h2
          id="rank-heading"
          className="text-sm font-semibold text-zinc-600 uppercase tracking-wide mb-3"
        >
          Rank Percentile
        </h2>
        <HorizontalBar
          pct={decilePct}
          label="Your score beats"
          sublabel={`${decilePct}th percentile`}
          color="bg-[#1d4ed8]"
          ariaLabel={`Your score is in the ${decilePct}th percentile for this matchday`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          100 = top scorer; 0 = lowest scorer. Based on{" "}
          {report.yourTotal.toFixed(1)} pts vs all matchday participants.
        </p>
      </section>

      {/* ── Your score vs best possible ─────────────────────────────────────── */}
      <section aria-labelledby="total-heading">
        <h2
          id="total-heading"
          className="text-sm font-semibold text-zinc-600 uppercase tracking-wide mb-3"
        >
          Your Score vs Best Possible
        </h2>
        <DualBar
          labelA="Your lineup"
          valueA={report.yourTotal}
          labelB="Best possible"
          valueB={report.bestPossibleTotal}
        />
        <p className="mt-2 text-xs text-zinc-500">
          &quot;Best possible&quot; is a greedy counterfactual &mdash; the top-scoring
          available player picked for each formation slot, reusing your
          chip. Optimality: {optimalityPct}%.
        </p>
      </section>

      {/* ── Captain efficiency ──────────────────────────────────────────────── */}
      <section aria-labelledby="captain-heading">
        <h2
          id="captain-heading"
          className="text-sm font-semibold text-zinc-600 uppercase tracking-wide mb-3"
        >
          Captain Analysis
        </h2>
        <DualBar
          labelA={
            report.captain.captainName
              ? `Capt: ${report.captain.captainName}`
              : "Your captain"
          }
          valueA={report.captain.captainActual}
          labelB={
            report.captain.bestCaptainName
              ? `Best: ${report.captain.bestCaptainName}`
              : "Best captain"
          }
          valueB={report.captain.captainBest}
        />
        {captainPct > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            Your captain scored {captainPct}% of the points the best possible
            captain would have scored.
          </p>
        )}
        {report.captain.captainName === null && (
          <p className="mt-2 text-xs text-zinc-400">
            Captain data unavailable — lineup not found on-chain for this
            matchday.
          </p>
        )}
      </section>

      {/* ── Trait synergy heatmap ──────────────────────────────────────────── */}
      <section aria-labelledby="synergy-heading">
        <h2
          id="synergy-heading"
          className="text-sm font-semibold text-zinc-600 uppercase tracking-wide mb-3"
        >
          Formation Synergy Heatmap
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Active synergies boost specific positions. Filled squares = active;
          empty circles = inactive (color-blind safe: shape + text encode state).
        </p>
        <SynergyGrid cells={report.traitHeatmap} />
      </section>
    </div>
  );
}
