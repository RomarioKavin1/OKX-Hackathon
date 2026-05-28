"use client";

/**
 * /settings — Wallet settings page (FR-O6 / Task 7.5)
 *
 * Sections:
 *   1. USDC Faucet — claim 1 000 test USDC via MockUSDC.faucet(amount).
 *   2. Chip Balances — live read of each chip type via ChipNFT.balanceOf.
 *   3. Claim History — live read of payout-eligible contest results from
 *      /api/profile/claims, enriched with on-chain claimed status.
 *   4. Tutorial — "Replay tutorial" button clears the per-wallet onboarding
 *      localStorage flag so the /onboard walkthrough shows again.
 *
 * Sub-components are defined at module scope (never inside the render function)
 * to avoid the "component defined during render" React/ESLint error.
 *
 * Balance reads use the async-IIFE + cancelled-flag pattern; no synchronous
 * setState inside an effect body.
 */

import { useCallback, useEffect, useState, startTransition } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { TxButton } from "@/components/TxButton";
import { WalletButton } from "@/components/WalletButton";
import { chipBalance, usdcBalance } from "@/lib/actions/reads";
import { fmtUsdc, toUsdc } from "@/lib/business/format";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import { ChipId } from "@/lib/types";
import {
  Panel,
  Pill,
  SectionHeading,
  Skeleton,
  Button,
  cx,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Amount minted by the faucet: 1 000 USDC (6 decimals). */
const FAUCET_AMOUNT: bigint = toUsdc(1000);

/**
 * The localStorage key written by /onboard after chips are claimed.
 * Matches `managercup:onboarded:${address.toLowerCase()}` in onboard/page.tsx.
 */
function onboardedKey(address: Address): string {
  return `managercup:onboarded:${address.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Chip metadata (mirrors ChipId enum in lib/types.ts)
// ---------------------------------------------------------------------------

interface ChipMeta {
  id: ChipId;
  name: string;
  description: string;
}

const CHIPS: ChipMeta[] = [
  {
    id: ChipId.TripleCaptain,
    name: "Triple Captain",
    description: "Your captain scores 3× points for one matchday.",
  },
  {
    id: ChipId.Doubler,
    name: "Doubler",
    description: "Every player in your lineup scores 2× points for one matchday.",
  },
  {
    id: ChipId.Wildcard,
    name: "Wildcard",
    description: "Change your entire lineup without penalty once per season.",
  },
  {
    id: ChipId.FreeHit,
    name: "Free Hit",
    description: "Play a one-off squad for a single matchday.",
  },
];

// ---------------------------------------------------------------------------
// FORM_CONTROL class — shared input style per the design spec
// ---------------------------------------------------------------------------

const FORM_CONTROL =
  "rounded-sm border border-line-2 bg-paper-2 text-ink px-3 h-10 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-cobalt w-full";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

interface UsdcFaucetSectionProps {
  address: Address;
  onSuccess: () => void;
}

function UsdcFaucetSection({ address, onSuccess }: UsdcFaucetSectionProps) {
  const [currentBalance, setCurrentBalance] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bal = await usdcBalance(address);
        if (!cancelled) {
          startTransition(() => setCurrentBalance(bal));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const faucetRequest = {
    address: ADDRESSES.MockUSDC,
    abi: ABIS.MockUSDC,
    functionName: "faucet" as const,
    args: [FAUCET_AMOUNT] as const,
  };

  function handleFaucetSuccess() {
    onSuccess();
    // Refresh the displayed balance after mint
    void (async () => {
      try {
        const bal = await usdcBalance(address);
        startTransition(() => setCurrentBalance(bal));
      } catch {
        // ignore
      }
    })();
  }

  return (
    <section aria-label="USDC Faucet">
      <SectionHeading
        kicker="Testnet"
        title="USDC Faucet"
        className="mb-4"
      />
      <Panel variant="paper" className="p-5">
        <p className="mb-4 text-sm text-ink-2">
          Mint <strong className="text-ink font-semibold">1,000 test USDC</strong> to
          your wallet for use in packs, rentals, and contests on the X Layer testnet.
        </p>

        {/* Balance display */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Current balance
          </label>
          {currentBalance !== null ? (
            <div className={cx(FORM_CONTROL, "flex items-center font-mono select-all")}>
              {fmtUsdc(currentBalance)} USDC
            </div>
          ) : (
            <Skeleton className="h-10 w-full" />
          )}
        </div>

        <TxButton
          request={faucetRequest}
          label="Claim 1,000 test USDC"
          onSuccess={handleFaucetSuccess}
        />
      </Panel>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface ChipRowProps {
  chip: ChipMeta;
  address: Address;
}

function ChipRow({ chip, address }: ChipRowProps) {
  const [bal, setBal] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await chipBalance(address, chip.id);
        if (!cancelled) {
          startTransition(() => setBal(b));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chip.id]);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{chip.name}</p>
        <p className="mt-0.5 text-xs text-muted">{chip.description}</p>
      </div>
      <span
        className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink min-w-[2rem] text-right"
        aria-label={`${chip.name} balance`}
      >
        {bal === null ? <Skeleton className="inline-block h-4 w-6" /> : bal.toString()}
      </span>
    </div>
  );
}

interface ChipBalancesSectionProps {
  address: Address;
}

function ChipBalancesSection({ address }: ChipBalancesSectionProps) {
  return (
    <section aria-label="Chip Balances">
      <SectionHeading
        kicker="Power-ups"
        title="Chip Balances"
        className="mb-4"
      />
      <Panel variant="paper" className="px-5 pt-1 pb-1">
        <p className="mt-4 mb-2 text-sm text-ink-2">
          Chips are one-use power-ups played when committing your lineup.
        </p>
        <div>
          {CHIPS.map((chip) => (
            <ChipRow key={chip.id} chip={chip} address={address} />
          ))}
        </div>
      </Panel>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface ClaimRow {
  matchday: number;
  contestId: string;
  score: number;
  rank: number | null;
  payout: string;        // USDC base units (string-encoded bigint)
  claimed: boolean;
  proof: string[];
}

interface ClaimHistorySectionProps {
  address: Address;
}

function ClaimHistorySection({ address }: ClaimHistorySectionProps) {
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/profile/claims?wallet=${address.toLowerCase()}&limit=25`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { claims: ClaimRow[] };
        if (!cancelled) {
          startTransition(() => {
            setClaims(body.claims);
            setError(null);
          });
        }
      } catch (e) {
        if (!cancelled) {
          startTransition(() => setError((e as Error).message));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (error) {
    return (
      <section aria-label="Claim History">
        <SectionHeading
          kicker="Payouts"
          title="Claim History"
          className="mb-4"
        />
        <Panel variant="paper" className="p-5">
          <p className="flex items-center gap-2 text-sm text-danger" role="alert">
            <span aria-hidden>✗</span>
            Failed to load: {error}
          </p>
        </Panel>
      </section>
    );
  }

  if (claims === null) {
    return (
      <section aria-label="Claim History">
        <SectionHeading
          kicker="Payouts"
          title="Claim History"
          className="mb-4"
        />
        <Panel variant="paper" className="p-5 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </Panel>
      </section>
    );
  }

  return (
    <section aria-label="Claim History">
      <SectionHeading
        kicker="Payouts"
        title="Claim History"
        className="mb-4"
      />
      <Panel variant="paper" className="p-5">
        {claims.length === 0 ? (
          <p className="text-sm text-muted">
            No payouts yet. Win a paid contest and your claim history appears here.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-2">
              Your last {claims.length} payout-eligible contest results. Unclaimed
              prizes can be collected from each contest page.
            </p>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[36rem]">
                <thead>
                  <tr className="border-b border-line-2">
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Matchday
                    </th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Contest
                    </th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Rank
                    </th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Payout
                    </th>
                    <th className="py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr
                      key={`${c.matchday}-${c.contestId}`}
                      className="border-b border-line last:border-0"
                    >
                      <td className="py-2.5 pr-4 font-mono text-sm text-ink">
                        {c.matchday}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-sm text-ink">
                        #{c.contestId}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-sm text-ink">
                        {c.rank ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-sm text-ink">
                        {fmtUsdc(BigInt(c.payout))} USDC
                      </td>
                      <td className="py-2.5">
                        {c.claimed ? (
                          <Pill tone="ok">Claimed</Pill>
                        ) : (
                          <Pill tone="warn">Unclaimed</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface TutorialSectionProps {
  address: Address;
}

function TutorialSection({ address }: TutorialSectionProps) {
  const [cleared, setCleared] = useState(false);

  function handleReplayTutorial() {
    localStorage.removeItem(onboardedKey(address));
    startTransition(() => setCleared(true));
  }

  return (
    <section aria-label="Tutorial">
      <SectionHeading
        kicker="Onboarding"
        title="Tutorial"
        className="mb-4"
      />
      <Panel variant="paper" className="p-5">
        <p className="mb-4 text-sm text-ink-2">
          Already completed the onboarding walkthrough but want to see it again?
          Click the button below. The next visit to{" "}
          <a
            href="/onboard"
            className="font-semibold text-cobalt-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-cobalt"
          >
            /onboard
          </a>{" "}
          will replay the full tutorial.
        </p>
        {cleared ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-sm border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok"
          >
            Tutorial flag cleared. Visit{" "}
            <a
              href="/onboard"
              className="font-semibold underline underline-offset-2"
            >
              /onboard
            </a>{" "}
            to replay the walkthrough.
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={handleReplayTutorial}
          >
            Replay tutorial
          </Button>
        )}
      </Panel>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  // Used to force a USDC balance refresh after the faucet call
  const [faucetKey, setFaucetKey] = useState(0);
  const handleFaucetSuccess = useCallback(() => {
    setFaucetKey((k) => k + 1);
  }, []);

  if (!ready) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 py-10" aria-live="polite">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full rounded-card" />
      </main>
    );
  }

  if (!authenticated || !address) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-8 py-10">
        <header>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-flame">
            Account
          </p>
          <h1 className="display text-4xl text-ink">Settings</h1>
          <p className="mt-2 text-sm text-ink-2">
            Connect your wallet to manage balances and preferences.
          </p>
        </header>
        <Panel variant="sunken" className="flex flex-col items-start gap-4 p-6">
          <p className="text-sm text-muted">No wallet connected.</p>
          <WalletButton />
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 py-10">
      {/* Page header */}
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flame">
          Account
        </p>
        <h1 className="display text-4xl text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Manage your wallet, balances, and preferences.
        </p>
      </header>

      {/* Connected wallet callout */}
      <Panel variant="ink" className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-on-panel-muted">
            Connected wallet
          </p>
          <p
            className="truncate font-mono text-sm text-on-panel"
            title={address}
            aria-label={`Connected address: ${address}`}
          >
            {address}
          </p>
        </div>
        <Pill tone="cobalt">X Layer Testnet</Pill>
      </Panel>

      <UsdcFaucetSection
        key={faucetKey}
        address={address}
        onSuccess={handleFaucetSuccess}
      />

      <ChipBalancesSection address={address} />

      <ClaimHistorySection address={address} />

      <TutorialSection address={address} />
    </main>
  );
}
