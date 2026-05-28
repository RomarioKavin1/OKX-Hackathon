/**
 * publish.test.ts — Unit tests for the multi-signer loop helper
 *
 * Tests the `submitRootWithSigners` helper exported from publish.ts.
 * This helper is the sole new logic introduced for multi-signer support;
 * the rest of publishMatchday() is covered by integration tests.
 *
 * All tests run offline — no network, no Supabase, no chain.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WalletClient } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
// Mock heavy imports so publish.ts can be imported without a chain / Supabase
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/actions/writes", () => ({
  submitScoreRoot: vi.fn(),
  submitPayoutRoot: vi.fn(),
  waitFor: vi.fn(),
}));
vi.mock("@/lib/clients", () => ({
  getScriptWalletClient: vi.fn(),
}));
vi.mock("@/lib/actions/reads", () => ({
  cardMeta: vi.fn(),
  staminaOf: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: vi.fn(),
}));
vi.mock("./score", () => ({
  computeLineupScore: vi.fn(),
}));
vi.mock("./roots", () => ({
  isDNP: vi.fn(),
  buildScoreRoot: vi.fn(),
  buildDnpRoot: vi.fn(),
  buildContestPayoutRoot: vi.fn(),
}));
vi.mock("@/lib/business/lineup", () => ({
  isEligibleForContest: vi.fn(),
}));

// Import the helper under test AFTER mocks are registered
import { submitRootWithSigners } from "./publish";
import { waitFor } from "@/lib/actions/writes";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeWallet(addr: string): WalletClient {
  return { account: { address: addr } } as unknown as WalletClient;
}

const MOCK_RECEIPT = { status: "success", blockNumber: 42n } as Awaited<ReturnType<typeof waitFor>>;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("submitRootWithSigners", () => {
  const walletA = makeWallet("0xAAAA");
  const walletB = makeWallet("0xBBBB");
  const walletC = makeWallet("0xCCCC");

  beforeEach(() => {
    vi.mocked(waitFor).mockResolvedValue(MOCK_RECEIPT);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls submitFn once per wallet and returns the last receipt", async () => {
    const submitFn = vi.fn().mockResolvedValue("0xtxhash");

    const receipt = await submitRootWithSigners(
      [walletA, walletB, walletC],
      submitFn,
      "scoreRoot matchday=1",
    );

    expect(submitFn).toHaveBeenCalledTimes(3);
    expect(submitFn).toHaveBeenCalledWith(walletA);
    expect(submitFn).toHaveBeenCalledWith(walletB);
    expect(submitFn).toHaveBeenCalledWith(walletC);
    expect(receipt).toBe(MOCK_RECEIPT);
  });

  it("does NOT throw when some signers fail — skips to next", async () => {
    // walletA fails (e.g. AlreadyExists / already voted), walletB succeeds
    const submitFn = vi.fn()
      .mockRejectedValueOnce(new Error("AlreadyExists: already voted"))
      .mockResolvedValueOnce("0xtxhash");

    const receipt = await submitRootWithSigners(
      [walletA, walletB],
      submitFn,
      "scoreRoot matchday=1",
    );

    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(receipt).toBe(MOCK_RECEIPT);
  });

  it("THROWS when every signer fails", async () => {
    const submitFn = vi.fn().mockRejectedValue(new Error("NotAuthorized: not a signer"));

    await expect(
      submitRootWithSigners([walletA, walletB], submitFn, "scoreRoot matchday=1"),
    ).rejects.toThrow("No signer successfully submitted scoreRoot matchday=1");
  });

  it("short-circuits on 'already finalized' — remaining signers are NOT called", async () => {
    // walletA succeeds, walletB gets the finalized error — loop should stop before walletC
    const submitFn = vi.fn()
      .mockResolvedValueOnce("0xtxhash") // walletA succeeds
      .mockRejectedValueOnce(new Error("AlreadyExists: matchday already finalized")); // walletB hits finalized

    const receipt = await submitRootWithSigners(
      [walletA, walletB, walletC],
      submitFn,
      "scoreRoot matchday=1",
    );

    // walletA succeeded → receipt is set before walletB fires
    expect(receipt).toBe(MOCK_RECEIPT);
    // walletC must NOT have been called after the finalized error
    expect(submitFn).toHaveBeenCalledTimes(2);
    expect(submitFn).not.toHaveBeenCalledWith(walletC);
  });

  it("returns the receipt from the last SUCCESSFUL call when multiple signers succeed", async () => {
    const receiptA = { status: "success", blockNumber: 10n } as typeof MOCK_RECEIPT;
    const receiptB = { status: "success", blockNumber: 11n } as typeof MOCK_RECEIPT;

    vi.mocked(waitFor)
      .mockResolvedValueOnce(receiptA)
      .mockResolvedValueOnce(receiptB);

    const submitFn = vi.fn().mockResolvedValue("0xtxhash");

    const receipt = await submitRootWithSigners(
      [walletA, walletB],
      submitFn,
      "payoutRoot contest=1",
    );

    // Should be the LAST successful receipt
    expect(receipt).toBe(receiptB);
    expect(receipt.blockNumber).toBe(11n);
  });

  it("single signer success behaves identically to current single-key mode", async () => {
    const submitFn = vi.fn().mockResolvedValue("0xtxhash");

    const receipt = await submitRootWithSigners([walletA], submitFn, "scoreRoot matchday=5");

    expect(submitFn).toHaveBeenCalledTimes(1);
    expect(submitFn).toHaveBeenCalledWith(walletA);
    expect(receipt).toBe(MOCK_RECEIPT);
  });

  it("non-finalized errors (e.g. NotAuthorized) do NOT break the loop early", async () => {
    // All three fail with NotAuthorized → should exhaust the list and then throw
    const submitFn = vi.fn().mockRejectedValue(new Error("NotAuthorized"));

    await expect(
      submitRootWithSigners([walletA, walletB, walletC], submitFn, "scoreRoot matchday=2"),
    ).rejects.toThrow();

    // All three were attempted
    expect(submitFn).toHaveBeenCalledTimes(3);
  });
});
