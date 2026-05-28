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
import { PlayerCard } from "@/components/PlayerCard";
import { PLAYERS, tierStats } from "@/lib/data/players";
import { Tier } from "@/lib/types";
import {
  Button,
  buttonClasses,
  Pill,
  Panel,
  Skeleton,
  cx,
} from "@/components/ui";
import type { TierId } from "@/components/ui";
import type { Nation } from "@/lib/data/nations";

// ---------------------------------------------------------------------------
// Fixed anti-sybil message (must match /api/onboard/route.ts)
// ---------------------------------------------------------------------------

function onboardMessage(wallet: string): string {
  return `PANENKA onboarding: ${wallet.toLowerCase()}`;
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
// Preview squad — shown before the airdrop lands, gives the page life.
// Five Common-tier players from the catalog, one per position archetype.
// ---------------------------------------------------------------------------

const PREVIEW_SQUAD: { key: string; tier: TierId }[] = [
  { key: "FRA-1-Maignan",    tier: 0 },
  { key: "FRA-5-Kounde",     tier: 0 },
  { key: "FRA-8-Tchouameni", tier: 0 },
  { key: "FRA-11-Dembele",   tier: 0 },
  { key: "FRA-10-Mbappe",    tier: 0 },
];

// ---------------------------------------------------------------------------
// StepRow — numbered step with done/active states (module scope)
// ---------------------------------------------------------------------------

interface StepRowProps {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}

function StepRow({ step, label, active, done }: StepRowProps) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 text-sm transition-opacity duration-150",
        active ? "opacity-100" : "opacity-40",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          done
            ? "bg-ok text-on-panel"
            : active
            ? "bg-ink text-on-panel"
            : "bg-paper-3 text-muted",
        )}
      >
        {done ? "✓" : step}
      </span>
      <span className={cx("font-medium", done && "line-through opacity-60")}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MintedCardGrid — renders real PlayerCards from PortfolioResponse
// ---------------------------------------------------------------------------

interface MintedCard {
  tokenId: string;
  playerId: string;
  tier: number;
}

function MintedCardGrid({ cards }: { cards: MintedCard[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
      role="list"
    >
      {cards.map((c) => {
        // Try to match the card back to a catalog player by on-chain playerId.
        const def = PLAYERS.find((p) => p.playerId === c.playerId);
        const tier = (Math.min(c.tier, 3) as TierId) ?? 0;
        if (def) {
          return (
            <div key={c.tokenId} role="listitem">
              <PlayerCard
                name={def.name}
                nation={def.nation}
                position={def.position}
                tier={tier}
                stats={tierStats(def.base, tier as unknown as Tier)}
                size="sm"
              />
            </div>
          );
        }
        // Fallback for unknown playerId: generic card with truncated id
        return (
          <div key={c.tokenId} role="listitem">
            <PlayerCard
              name={`#${c.tokenId}`}
              nation={"FRA" as Nation}
              position="MID"
              tier={tier}
              size="sm"
            />
          </div>
        );
      })}
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

  const isBusy = phase === "signing" || phase === "calling" || phase === "polling";

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (!ready) {
    return (
      <main
        aria-label="Loading onboarding"
        className="mx-auto flex max-w-2xl flex-col gap-6 py-12"
      >
        <Skeleton className="h-14 w-3/5 rounded-sm" />
        <Skeleton className="h-5 w-4/5 rounded-sm" />
        <Skeleton className="h-10 w-40 rounded-sm" />
      </main>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!authenticated || !address) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-10 py-12">
        {/* kicker + headline */}
        <header className="flex flex-col gap-4">
          <Pill tone="flame">
            <span aria-hidden>●</span> Free Starter Squad
          </Pill>
          <h1 className="display text-5xl text-ink sm:text-6xl">
            Claim your squad
          </h1>
          <p className="max-w-[52ch] text-base text-ink-2">
            Connect your wallet to receive 5 free player cards and baseline chips.
            One pack per wallet, airdropped on X Layer.
          </p>
        </header>

        {/* What you get */}
        <Panel variant="sunken" className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex flex-col gap-1">
            <span className="display text-4xl text-flame">5</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Free cards</span>
          </div>
          <div className="h-px w-full bg-line sm:h-auto sm:w-px" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="display text-4xl text-cobalt">3</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Chips included</span>
          </div>
          <div className="h-px w-full bg-line sm:h-auto sm:w-px" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-ink-2">
              Sign once to prove you own this wallet. No purchase required, no
              gas from your side. Cards land directly in your portfolio.
            </p>
          </div>
        </Panel>

        {/* Preview of what the cards look like */}
        <section aria-label="Preview starter cards" className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            You will receive cards like these
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {PREVIEW_SQUAD.map(({ key, tier }) => {
              const p = PLAYERS.find((pl) => pl.key === key);
              if (!p) return null;
              return (
                <PlayerCard
                  key={key}
                  name={p.name}
                  nation={p.nation}
                  position={p.position}
                  tier={tier}
                  stats={tierStats(p.base, tier as unknown as Tier)}
                  size="sm"
                  dimmed
                />
              );
            })}
          </div>
        </section>

        {/* Connect CTAs */}
        <div className="flex flex-wrap items-center gap-3">
          <WalletButton />
          <Button
            variant="cta"
            size="lg"
            type="button"
            onClick={() => login()}
          >
            Connect wallet to claim
          </Button>
        </div>
      </main>
    );
  }

  // ── Connected: main onboarding flow ──────────────────────────────────────

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 py-12">

      {/* Header */}
      <header className="flex flex-col gap-3">
        <Pill tone="flame">
          <span aria-hidden>●</span> Free Starter Squad
        </Pill>
        <h1 className="display text-5xl text-ink sm:text-6xl">
          Claim your squad
        </h1>
        <p className="max-w-[52ch] text-base text-ink-2">
          Sign once to prove you own this wallet. We airdrop 5 free Common
          cards and baseline chips so you can enter your first matchday.
        </p>
      </header>

      {/* Step tracker */}
      <section
        aria-label="Onboarding steps"
        className="flex flex-col gap-3 border-l-2 border-line pl-5"
      >
        <StepRow
          step={1}
          active
          done={phase === "done" || phase === "polling" || phase === "calling"}
          label="Sign anti-sybil message"
        />
        <StepRow
          step={2}
          active={phase === "calling" || phase === "polling" || phase === "done"}
          done={phase === "done" || phase === "polling"}
          label="Airdrop 5 Common cards"
        />
        <StepRow
          step={3}
          active={phase === "done"}
          done={chipsDone}
          label="Claim baseline chips"
        />
      </section>

      {/* Already onboarded notice */}
      {alreadyOnboarded && phase === "idle" && (
        <Panel variant="sunken" className="flex items-center justify-between gap-4 px-5 py-4">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">Already claimed.</span>{" "}
            Your Starter Squad is in your portfolio.
          </p>
          <Link href="/play" className={buttonClasses("primary", "sm")}>
            Build lineup →
          </Link>
        </Panel>
      )}

      {/* Main CTA */}
      {phase === "idle" && !alreadyOnboarded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button
            variant="cta"
            size="lg"
            type="button"
            onClick={handleClaim}
            aria-label="Claim your free 5-card Starter Squad"
          >
            Claim your free 5-card Starter Squad
          </Button>
          <p className="text-xs text-muted">One per wallet. No gas required.</p>
        </div>
      )}

      {/* In-progress states */}
      {phase === "signing" && (
        <div
          role="status"
          aria-live="polite"
          className="grain flex items-center gap-4 rounded-card border border-[color:var(--panel-2)] bg-panel px-5 py-4"
        >
          <span
            aria-hidden
            className="inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-on-panel border-r-transparent opacity-70"
          />
          <p className="text-sm text-on-panel">
            Waiting for wallet signature…
          </p>
        </div>
      )}

      {phase === "calling" && (
        <div
          role="status"
          aria-live="polite"
          className="grain flex items-center gap-4 rounded-card border border-[color:var(--panel-2)] bg-panel px-5 py-4"
        >
          <span
            aria-hidden
            className="inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-on-panel border-r-transparent opacity-70"
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-on-panel">Sending airdrop transaction…</p>
            {txHash && (
              <span className="font-mono text-xs text-on-panel-muted">
                {txHash.slice(0, 14)}…
              </span>
            )}
          </div>
        </div>
      )}

      {phase === "polling" && (
        <div
          role="status"
          aria-live="polite"
          className="grain flex items-center gap-4 rounded-card border border-[color:var(--panel-2)] bg-panel px-5 py-4"
        >
          <span
            aria-hidden
            className="inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-on-panel border-r-transparent opacity-70"
          />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-on-panel">
              Transaction sent. Waiting for indexer to confirm your cards…
            </p>
            <span className="text-xs text-on-panel-muted">
              This can take up to 30 seconds.
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-danger/40 bg-danger/6 px-5 py-4"
        >
          <p className="text-sm font-semibold text-danger">Something went wrong</p>
          <p className="text-sm text-ink-2">{errorMsg}</p>
          {errorMsg.toLowerCase().includes("not minter") && (
            <p className="text-xs text-muted">
              Execution gate: the server PRIVATE_KEY is not the CardNFT minter.
              This works once the owner key is configured.
            </p>
          )}
          <button
            type="button"
            onClick={() => { setPhase("idle"); setErrorMsg(""); }}
            className={buttonClasses("secondary", "sm")}
          >
            Try again
          </button>
        </div>
      )}

      {/* Minted cards reveal */}
      {(phase === "done" || (alreadyOnboarded && cards.length > 0)) && cards.length > 0 && (
        <section aria-label="Your Starter Squad cards" className="flex flex-col gap-5">
          <Panel variant="ink" className="flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
                Your Starter Squad
              </p>
              <Pill tone="cobalt">5 cards minted</Pill>
            </div>
            <MintedCardGrid cards={cards} />
          </Panel>
        </section>
      )}

      {/* Claim baseline chips */}
      {phase === "done" && !chipsDone && (
        <section aria-label="Claim baseline chips" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="display text-2xl text-ink">Claim your chips</h2>
            <p className="text-sm text-ink-2">
              Chips let you use power-ups during matchdays: Triple Captain,
              Doubler, Free Hit. This is a one-time baseline allocation.
            </p>
          </div>
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
          className="flex flex-col gap-3 rounded-card border border-ok/35 bg-ok/8 px-6 py-5"
        >
          <div className="flex flex-col gap-1">
            <h2 className="display text-2xl text-ink">You are all set</h2>
            <p className="text-sm text-ink-2">
              Your Starter Squad and chips are ready. Build your first lineup
              for the upcoming matchday.
            </p>
          </div>
          <Link
            href="/play"
            className={buttonClasses("cta", "md", "self-start")}
          >
            Build your lineup →
          </Link>
        </section>
      )}

      {/* Wallet footer */}
      <footer className="mt-2 text-xs text-muted">
        Connected:{" "}
        <span className="font-mono">{address}</span>
      </footer>
    </main>
  );
}
