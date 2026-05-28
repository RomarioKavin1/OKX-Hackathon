/**
 * /report/[matchday] — Day-after performance report page.
 *
 * Architecture:
 *   - Outer shell: server component (async params, Next 16 style)
 *   - Inner chart island: client component reads Privy wallet, fetches /api/report,
 *     renders div-based bar charts (no chart library dependency).
 *
 * Accessibility:
 *   - Color-blind-safe: shapes + labels supplement color; never hue-only encoding.
 *   - WCAG 2.1 AA contrast on all text.
 *   - Bar chart widths are clamped; each bar has aria-label with numeric value.
 */

import type { Metadata } from "next";
import { ReportIsland } from "./ReportIsland";

interface PageProps {
  params: Promise<{ matchday: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { matchday } = await params;
  return {
    title: `Matchday ${matchday} Report — ManagerCup`,
    description: `Your day-after performance report for matchday ${matchday}.`,
  };
}

export default async function ReportPage({ params }: PageProps) {
  const { matchday } = await params;
  const matchdayNum = parseInt(matchday, 10);

  if (!Number.isFinite(matchdayNum) || matchdayNum < 0) {
    return (
      <main className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold">Invalid Matchday</h1>
        <p className="text-sm text-zinc-500">
          The matchday parameter must be a non-negative integer.
        </p>
      </main>
    );
  }

  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">
          Matchday {matchdayNum} — Performance Report
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your post-match analytics. Connect wallet to view your personalized
          breakdown.
        </p>
      </header>

      {/* Client island: reads wallet from Privy, fetches /api/report, renders charts */}
      <ReportIsland matchday={matchdayNum} />
    </main>
  );
}
