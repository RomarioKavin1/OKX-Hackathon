"use client";

/**
 * /onboard — Onboarding page (FR-O3/O4/O5).
 *
 * Flow:
 *   1. Not logged in → "Connect Wallet" (Privy login modal).
 *   2. Logged in, not yet onboarded → "Claim your free 5-card Starter Squad" button.
 *      a. Sign an anti-sybil message with the active Privy wallet.
 *      b. POST /api/onboard { wallet, signature }.
 *      c. Poll /api/portfolio?wallet= and display the 5 minted cards.
 *   3. Cards shown → <TxButton> to claim baseline chips (ChipNFT.claimBaseline).
 *   4. After chips claimed → walkthrough hint (FR-O5):
 *      "Next: build your lineup →" link to /play.
 *      Persists "onboarded" flag in localStorage so the hint only shows once.
 *
 * Sub-components are defined at module scope (never inside the render function)
 * to avoid the "component defined during render" React/ESLint error.
 *
 * EXECUTION GATE: the POST /api/onboard call will return 502 until PRIVATE_KEY
 * is set to the CardNFT minter account. The UI surfaces this clearly.
 */

import { useCallback, useEffect, useState, startTransition } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { WalletButton } from "@/components/WalletButton";
import { TxButton } from "@/components/TxButton";
import { ADDRESSES, ABIS } from "@/lib/contracts";
import type { PortfolioResponse } from "@/app/api/portfolio/route";

// ---------------------------------------------------------------------------
// Fixed anti-sybil message (must match /api/onboard/route.ts)
// ---------------------------------------------------------------------------

function onboardMessage(wallet: string): string {
  return `ManagerCup onboarding: ${wallet.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Portfolio polling helper — iterative (no self-reference / closure issues)
// ---------------------------------------------------------------------------

/** Poll /api/portfolio until ≥5 cards appear or the attempt limit is reached. */
async function pollPortfolio(
  walletAddr: string,
  onCards: (cards: PortfolioResponse["cards"]) => void,
  onDone: () => void,
  maxAttempts = 12,
  intervalMs = 2500
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    try {
      const res = await fetch(
        `/api/portfolio?wallet=${encodeURIComponent(walletAddr)}`
      );
      if (!res.ok) continue;
      const data: PortfolioResponse = await res.json();
      if (data.cards.length >= 5) {
        onCards(data.cards.slice(0, 5));
        onDone();
        return;
      }
    } catch {
      // network hiccup — keep polling
    }
  }
  // Timed out — move to done anyway so the user isn't stuck
  onDone();
}

// ---------------------------------------------------------------------------
// Sub-components (module scope — never nested inside render)
// ---------------------------------------------------------------------------

interface CardPillProps {
  tokenId: string;
  playerId: string;
  tier: number;
}

function CardPill({ tokenId, playerId, tier }: CardPillProps) {
  const tierLabels: Record<number, string> = {
    0: "Common",
    1: "Rare",
    2: "Super Rare",
    3: "Unique",
  };
  const tierColors: Record<number, string> = {
    0: "bg-zinc-100 text-zinc-700 border-zinc-300",
    1: "bg-blue-50 text-blue-700 border-blue-300",
    2: "bg-purple-50 text-purple-700 border-purple-300",
    3: "bg-amber-50 text-amber-700 border-amber-300",
  };
  const colorClass = tierColors[tier] ?? tierColors[0];

  return (
    <div
      className={`rounded-lg border p-3 text-xs font-mono ${colorClass}`}
      aria-label={`Card token ${tokenId}, tier ${tierLabels[tier] ?? tier}`}
    >
      <div className="font-semibold">#{tokenId}</div>
      <div className="mt-1 truncate opacity-70">{playerId.slice(0, 12)}…</div>
      <div className="mt-1 font-sans font-medium">{tierLabels[tier] ?? `Tier ${tier}`}</div>
    </div>
  );
}

interface StepBadgeProps {
  step: number;
  active: boolean;
  done: boolean;
  label: string;
}

function StepBadge({ step, active, done, label }: StepBadgeProps) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? "opacity-100" : "opacity-50"}`}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold
          ${done ? "bg-emerald-500 text-white" : active ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-500"}`}
        aria-hidden
      >
        {done ? "✓" : step}
      </span>
      <span className={done ? "line-through opacity-60" : ""}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type OnboardPhase =
  | "idle"
  | "signing"
  | "calling"
  | "polling"
  | "done"
  | "error";

export default function OnboardPage() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const address = wallet?.address as Address | undefined;

  const [phase, setPhase] = useState<OnboardPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [cards, setCards] = useState<PortfolioResponse["cards"]>([]);
  const [chipsDone, setChipsDone] = useState(false);

  // Walkthrough hint: shown once after chips claimed
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  // localStorage-backed flag — read asynchronously in an effect so we never
  // call setState synchronously in the effect body.
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);

  // Re-check the localStorage flag whenever the connected wallet changes.
  // startTransition defers the setState out of the effect's synchronous body.
  useEffect(() => {
    if (!address) return;
    const flag = localStorage.getItem(`managercup:onboarded:${address.toLowerCase()}`);
    startTransition(() => {
      setAlreadyOnboarded(flag === "1");
    });
  }, [address]);

  const handleClaim = useCallback(async () => {
    if (!wallet || !address) return;

    setPhase("signing");
    setErrorMsg("");

    try {
      // Switch chain and build a viem WalletClient
      await wallet.switchChain(xLayerTestnet.id);
      const provider = await wallet.getEthereumProvider();
      const viemClient = createWalletClient({
        account: address,
        chain: xLayerTestnet,
        transport: custom(provider),
      });

      // Sign the fixed anti-sybil message
      const message = onboardMessage(address);
      const signature = await viemClient.signMessage({ account: address, message });

      setPhase("calling");

      // POST to /api/onboard
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, signature }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `Server error ${res.status}`);
      }

      setTxHash(json.txHash as Hex);
      setPhase("polling");

      // Poll for the minted cards
      await pollPortfolio(
        address.toLowerCase(),
        (mintedCards) => setCards(mintedCards),
        () => setPhase("done"),
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [wallet, address]);

  const handleChipsSuccess = useCallback(() => {
    setChipsDone(true);
    setShowWalkthrough(true);
    if (address) {
      localStorage.setItem(`managercup:onboarded:${address.toLowerCase()}`, "1");
    }
  }, [address]);

  const claimChipsRequest = {
    address: ADDRESSES.ChipNFT,
    abi: ABIS.ChipNFT,
    functionName: "claimBaseline" as const,
    args: [] as const,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-6 py-8">
        <p className="opacity-60">Loading…</p>
      </main>
    );
  }

  if (!authenticated || !address) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-8 py-8">
        <header>
          <h1 className="text-3xl font-bold">Welcome to ManagerCup</h1>
          <p className="mt-2 text-sm opacity-70">
            Build your squad. Beat the world. Connect your wallet to claim your
            free 5-card Starter Squad.
          </p>
        </header>
        <WalletButton />
        <button
          type="button"
          onClick={() => login()}
          className="w-fit rounded bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Connect Wallet to Get Started
        </button>
      </main>
    );
  }

  const isBusy = phase === "signing" || phase === "calling" || phase === "polling";

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 py-8">
      <header>
        <h1 className="text-3xl font-bold">Claim Your Starter Squad</h1>
        <p className="mt-2 text-sm opacity-70">
          Sign once to prove you own this wallet, and we&apos;ll airdrop 5 free
          Common cards + baseline chips so you can enter your first matchday.
        </p>
      </header>

      {/* Step tracker */}
      <section aria-label="Onboarding steps" className="flex flex-col gap-2">
        <StepBadge
          step={1}
          active
          done={phase === "done" || phase === "polling" || phase === "calling"}
          label="Sign anti-sybil message"
        />
        <StepBadge
          step={2}
          active={phase === "calling" || phase === "polling" || phase === "done"}
          done={phase === "done" || phase === "polling"}
          label="Airdrop 5 Common cards"
        />
        <StepBadge
          step={3}
          active={phase === "done"}
          done={chipsDone}
          label="Claim baseline chips"
        />
      </section>

      {/* Already onboarded banner */}
      {alreadyOnboarded && phase === "idle" && (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <strong>You&apos;ve already claimed your Starter Squad.</strong>
          {" "}Head to{" "}
          <Link href="/play" className="underline font-medium">
            /play
          </Link>{" "}
          to build your lineup.
        </div>
      )}

      {/* Main CTA */}
      {phase === "idle" && !alreadyOnboarded && (
        <button
          type="button"
          onClick={handleClaim}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-40"
        >
          Claim your free 5-card Starter Squad
        </button>
      )}

      {/* In-progress states */}
      {phase === "signing" && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700" role="status">
          Waiting for wallet signature…
        </p>
      )}
      {phase === "calling" && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700" role="status">
          Sending airdrop transaction…{" "}
          {txHash && (
            <span className="font-mono text-xs">{txHash.slice(0, 12)}…</span>
          )}
        </p>
      )}
      {phase === "polling" && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700" role="status">
          Transaction sent — waiting for indexer to confirm your cards…{" "}
          <span className="opacity-60">(this may take up to 30 s)</span>
        </p>
      )}

      {/* Error */}
      {phase === "error" && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <strong>Error:</strong> {errorMsg}
          {errorMsg.toLowerCase().includes("not minter") && (
            <p className="mt-1 opacity-80">
              (Execution gate: the server&apos;s PRIVATE_KEY is not the CardNFT
              minter. This will work once the owner key is configured.)
            </p>
          )}
          <button
            type="button"
            onClick={() => { setPhase("idle"); setErrorMsg(""); }}
            className="mt-2 text-xs underline opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* Minted cards */}
      {(phase === "done" || alreadyOnboarded) && cards.length > 0 && (
        <section aria-label="Your Starter Squad cards">
          <h2 className="mb-3 text-lg font-semibold">Your Starter Squad</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
            {cards.map((c) => (
              <div key={c.tokenId} role="listitem">
                <CardPill
                  tokenId={c.tokenId}
                  playerId={c.playerId}
                  tier={c.tier}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Claim baseline chips — shown after successful airdrop */}
      {phase === "done" && !chipsDone && (
        <section aria-label="Claim baseline chips">
          <h2 className="mb-2 text-lg font-semibold">Claim Baseline Chips</h2>
          <p className="mb-3 text-sm opacity-70">
            Chips let you use power-ups during matchdays (Triple Captain,
            Doubler, Free Hit). Claim your one-time baseline allocation now.
          </p>
          {!isBusy && (
            <TxButton
              request={claimChipsRequest}
              label="Claim baseline chips"
              onSuccess={handleChipsSuccess}
              disabled={chipsDone}
            />
          )}
        </section>
      )}

      {/* Walkthrough hint (FR-O5) */}
      {(showWalkthrough || chipsDone) && (
        <section
          aria-label="Next step"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-5"
        >
          <h2 className="text-base font-semibold text-emerald-900">
            You&apos;re all set!
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            Your Starter Squad and chips are ready. Now build your first lineup
            for the upcoming matchday.
          </p>
          <Link
            href="/play"
            className="mt-3 inline-block rounded bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Next: build your lineup →
          </Link>
        </section>
      )}

      {/* Wallet info footer */}
      <footer className="mt-2 text-xs opacity-50">
        Connected: <span className="font-mono">{address}</span>
      </footer>
    </main>
  );
}
