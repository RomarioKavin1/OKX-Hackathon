/**
 * POST /api/dispute
 *
 * Body: { wallet?: string; matchday?: number; contestId?: string; kind: string; message: string }
 *
 * Validates input and inserts into `disputes` table via supabaseAdmin.
 * Returns { id } (the UUID tracking id).
 *
 * Validation rules:
 *   - kind ∈ { score | payout | data | other }  (else 400)
 *   - message: 1 ≤ char_length ≤ 4000            (else 400)
 *   - matchday: integer if present
 *   - wallet / contestId: optional strings, no format enforcement here
 *
 * Rate-limit note: basic (no external limiter); callers should apply
 * reverse-proxy or middleware rate-limiting in production.
 */

import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const VALID_KINDS = ["score", "payout", "data", "other"] as const;
type DisputeKind = typeof VALID_KINDS[number];

function isValidKind(v: unknown): v is DisputeKind {
  return VALID_KINDS.includes(v as DisputeKind);
}

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // 2. Validate `kind`
  if (!isValidKind(raw.kind)) {
    return Response.json(
      { error: `kind must be one of: ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  // 3. Validate `message`
  if (typeof raw.message !== "string") {
    return Response.json({ error: "message is required and must be a string" }, { status: 400 });
  }
  const message = raw.message;
  if (message.length < 1 || message.length > 4000) {
    return Response.json(
      { error: "message must be between 1 and 4000 characters" },
      { status: 400 },
    );
  }

  // 4. Optional fields
  const wallet =
    typeof raw.wallet === "string" && raw.wallet.trim().length > 0
      ? raw.wallet.trim()
      : null;

  let matchday: number | null = null;
  if (raw.matchday !== undefined && raw.matchday !== null) {
    const md = Number(raw.matchday);
    if (!Number.isInteger(md) || md < 1) {
      return Response.json({ error: "matchday must be a positive integer" }, { status: 400 });
    }
    matchday = md;
  }

  const contestId =
    typeof raw.contestId === "string" && raw.contestId.trim().length > 0
      ? raw.contestId.trim()
      : null;

  // 5. Insert into disputes via admin client
  let db: ReturnType<typeof supabaseAdmin>;
  try {
    db = supabaseAdmin();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Server config error: ${msg}` }, { status: 500 });
  }

  const { data, error } = await db
    .from("disputes")
    .insert({
      wallet,
      matchday,
      contest_id: contestId,
      kind: raw.kind as DisputeKind,
      message,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { error: `Failed to file dispute: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ id: (data as { id: string }).id }, { status: 201 });
}
