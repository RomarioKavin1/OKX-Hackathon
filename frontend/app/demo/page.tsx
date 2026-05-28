"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address, type Hex, type WalletClient } from "viem";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { PHASES, newState, type DemoState } from "@/lib/demo/phases";
import { Wordmark } from "@/components/Nav";
import { Button, Pill, Panel, SectionHeading, Spinner, cx } from "@/components/ui";

interface LogEntry { note: string; hash?: Hex; error?: boolean }
const EXPLORER = xLayerTestnet.blockExplorers!.default.url;

// Phase status derived from log + running state
type PhaseStatus = "pending" | "active" | "done" | "error";

function derivePhaseStatus(
  phaseId: string,
  running: string | null,
  logs: LogEntry[],
): PhaseStatus {
  if (running === phaseId) return "active";
  const doneNote = logs.find((l) => !l.error && l.note.includes(`· ${PHASES.find((p) => p.id === phaseId)?.label.split(" · ")[1] ?? ""}`));
  if (
    logs.some(
      (l) => !l.error && l.note.startsWith(`✓ ${PHASES.find((p) => p.id === phaseId)?.label}`),
    )
  )
    return "done";
  if (
    logs.some(
      (l) =>
        l.error &&
        logs.findIndex((x) => x.note.startsWith(`▶ ${PHASES.find((p) => p.id === phaseId)?.label}`)) >=
          0,
    )
  ) {
    // check error came after the phase start
    const startIdx = logs.findLastIndex(
      (x) => x.note.startsWith(`▶ ${PHASES.find((p) => p.id === phaseId)?.label}`),
    );
    const errorAfterStart = logs.slice(startIdx).some((l) => l.error);
    if (errorAfterStart) return "error";
  }
  void doneNote;
  return "pending";
}

function StatusPill({ status }: { status: PhaseStatus }) {
  if (status === "active")
    return (
      <Pill tone="cobalt" className="gap-1.5">
        <Spinner className="size-2.5" />
        Running
      </Pill>
    );
  if (status === "done") return <Pill tone="ok">Done</Pill>;
  if (status === "error") return <Pill tone="danger">Error</Pill>;
  return <Pill tone="neutral">Pending</Pill>;
}

export default function DemoPage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address as Address | undefined;

  const state = useRef<DemoState>(newState());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const push = useCallback((note: string, hash?: Hex, error = false) => {
    setLogs((l) => [...l, { note, hash, error }]);
  }, []);

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    const w = wallets[0];
    if (!w) throw new Error("connect a wallet first");
    await w.switchChain(xLayerTestnet.id);
    const provider = await w.getEthereumProvider();
    return createWalletClient({ account: w.address as Address, chain: xLayerTestnet, transport: custom(provider) });
  }, [wallets]);

  const runPhase = useCallback(
    async (id: string) => {
      const phase = PHASES.find((p) => p.id === id);
      if (!phase || !address) return;
      setRunning(id);
      push(`▶ ${phase.label}`);
      try {
        const wallet = await getWalletClient();
        await phase.run(wallet, address, state.current, (note, hash) => push(note, hash));
        push(`✓ ${phase.label} done`);
      } catch (e) {
        push(`✗ ${e instanceof Error ? e.message : String(e)}`, undefined, true);
      } finally {
        setRunning(null);
      }
    },
    [address, getWalletClient, push]
  );

  const runAll = useCallback(async () => {
    for (const p of PHASES) {
      setRunning(p.id);
      push(`▶ ${p.label}`);
      try {
        const wallet = await getWalletClient();
        await p.run(wallet, address!, state.current, (note, hash) => push(note, hash));
        push(`✓ ${p.label} done`);
      } catch (e) {
        push(`✗ ${e instanceof Error ? e.message : String(e)}`, undefined, true);
        break; // stop the chain on first failure
      }
    }
    setRunning(null);
  }, [address, getWalletClient, push]);

  const reset = useCallback(() => {
    state.current = newState();
    setLogs([]);
  }, []);

  const txCount = logs.filter((l) => l.hash).length;
  const isConnected = authenticated && !!address;

  return (
    <div className="min-h-screen bg-paper">
      {/* ── Minimal header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Wordmark />
          <Link
            href="/"
            className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
            aria-label="Back to home"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-5 py-10" id="main-content">
        {/* ── Page title ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <Pill tone="flame">
            <span aria-hidden>●</span> X Layer Testnet
          </Pill>
          <h1 className="display text-5xl text-ink sm:text-6xl">On-Chain Lifecycle</h1>
          <p className="max-w-prose text-base text-ink-2">
            10 phases. Every button fires a real transaction. Connect the contract owner wallet, then
            run phases in order or hit &ldquo;Run all&rdquo; to walk the full game loop end to end.
          </p>
        </div>

        {/* ── Wallet status ───────────────────────────────────────────────── */}
        <Panel variant="ink" className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
                Wallet
              </span>
              {!ready ? (
                <span className="font-mono text-sm text-on-panel-muted">Connecting...</span>
              ) : isConnected ? (
                <span
                  className="font-mono text-sm text-on-panel"
                  title={address}
                >
                  {address}
                </span>
              ) : (
                <span className="text-sm text-on-panel-muted">Not connected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!ready ? (
                <Spinner className="text-on-panel-muted" />
              ) : !authenticated || !address ? (
                <Button
                  variant="cta"
                  size="md"
                  onClick={() => login()}
                  aria-label="Connect wallet with Privy"
                >
                  Connect wallet
                </Button>
              ) : (
                <>
                  <Pill tone="ok">Connected</Pill>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-xs font-medium text-on-panel-muted underline underline-offset-2 transition-colors duration-150 hover:text-on-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* ── Owner wallet notice ─────────────────────────────────────────── */}
        {isConnected && (
          <Panel variant="outline" className="flex gap-3 p-4">
            <span aria-hidden className="mt-0.5 shrink-0 text-base text-warn">!</span>
            <p className="text-sm text-ink-2">
              Connect the contract <strong className="font-semibold text-ink">owner</strong> wallet.
              Admin phases (stats, mint, matchday config, oracle submission) require it. Ensure the
              wallet holds OKB for gas. Phases share mutable state, run them in order.
            </p>
          </Panel>
        )}

        {/* ── Run all + reset ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="cta"
            size="lg"
            disabled={!isConnected || running !== null}
            loading={running !== null}
            onClick={runAll}
            aria-label="Run all 10 lifecycle phases in sequence"
          >
            {running ? "Running phases..." : "Run all 10 phases"}
          </Button>
          <button
            type="button"
            onClick={reset}
            disabled={running !== null}
            className={cx(
              "text-sm font-medium text-muted underline underline-offset-2",
              "transition-colors duration-150 hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-40",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
            )}
          >
            Reset state and log
          </button>
        </div>

        {/* ── Phase stepper ───────────────────────────────────────────────── */}
        <section aria-label="Lifecycle phases">
          <SectionHeading
            kicker="Phases"
            title="Full game loop"
            className="mb-6"
          />

          <ol className="flex flex-col" aria-label="10 lifecycle phases">
            {PHASES.map((phase, idx) => {
              const status = derivePhaseStatus(phase.id, running, logs);
              // Parse number and description from label like "1 · Onboard (faucet, approvals, chips, starter squad)"
              const [phaseNum, ...rest] = phase.label.split(" · ");
              const phaseDesc = rest.join(" · ");
              const isLast = idx === PHASES.length - 1;
              const isActive = status === "active";

              // Collect log entries for this phase
              const phaseStartIdx = logs.findLastIndex((l) =>
                l.note.startsWith(`▶ ${phase.label}`),
              );
              const nextPhaseStartIdx = phaseStartIdx >= 0
                ? logs.findIndex((l, i) => i > phaseStartIdx && l.note.startsWith("▶ "))
                : -1;
              const phaseLogs =
                phaseStartIdx >= 0
                  ? logs.slice(
                      phaseStartIdx + 1,
                      nextPhaseStartIdx >= 0 ? nextPhaseStartIdx : undefined,
                    )
                  : [];

              return (
                <li key={phase.id} className="flex gap-4">
                  {/* Step indicator column */}
                  <div className="flex flex-col items-center gap-0" aria-hidden>
                    <div
                      className={cx(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-colors duration-200",
                        status === "done"
                          ? "border-ok bg-ok/12 text-ok"
                          : status === "active"
                            ? "border-cobalt bg-cobalt/12 text-cobalt-ink"
                            : status === "error"
                              ? "border-danger bg-danger/12 text-danger"
                              : "border-line-2 bg-paper-3 text-muted",
                      )}
                    >
                      {status === "done" ? "✓" : status === "error" ? "✗" : phaseNum}
                    </div>
                    {!isLast && (
                      <div
                        className={cx(
                          "mt-1 w-px grow",
                          status === "done" ? "bg-ok/40" : "bg-line-2",
                        )}
                        style={{ minHeight: "2rem" }}
                      />
                    )}
                  </div>

                  {/* Phase content */}
                  <div className={cx("flex flex-col gap-3 pb-6 min-w-0 flex-1", isLast && "pb-0")}>
                    <div className="flex flex-wrap items-center gap-3 pt-1.5">
                      <h3 className="font-semibold text-ink">{phaseDesc}</h3>
                      <StatusPill status={status} />
                    </div>

                    {/* Phase log entries (only shown when this phase has run) */}
                    {phaseLogs.length > 0 && (
                      <Panel
                        variant="sunken"
                        className="flex flex-col gap-1.5 p-3"
                        aria-label={`Log for phase ${phaseNum}`}
                      >
                        {phaseLogs.map((entry, i) => (
                          <div
                            key={i}
                            className={cx(
                              "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs",
                              entry.error ? "text-danger" : "text-ink-2",
                            )}
                          >
                            <span className="break-words">{entry.note}</span>
                            {entry.hash && (
                              <a
                                href={`${EXPLORER}/tx/${entry.hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-cobalt-ink underline underline-offset-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt"
                                aria-label={`View transaction ${entry.hash} on explorer`}
                              >
                                {entry.hash.slice(0, 10)}...
                              </a>
                            )}
                          </div>
                        ))}
                      </Panel>
                    )}

                    {/* Run button for this individual phase */}
                    <Button
                      variant={status === "done" ? "secondary" : "primary"}
                      size="sm"
                      disabled={!isConnected || running !== null}
                      loading={isActive}
                      onClick={() => runPhase(phase.id)}
                      aria-label={`Run phase ${phaseNum}: ${phaseDesc}`}
                      className="self-start"
                    >
                      {isActive
                        ? "Running..."
                        : status === "done"
                          ? "Re-run"
                          : "Run phase"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Transaction log ─────────────────────────────────────────────── */}
        <section aria-label="Full transaction log">
          <SectionHeading
            kicker="Log"
            title={
              <>
                Transaction log{" "}
                <span className="font-sans text-2xl font-normal text-muted">
                  ({txCount} tx{txCount !== 1 ? "s" : ""})
                </span>
              </>
            }
            className="mb-4"
          />

          <Panel variant="ink" className="p-4">
            {logs.length === 0 ? (
              <p className="font-mono text-sm text-on-panel-muted">No activity yet. Run a phase to see transactions here.</p>
            ) : (
              <ul
                className="flex flex-col gap-1.5"
                aria-label="All transaction log entries"
                aria-live="polite"
                aria-atomic="false"
              >
                {logs.map((entry, i) => (
                  <li
                    key={i}
                    className={cx(
                      "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-xs",
                      entry.error
                        ? "text-danger"
                        : entry.note.startsWith("✓")
                          ? "text-ok"
                          : entry.note.startsWith("▶")
                            ? "text-on-panel font-semibold"
                            : "text-on-panel-muted",
                    )}
                  >
                    <span className="break-words">{entry.note}</span>
                    {entry.hash && (
                      <a
                        href={`${EXPLORER}/tx/${entry.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-cobalt underline underline-offset-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt"
                        aria-label={`View transaction ${entry.hash} on block explorer`}
                      >
                        {entry.hash.slice(0, 10)}...
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </main>
    </div>
  );
}
