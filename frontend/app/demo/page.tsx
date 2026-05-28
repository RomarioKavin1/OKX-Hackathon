"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address, type Hex, type WalletClient } from "viem";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { PHASES, newState, type DemoState } from "@/lib/demo/phases";

interface LogEntry { note: string; hash?: Hex; error?: boolean }
const EXPLORER = xLayerTestnet.blockExplorers!.default.url;

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

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ManagerCup — Lifecycle Demo</h1>
          <p className="text-sm opacity-70">Every button is a real transaction on X Layer testnet.</p>
        </div>
        <Link href="/" className="text-sm underline opacity-70">← home</Link>
      </header>

      {!ready ? (
        <p className="opacity-60">Loading…</p>
      ) : !authenticated || !address ? (
        <button className="w-fit rounded bg-black px-4 py-2 text-white" onClick={() => login()}>
          Connect with Privy
        </button>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono break-all">{address}</span>
          <button className="rounded border px-2 py-1" onClick={() => logout()}>Log out</button>
        </div>
      )}

      {authenticated && address && (
        <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
          Connect the contract <strong>owner</strong> wallet (it runs admin steps: stats, mint,
          matchday, oracle) and make sure it holds OKB gas. Phases share state — run them in order,
          or hit “Run all”. Matchday {state.current.matchday}.
        </p>
      )}

      <section className="grid gap-2">
        <button
          disabled={!authenticated || running !== null}
          onClick={runAll}
          className="rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          {running ? "Running…" : "Run all phases"}
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          {PHASES.map((p) => (
            <button
              key={p.id}
              disabled={!authenticated || running !== null}
              onClick={() => runPhase(p.id)}
              className="rounded border px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-40"
            >
              {running === p.id ? "⏳ " : ""}{p.label}
            </button>
          ))}
        </div>
        <button onClick={reset} disabled={running !== null} className="w-fit text-xs underline opacity-60">
          reset state + log
        </button>
      </section>

      <section className="rounded-lg border bg-zinc-50 p-3 font-mono text-xs">
        <div className="mb-2 font-sans font-medium">Transaction log ({logs.filter((l) => l.hash).length} txs)</div>
        {logs.length === 0 ? (
          <p className="opacity-50">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {logs.map((l, i) => (
              <li key={i} className={l.error ? "text-red-600" : ""}>
                {l.note}
                {l.hash && (
                  <a className="ml-2 underline" href={`${EXPLORER}/tx/${l.hash}`} target="_blank" rel="noreferrer">
                    {l.hash.slice(0, 10)}…
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
