/**
 * GET /api/rollover
 *
 * Transparency endpoint: returns `contest_rollover` rows from Supabase so
 * the UI can display which contests had unclaimed prizes and what the
 * rollover policy resolved to.
 *
 * Query params (all optional):
 *   contestId — filter to a single contest (numeric string)
 *   status    — filter by status; one of: pending, rolled, expired
 *
 * Response:
 *   { rollovers: RolloverRow[] }
 *
 * RolloverRow fields (all from the `contest_rollover` Supabase table):
 *   contest_id             string  (numeric, stored as numeric(78,0))
 *   unclaimed              string  (USDC amount, 6-decimal raw units)
 *   claim_deadline         string  (ISO-8601 timestamp)
 *   rolled_into_contest_id string | null
 *   status                 string  ("pending" | "rolled" | "expired")
 *   computed_block         string  (chain head block at compute time)
 *
 * Auth: anonymous (anon-key Supabase read — RLS policy "read rollover" allows
 *       SELECT to anon on public.contest_rollover).
 *
 * Security note: the service-role key is NEVER used here; reads are through
 *   supabaseAnonServer() which only has the publishable key.
 */

import type { NextRequest } from "next/server";
import { supabaseAnonServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RolloverRow {
  contest_id: string;
  unclaimed: string;
  claim_deadline: string;
  rolled_into_contest_id: string | null;
  status: string;
  computed_block: string;
}

export interface RolloverResponse {
  rollovers: RolloverRow[];
}

const VALID_STATUSES = new Set(["pending", "rolled", "expired"]);

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;
  const contestIdParam = searchParams.get("contestId");
  const statusParam = searchParams.get("status");

  // ── Validate optional contestId ──────────────────────────────────────────
  if (contestIdParam !== null) {
    const trimmed = contestIdParam.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
      return Response.json(
        { error: "Invalid query param: contestId must be a non-negative integer string" },
        { status: 400 }
      );
    }
  }

  // ── Validate optional status ─────────────────────────────────────────────
  if (statusParam !== null) {
    const trimmed = statusParam.trim();
    if (trimmed === "" || !VALID_STATUSES.has(trimmed)) {
      return Response.json(
        {
          error: `Invalid query param: status must be one of ${[...VALID_STATUSES].join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  // ── Query Supabase (anon read) ────────────────────────────────────────────
  const db = supabaseAnonServer();

  let query = db
    .from("contest_rollover")
    .select(
      "contest_id, unclaimed, claim_deadline, rolled_into_contest_id, status, computed_block"
    )
    .order("contest_id", { ascending: true });

  if (contestIdParam !== null) {
    query = query.eq("contest_id", contestIdParam.trim());
  }

  if (statusParam !== null) {
    query = query.eq("status", statusParam.trim());
  }

  const { data, error } = await query;

  if (error) {
    return Response.json(
      { error: `Supabase error: ${error.message}` },
      { status: 500 }
    );
  }

  const rollovers: RolloverRow[] = (data ?? []).map((row) => ({
    contest_id: String(row.contest_id),
    unclaimed: String(row.unclaimed),
    claim_deadline: row.claim_deadline,
    rolled_into_contest_id:
      row.rolled_into_contest_id != null ? String(row.rolled_into_contest_id) : null,
    status: row.status,
    computed_block: String(row.computed_block),
  }));

  return Response.json({ rollovers } satisfies RolloverResponse);
}
