"use client";

/**
 * /settings — Wallet settings page (FR-O6 / Task 7.5)
 *
 * Sections:
 *   1. USDC Faucet — claim 1 000 test USDC via MockUSDC.faucet(amount).
 *   2. Chip Balances — live read of each chip type via ChipNFT.balanceOf.
 *   3. Claim History — placeholder (live data requires indexer / Supabase query).
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
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

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
    <Section title="USDC Faucet">
      <p className="mb-2 text-sm text-zinc-600">
        Mint <strong>1 000 test USDC</strong> to your wallet for use in packs,
        rentals, and contests on the X Layer testnet.
      </p>
      {currentBalance !== null && (
        <p className="mb-4 text-sm">
          Current balance:{" "}
          <span className="font-mono font-medium">
            {fmtUsdc(currentBalance)} USDC
          </span>
        </p>
      )}
      <TxButton
        request={faucetRequest}
        label="Claim 1 000 test USDC"
        onSuccess={handleFaucetSuccess}
      />
    </Section>
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
    <div className="flex items-start justify-between gap-4 rounded-lg bg-zinc-50 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-sm text-zinc-900">{chip.name}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{chip.description}</p>
      </div>
      <span
        className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-mono font-semibold text-zinc-700 min-w-[2rem] text-center"
        aria-label={`${chip.name} balance`}
      >
        {bal === null ? "…" : bal.toString()}
      </span>
    </div>
  );
}

interface ChipBalancesSectionProps {
  address: Address;
}

function ChipBalancesSection({ address }: ChipBalancesSectionProps) {
  return (
    <Section title="Chip Balances">
      <p className="mb-3 text-sm text-zinc-600">
        Chips are one-use power-ups you play when committing your lineup.
      </p>
      <div className="flex flex-col gap-2">
        {CHIPS.map((chip) => (
          <ChipRow key={chip.id} chip={chip} address={address} />
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function ClaimHistorySection() {
  return (
    <Section title="Claim History">
      <p className="text-sm text-zinc-500 italic">
        Full claim history (contests, season leaderboard, insurance payouts)
        will be available here once the indexer sync is live.
      </p>
    </Section>
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
    <Section title="Tutorial">
      <p className="mb-4 text-sm text-zinc-600">
        Already completed the onboarding walkthrough but want to see it again?
        Click the button below — the next visit to{" "}
        <a href="/onboard" className="underline font-medium">
          /onboard
        </a>{" "}
        will replay the full tutorial.
      </p>
      {cleared ? (
        <div
          role="status"
          className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800"
        >
          Tutorial flag cleared. Visit{" "}
          <a href="/onboard" className="underline font-medium">
            /onboard
          </a>{" "}
          to replay the walkthrough.
        </div>
      ) : (
        <button
          type="button"
          onClick={handleReplayTutorial}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Replay tutorial
        </button>
      )}
    </Section>
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
      <main className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
        <p className="text-sm opacity-60" aria-live="polite">
          Loading…
        </p>
      </main>
    );
  }

  if (!authenticated || !address) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-8 py-8">
        <header>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-2 text-sm opacity-70">
            Connect your wallet to access settings.
          </p>
        </header>
        <WalletButton />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm opacity-70">
          Manage your wallet, balances, and preferences.
        </p>
      </header>

      <UsdcFaucetSection
        key={faucetKey}
        address={address}
        onSuccess={handleFaucetSuccess}
      />

      <ChipBalancesSection address={address} />

      <ClaimHistorySection />

      <TutorialSection address={address} />

      <footer className="mt-2 text-xs opacity-50">
        Connected: <span className="font-mono">{address}</span>
      </footer>
    </main>
  );
}
