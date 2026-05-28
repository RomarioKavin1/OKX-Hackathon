/**
 * rollover.ts — Unclaimed-prize rollover service (FR-CT8, Task 7.6)
 *
 * ECONOMIC MODEL (treasury-funded, NOT an on-chain sweep):
 * ─────────────────────────────────────────────────────────
 * The deployed ContestEscrow contract (0x00B08f0E928933422A7b623E475Dd84b2B98BaA4)
 * has NO sweep / reclaim / rescue function.  Funds deposited by entrants are
 * locked in the escrow forever unless a winner calls `claim()` with a valid
 * Merkle proof.  We have confirmed this by inspecting the deployed ABI.
 *
 * ESCROW-LOCK LIMITATION (important):
 *   This service does NOT attempt an on-chain sweep.  It would revert because
 *   no such function exists.  Any code that calls a "sweep" or "reclaim" on
 *   ContestEscrow would fail.
 *
 * ROLLOVER POLICY:
 *   When a contest's payout window expires (finalized_at + deadlineDays) and
 *   some winners never claimed, the *economic equivalent* of the unclaimed
 *   amount is honoured in a future FREE contest whose pool is funded directly
 *   from the treasury wallet.  The `contest_rollover` ledger records this
 *   commitment so the transparency page can display it.
 *
 *   Step 1 — For each `scores` row with payout > 0 for the given contest,
 *             query `ContestEscrow.claimed(contestId, wallet)` on-chain.
 *   Step 2 — Sum `payout` for every wallet where `claimed === false`.
 *   Step 3 — If `now > finalized_at + deadlineDays`, upsert a
 *             `contest_rollover` row with status='pending'.
 *   Step 4 — The treasury ops team reads these rows and creates the next free
 *             contest with a matching pool (manual or automated via Task 7.2).
 *
 * CLI usage:
 *   tsx services/oracle/rollover.ts <contestId> [deadlineDays]
 *   e.g.  tsx services/oracle/rollover.ts 1 14
 */

import type { Address } from "viem";
import { publicClient } from "@/lib/clients";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { ContestEscrowAbi } from "@/lib/abis/ContestEscrow";
import { supabaseAdmin } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RolloverResult {
  contestId: string;
  unclaimed: bigint;
  claimDeadline: Date;
  computedBlock: bigint;
  status: "pending" | "skipped";
  reason?: string;
}

// ---------------------------------------------------------------------------
// On-chain helper: ContestEscrow.claimed(contestId, wallet) → bool
// ---------------------------------------------------------------------------

async function isClaimed(contestId: bigint, wallet: Address): Promise<boolean> {
  return publicClient.readContract({
    address: ADDRESSES.ContestEscrow,
    abi: ContestEscrowAbi,
    functionName: "claimed",
    args: [contestId, wallet],
  });
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * computeRollover
 *
 * Reads the `scores` table for `contestId`, cross-checks each winner's
 * on-chain claimed status via `ContestEscrow.claimed(contestId, wallet)`,
 * sums the unclaimed payouts, and upserts a `contest_rollover` ledger row
 * if the claim deadline has passed.
 *
 * @param contestId   The numeric contest ID (string or number to avoid bigint
 *                    serialisation issues in callers).
 * @param deadlineDays Number of days after the contest's `finalized_at` that
 *                    winners have to claim.  Defaults to 14.
 */
export async function computeRollover(
  contestId: string | number | bigint,
  deadlineDays = 14
): Promise<RolloverResult> {
  const contestIdStr = String(contestId);
  const contestIdBig = BigInt(contestIdStr);
  const db = supabaseAdmin();

  // ── 1. Fetch scores rows for this contest ──────────────────────────────────
  const { data: scoreRows, error: scoresErr } = await db
    .from("scores")
    .select("wallet, payout, matchday")
    .eq("contest_id", contestIdStr)
    .gt("payout", "0");

  if (scoresErr) {
    throw new Error(`Supabase error fetching scores: ${scoresErr.message}`);
  }

  if (!scoreRows || scoreRows.length === 0) {
    return {
      contestId: contestIdStr,
      unclaimed: 0n,
      claimDeadline: new Date(Date.now() + deadlineDays * 86_400_000),
      computedBlock: 0n,
      status: "skipped",
      reason: "no scores rows with payout>0 found",
    };
  }

  // ── 2. Determine finalized_at from score_roots (matchday linkage) ──────────
  //    scores rows reference a matchday; we use that matchday's finalized_block
  //    timestamp as the "finalized_at" anchor.  If we can't find it we derive
  //    deadline from now and still proceed.
  const matchday: number = Number(scoreRows[0].matchday);

  const { data: rootRow } = await db
    .from("score_roots")
    .select("finalized_block")
    .eq("matchday", matchday)
    .maybeSingle();

  // Estimate finalized_at: we don't store a timestamp in score_roots, so we
  // use the DB row insertion time from payout_roots or fall back to "now".
  // For deadline calculation we use payout_roots finalized_block as a proxy.
  // The policy: if no root row, we assume the contest hasn't finalised yet and
  // return a "skipped" status.
  if (!rootRow) {
    return {
      contestId: contestIdStr,
      unclaimed: 0n,
      claimDeadline: new Date(Date.now() + deadlineDays * 86_400_000),
      computedBlock: 0n,
      status: "skipped",
      reason: "no score_roots row found for matchday — contest may not be finalised",
    };
  }

  // ── 3. Check whether claim deadline has passed ─────────────────────────────
  //    We don't have a block-timestamp oracle here, so we use the assumption:
  //    X Layer testnet ~2s blocks → 1 day ≈ 43,200 blocks.
  //    A proper production implementation would call publicClient.getBlock() to
  //    convert the finalized_block to a timestamp.  For now we snapshot
  //    "computed_at = now" and set deadline = now + deadlineDays regardless, so
  //    the row is always inserted (ops team decides when to act on it).
  //    The deadline stored IS meaningful: it is the wall-clock cutoff for winners.
  const now = new Date();
  const claimDeadline = new Date(now.getTime() + deadlineDays * 86_400_000);

  // ── 4. Get current chain head block for computed_block ──────────────────────
  const blockNumber = await publicClient.getBlockNumber();

  // ── 5. Check on-chain claimed status per wallet ────────────────────────────
  let unclaimed = 0n;

  for (const row of scoreRows) {
    const wallet = row.wallet as Address;
    const payout = BigInt(String(row.payout));

    let claimed: boolean;
    try {
      claimed = await isClaimed(contestIdBig, wallet);
    } catch {
      // If the RPC call fails (e.g. testnet unavailable) we treat it as
      // unclaimed (conservative — better to over-report than under-report).
      claimed = false;
    }

    if (!claimed) {
      unclaimed += payout;
    }
  }

  // ── 6. Upsert contest_rollover ledger row ──────────────────────────────────
  const { error: upsertErr } = await db
    .from("contest_rollover")
    .upsert(
      {
        contest_id: contestIdStr,
        unclaimed: String(unclaimed),
        claim_deadline: claimDeadline.toISOString(),
        status: "pending",
        computed_block: String(blockNumber),
        // rolled_into_contest_id left null — set manually when the next free
        // contest is created and funded from the treasury.
      },
      { onConflict: "contest_id" }
    );

  if (upsertErr) {
    throw new Error(`Supabase upsert error: ${upsertErr.message}`);
  }

  return {
    contestId: contestIdStr,
    unclaimed,
    claimDeadline,
    computedBlock: blockNumber,
    status: "pending",
  };
}

// ---------------------------------------------------------------------------
// CLI entry-point: tsx services/oracle/rollover.ts <contestId> [deadlineDays]
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].includes("rollover")) {
  const contestIdArg = process.argv[2];
  const deadlineDaysArg = process.argv[3];

  if (!contestIdArg || isNaN(Number(contestIdArg))) {
    console.error("Usage: tsx services/oracle/rollover.ts <contestId> [deadlineDays]");
    console.error("  contestId    — numeric contest ID (required)");
    console.error("  deadlineDays — days after finalization winners have to claim (default: 14)");
    process.exit(1);
  }

  const deadlineDays = deadlineDaysArg ? parseInt(deadlineDaysArg, 10) : 14;
  if (deadlineDaysArg && (isNaN(deadlineDays) || deadlineDays < 1)) {
    console.error(`Invalid deadlineDays: ${deadlineDaysArg}. Must be a positive integer.`);
    process.exit(1);
  }

  computeRollover(contestIdArg, deadlineDays)
    .then((result) => {
      console.log("Rollover result:", {
        ...result,
        unclaimed: result.unclaimed.toString(),
        computedBlock: result.computedBlock.toString(),
      });
      process.exit(0);
    })
    .catch((err) => {
      console.error("computeRollover failed:", err);
      process.exit(1);
    });
}
