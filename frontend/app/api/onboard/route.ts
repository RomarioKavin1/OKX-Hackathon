/**
 * POST /api/onboard
 *
 * Body: { wallet: string; signature: string }
 *
 * Anti-sybil onboarding flow:
 *   1. Validate inputs.
 *   2. Verify the EIP-191 personal_sign signature recovers to `wallet`
 *      (message: "PANENKA onboarding: <wallet>").
 *   3. Reject if wallet already onboarded (one-per-wallet, FR-CT9).
 *   4. Airdrop 5 deterministic Common cards via the contract owner/minter key.
 *   5. Insert { wallet, tx_hash } into `onboarded`.
 *   6. Return { txHash }.
 *
 * EXECUTION GATE — the airdrop call on step 4 uses `PRIVATE_KEY` (the
 * contract minter/owner). The key currently configured in repo-root `.env`
 * is NOT the CardNFT minter, so `airdropStarterSquad` will revert with
 * "Not minter" until the owner key is set. The code is authored correctly;
 * the tx will succeed once `PRIVATE_KEY` holds the minter account.
 *
 * ENV NOTE — Next.js App Router route handlers run server-side and have
 * access to `process.env` for server-only vars (no `NEXT_PUBLIC_` prefix
 * needed). If the repo-root `.env` is not loaded automatically by the
 * deployment environment, `PRIVATE_KEY` must be injected via the deploy
 * platform's secret manager (Vercel env vars, Fly secrets, etc.).
 */

import type { NextRequest } from "next/server";
import { verifyMessage, isAddress, type Hex } from "viem";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getScriptWalletClient } from "@/lib/clients";
import { airdropStarterSquad } from "@/lib/actions/writes";
import { PLAYERS } from "@/lib/data/players";

// ---------------------------------------------------------------------------
// Deterministic starter squad — 5 Common players from the catalog.
// One per position: GK, DEF, MID, FWD, FWD (recognisable names to delight
// new users). Must stay stable across deploys (same index picks = same squad).
// ---------------------------------------------------------------------------

const STARTER_PLAYER_IDS: Hex[] = (() => {
  const byPosition = (pos: string) =>
    PLAYERS.filter((p) => p.position === pos);

  const picks = [
    byPosition("GK")[0],   // Maignan (FRA GK)
    byPosition("DEF")[0],  // Pavard (FRA DEF)
    byPosition("MID")[0],  // Tchouaméni (FRA MID)
    byPosition("FWD")[0],  // Dembélé (FRA FWD)
    byPosition("FWD")[1],  // Giroud (FRA FWD)
  ];

  return picks.map((p) => p.playerId as Hex);
})();

// ---------------------------------------------------------------------------
// Fixed anti-sybil message (must match the client)
// ---------------------------------------------------------------------------

function onboardMessage(wallet: string): string {
  return `PANENKA onboarding: ${wallet.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).wallet !== "string" ||
    typeof (body as Record<string, unknown>).signature !== "string"
  ) {
    return Response.json(
      { error: "Body must be { wallet: string; signature: string }" },
      { status: 400 }
    );
  }

  const { wallet: rawWallet, signature } = body as {
    wallet: string;
    signature: string;
  };

  const wallet = rawWallet.trim().toLowerCase();

  // 2. Basic address validation
  if (!isAddress(wallet)) {
    return Response.json(
      { error: "wallet must be a valid EVM address" },
      { status: 400 }
    );
  }

  if (!/^0x[0-9a-fA-F]{130}$/.test(signature.trim())) {
    return Response.json(
      { error: "signature must be a 65-byte hex string (0x + 130 hex chars)" },
      { status: 400 }
    );
  }

  // 3. Verify the EIP-191 personal_sign signature
  const message = onboardMessage(wallet);
  let valid: boolean;
  try {
    valid = await verifyMessage({
      address: wallet as Hex,
      message,
      signature: signature as Hex,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return Response.json(
      { error: "Signature verification failed — message or signer mismatch" },
      { status: 401 }
    );
  }

  // 4. One-per-wallet guard (FR-CT9)
  const db = supabaseAdmin();

  const existingRes = await db
    .from("onboarded")
    .select("wallet")
    .eq("wallet", wallet)
    .maybeSingle();

  if (existingRes.error) {
    return Response.json(
      { error: `DB error (onboarded check): ${existingRes.error.message}` },
      { status: 500 }
    );
  }

  if (existingRes.data !== null) {
    return Response.json(
      { error: "This wallet has already claimed its starter squad" },
      { status: 409 }
    );
  }

  // 5. Airdrop starter squad via the contract minter/owner key
  //
  // EXECUTION GATE: PRIVATE_KEY must be the CardNFT minter.
  // Until the correct key is configured, this call will revert on-chain with
  // "Not minter". The code is structurally correct.
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    return Response.json(
      {
        error:
          "Server configuration error: PRIVATE_KEY is not set. " +
          "The contract minter key must be provided via the deployment environment.",
      },
      { status: 500 }
    );
  }

  let txHash: Hex;
  try {
    const minterWallet = getScriptWalletClient(privateKey as Hex);
    txHash = await airdropStarterSquad(
      minterWallet,
      wallet as Hex,       // recipient = the onboarding user
      STARTER_PLAYER_IDS,  // 5 deterministic Common player ids
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the "Not minter" revert clearly so the deployer knows the gate
    return Response.json(
      { error: `Airdrop failed (likely not minter): ${msg}` },
      { status: 502 }
    );
  }

  // 6. Record in `onboarded` (idempotency guard for future re-entrancy)
  const insertRes = await db
    .from("onboarded")
    .insert({ wallet, tx_hash: txHash });

  if (insertRes.error) {
    // Tx already mined; log the DB failure but do not fail the response
    console.error(
      "[/api/onboard] DB insert failed after successful airdrop:",
      insertRes.error.message,
      "txHash:",
      txHash
    );
    // Return txHash anyway — the user got their squad; admin can patch DB
  }

  return Response.json({ txHash }, { status: 200 });
}
