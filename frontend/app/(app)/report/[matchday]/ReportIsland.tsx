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
import {
  Panel,
  Pill,
  SectionHeading,
  Stat,
  Skeleton,
  EmptyState,
  cx,
} from "@/components/ui";
import type { ReportResponse, TraitHeatmapCell } from "@/app/api/report/route";

// ── Sub-components (module-scope; no sync setState in effect) ------------------

interface BarProps {
  /** 0-100 */
  pct: number;
  label: string;
  sublabel?: string;
  /** Token class for the fill: one of the design-system tones */
  fillClass: string;
  /** aria-label text */
  ariaLabel: string;
}

function HorizontalBar({ pct, label, sublabel, fillClass, ariaLabel }: BarProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {sublabel && (
          <span className="text-xs text-muted">{sublabel}</span>
        )}
      </div>
      <div
        className="relative h-7 w-full overflow-hidden rounded-sm bg-paper-3"
        role="meter"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-sm transition-all duration-500 [transition-timing-function:var(--ease-out-expo)]",
            fillClass,
          )}
          style={{ width: `${clamped}%` }}
        />
        <span className="absolute inset-0 flex items-center px-2.5 text-xs font-semibold text-ink mix-blend-multiply">
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
    <div className="flex flex-col gap-3">
      {/* Bar A — yours (cobalt) */}
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-right text-xs font-medium text-ink">
          {labelA}
        </span>
        <div
          className="relative h-7 flex-1 overflow-hidden rounded-sm bg-paper-3"
          role="meter"
          aria-valuenow={Math.round(valueA)}
          aria-valuemin={0}
          aria-valuemax={Math.ceil(max)}
          aria-label={`${labelA}: ${valueA.toFixed(1)} ${unit}`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-sm bg-cobalt transition-all duration-500 [transition-timing-function:var(--ease-out-expo)]"
            style={{ width: `${pctA}%` }}
          />
          <span className="absolute inset-0 flex items-center px-2.5 text-xs font-semibold text-on-panel">
            {valueA.toFixed(1)} {unit}
          </span>
        </div>
      </div>
      {/* Bar B — reference (neutral fill) */}
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-right text-xs font-medium text-muted">
          {labelB}
        </span>
        <div
          className="relative h-7 flex-1 overflow-hidden rounded-sm bg-paper-3"
          role="meter"
          aria-valuenow={Math.round(valueB)}
          aria-valuemin={0}
          aria-valuemax={Math.ceil(max)}
          aria-label={`${labelB}: ${valueB.toFixed(1)} ${unit}`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-sm bg-line-2 transition-all duration-500 [transition-timing-function:var(--ease-out-expo)]"
            style={{ width: `${pctB}%` }}
          />
          <span className="absolute inset-0 flex items-center px-2.5 text-xs font-semibold text-ink-2">
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
      <p className="text-xs text-muted">
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
        const multPct = cell.active
          ? Math.round((cell.avgMult - 1) * 100)
          : 0;

        return (
          <div
            key={cell.synergy}
            className={cx(
              "flex flex-col gap-1.5 rounded-card px-3 py-2.5",
              cell.active
                ? "border border-line bg-paper-2 shadow-sticker"
                : "border border-line bg-paper-3",
            )}
            role="listitem"
            aria-label={`${cell.synergy}: ${cell.active ? "active" : "inactive"}${cell.active ? `, +${multPct}% avg boost` : ""}`}
          >
            <div className="flex items-center gap-1.5">
              {/* Shape indicator: filled square = active, empty circle = inactive (colorblind safe) */}
              {cell.active ? (
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs bg-cobalt"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-line-2"
                  aria-hidden="true"
                />
              )}
              <span className="text-xs font-semibold text-ink">
                {cell.synergy}
              </span>
              {cell.active && (
                <Pill tone="cobalt" className="ml-auto">
                  Active
                </Pill>
              )}
            </div>
            <div className="text-[10px] text-muted">
              {cell.active ? (
                <>
                  avg {cell.avgMult >= 1 ? "+" : ""}
                  {((cell.avgMult - 1) * 100).toFixed(1)}%
                </>
              ) : (
                <span>Inactive</span>
              )}
            </div>
            {cell.affectedPositions.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {cell.affectedPositions.map((pos) => (
                  <span
                    key={pos}
                    className="rounded-xs bg-paper-3 px-1 py-0.5 text-[9px] font-medium text-ink-2"
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

  // ── Render states ----------------------------------------------------------

  if (!address) {
    return (
      <EmptyState
        icon="🃏"
        title="Connect your wallet"
        hint="Connect to view your matchday report and scoring breakdown."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite" aria-label="Loading report">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <Panel variant="outline" className="px-4 py-3">
        <p className="text-sm text-danger" role="alert">
          Could not load report: {fetchError}
        </p>
      </Panel>
    );
  }

  if (!report) return null;

  if (!report.scoresAvailable) {
    return (
      <EmptyState
        icon="⏳"
        title={`Scores not yet available for Matchday ${matchday}`}
        hint="Reports are published once the matchday is finalized and all player events are ingested."
      />
    );
  }

  // ── Prepared values --------------------------------------------------------

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

  // ── Charts -----------------------------------------------------------------

  return (
    <div className="flex flex-col gap-10">
      {/* Summary — ink panel scoreboard */}
      <section aria-labelledby="summary-heading">
        <p
          id="summary-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          At a Glance
        </p>
        <Panel variant="ink" className="p-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <Stat
                value={report.yourTotal.toFixed(1)}
                label="Your Total"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={tierRankStr}
                label="Contest Rank"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={`${decilePct}th`}
                label="Percentile"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={`${optimalityPct}%`}
                label="Optimality"
                tone="on-panel"
              />
            </div>
            <div>
              <Stat
                value={chipEffStr}
                label="Chip Effect"
                tone="on-panel"
              />
            </div>
          </dl>
        </Panel>
      </section>

      {/* Rank / Percentile bar */}
      <section aria-labelledby="rank-heading">
        <SectionHeading
          kicker="Standing"
          title="Rank Percentile"
          className="mb-4"
        />
        <Panel className="p-5">
          <HorizontalBar
            pct={decilePct}
            label="Your score beats"
            sublabel={`${decilePct}th percentile`}
            fillClass="bg-cobalt"
            ariaLabel={`Your score is in the ${decilePct}th percentile for this matchday`}
          />
          <p className="mt-2 text-xs text-muted">
            100 = top scorer; 0 = lowest scorer. Based on{" "}
            {report.yourTotal.toFixed(1)} pts vs all matchday participants.
          </p>
        </Panel>
      </section>

      {/* Your score vs best possible */}
      <section aria-labelledby="total-heading">
        <SectionHeading
          kicker="Lineup"
          title="Your Score vs Best Possible"
          className="mb-4"
        />
        <Panel className="p-5">
          <DualBar
            labelA="Your lineup"
            valueA={report.yourTotal}
            labelB="Best possible"
            valueB={report.bestPossibleTotal}
          />
          <p className="mt-3 text-xs text-muted">
            &quot;Best possible&quot; is a greedy counterfactual: the top-scoring
            available player picked for each formation slot, reusing your
            chip. Optimality: {optimalityPct}%.
          </p>
        </Panel>
      </section>

      {/* Captain efficiency */}
      <section aria-labelledby="captain-heading">
        <SectionHeading
          kicker="Selection"
          title="Captain Analysis"
          action={
            report.captain.captainName ? (
              <Pill tone="gold">
                <span aria-hidden>C</span>{" "}
                {report.captain.captainName}
              </Pill>
            ) : undefined
          }
          className="mb-4"
        />
        <Panel className="p-5">
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
            <p className="mt-3 text-xs text-muted">
              Your captain scored {captainPct}% of the points the best possible
              captain would have scored.
            </p>
          )}
          {report.captain.captainName === null && (
            <p className="mt-3 text-xs text-muted">
              Captain data unavailable: lineup not found on-chain for this
              matchday.
            </p>
          )}
        </Panel>
      </section>

      {/* Trait synergy heatmap */}
      <section aria-labelledby="synergy-heading">
        <SectionHeading
          kicker="Formation"
          title="Synergy Heatmap"
          className="mb-4"
        />
        <p className="mb-4 text-xs text-muted">
          Active synergies boost specific positions. Filled squares = active;
          empty circles = inactive (colorblind safe: shape + text encode state).
        </p>
        <SynergyGrid cells={report.traitHeatmap} />
      </section>
    </div>
  );
}
