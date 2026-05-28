/**
 * /transparency — Transparency, Audit & Dispute page (FR-T1/T2/T3/T4)
 *
 * Server component for the static + oracle-read sections.
 * DisputeForm is a client island loaded at the bottom of the page.
 */

import { publicClient } from "@/lib/clients";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { ScoreOracleAbi } from "@/lib/abis/ScoreOracle";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { DEMO_FIXTURE_ID } from "@/lib/data/fixtures";
import { DisputeForm } from "./DisputeForm";

// ── Env config ───────────────────────────────────────────────────────────────

const KNOWN_SIGNERS = (process.env.NEXT_PUBLIC_SCORE_ORACLE_SIGNERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s)) as `0x${string}`[];

// ── Types ────────────────────────────────────────────────────────────────────

interface OracleInfo {
  threshold: number;
  owner: string;
}

interface SignerEntry {
  address: `0x${string}`;
  active: boolean;
}

// ── Oracle server-fetch ───────────────────────────────────────────────────────

async function fetchOracleInfo(): Promise<OracleInfo | null> {
  try {
    const [threshold, owner] = await Promise.all([
      publicClient.readContract({
        address: ADDRESSES.ScoreOracle,
        abi: ScoreOracleAbi,
        functionName: "threshold",
        args: [],
      }),
      publicClient.readContract({
        address: ADDRESSES.ScoreOracle,
        abi: ScoreOracleAbi,
        functionName: "owner",
        args: [],
      }),
    ]);
    return { threshold: Number(threshold), owner: owner as string };
  } catch {
    return null;
  }
}

async function fetchSigners(): Promise<SignerEntry[]> {
  if (KNOWN_SIGNERS.length === 0) return [];
  return await Promise.all(
    KNOWN_SIGNERS.map(async (addr) => {
      const active = (await publicClient.readContract({
        address: ADDRESSES.ScoreOracle,
        abi: ScoreOracleAbi,
        functionName: "isSigner",
        args: [addr],
      })) as boolean;
      return { address: addr, active };
    }),
  );
}

// ── Sub-components (module-scope, server) ───────────────────────────────────

const EXPLORER = xLayerTestnet.blockExplorers.default.url;

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs break-all text-[var(--pitch-green)] underline hover:opacity-80"
    >
      {address}
    </a>
  );
}

interface ContractRowProps {
  name: string;
  address: string;
}

function ContractRow({ name, address }: ContractRowProps) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-2 pr-4 text-sm font-semibold align-top whitespace-nowrap">{name}</td>
      <td className="py-2">
        <AddressLink address={address} />
      </td>
    </tr>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold border-b border-border/60 pb-1">{title}</h2>
      {children}
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function TransparencyPage() {
  const [oracle, signers] = await Promise.all([fetchOracleInfo(), fetchSigners()]);

  const contractEntries = Object.entries(ADDRESSES) as [string, string][];

  return (
    <main className="flex max-w-3xl flex-col gap-10">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold">Transparency &amp; Audit</h1>
        <p className="mt-1 text-sm opacity-70">
          All ManagerCup scoring, payouts, and contract logic is verifiable on-chain. This page
          documents the oracle, the scoring formula, all deployed contracts, and how to raise a
          dispute.
        </p>
      </header>

      {/* FR-T1: Oracle */}
      <Section title="Score Oracle (FR-T1)">
        <p className="text-sm opacity-80">
          Score roots and DNP roots are submitted by authorised signers and finalised
          once the required threshold of signers agree. The oracle contract is at{" "}
          <AddressLink address={ADDRESSES.ScoreOracle} />.
        </p>

        {oracle ? (
          <div className="rounded-lg border p-4 flex flex-col gap-2">
            <div className="flex gap-3 items-baseline">
              <span className="text-sm font-semibold w-40">Signing threshold</span>
              <span className="font-mono text-sm">
                {oracle.threshold} signer{oracle.threshold !== 1 ? "s" : ""} required to finalise a
                root
              </span>
            </div>
            <div className="flex gap-3 items-baseline">
              <span className="text-sm font-semibold w-40">Contract owner</span>
              <AddressLink address={oracle.owner} />
            </div>
            <p className="text-xs opacity-60 mt-1">
              Note: The ABI exposes{" "}
              <code className="font-mono">threshold()</code> (uint256) and{" "}
              <code className="font-mono">owner()</code> (address) as view functions.
              Signer membership can be queried via{" "}
              <code className="font-mono">isSigner(address)</code>. Signers are managed by
              the owner through <code className="font-mono">setSigner(address, bool)</code>.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-yellow-600/50 bg-yellow-600/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
            Oracle read unavailable (RPC unreachable). Contract address:{" "}
            <AddressLink address={ADDRESSES.ScoreOracle} />
          </div>
        )}

        {signers.length > 0 ? (
          <div className="rounded-lg border p-4 flex flex-col gap-2 mt-3">
            <span className="text-sm font-semibold">Signers ({signers.filter((s) => s.active).length} active / {signers.length} known)</span>
            <ul className="flex flex-col gap-1">
              {signers.map((s) => (
                <li key={s.address} className="flex items-center justify-between text-xs">
                  <AddressLink address={s.address} />
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${
                      s.active
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {s.active ? "active" : "inactive"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-60 mt-1">
              Active status is read from <code className="font-mono">ScoreOracle.isSigner(address)</code> live.
              Set <code className="font-mono">NEXT_PUBLIC_SCORE_ORACLE_SIGNERS</code> in env to populate this list.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-xs opacity-70 mt-3">
            Signer roster not configured. Set{" "}
            <code className="font-mono">NEXT_PUBLIC_SCORE_ORACLE_SIGNERS</code> in env to display
            the multi-sig composition here.
          </div>
        )}
      </Section>

      {/* FR-T2: Data source + demo fixture */}
      <Section title="Data Source (FR-T2)">
        <p className="text-sm opacity-80">
          Live match events are sourced from{" "}
          <strong>API-Football</strong> (v3, RapidAPI). Each matchday is
          assigned one or more fixture IDs. The current demo fixture ID is{" "}
          <code className="font-mono text-sm">
            {DEMO_FIXTURE_ID === 0 ? "TBD (Phase 4)" : DEMO_FIXTURE_ID}
          </code>
          . Ingested events are stored in the <code className="font-mono text-sm">match_events</code>{" "}
          table (public read) and are preserved immutably as the canonical input to the
          score runner.
        </p>
        <p className="text-sm opacity-80">
          Anyone can inspect the raw events for any completed matchday by querying the
          Supabase public API:
        </p>
        <pre className="rounded bg-muted/30 border p-3 text-xs overflow-x-auto">
          {`GET /rest/v1/match_events?matchday=eq.1&select=*`}
        </pre>
      </Section>

      {/* FR-T2: Scoring formula */}
      <Section title="Scoring Formula (FR-T2)">
        <p className="text-sm opacity-80">
          Each player card earns fantasy points from match events in the following deterministic
          formula (spec §4.8). All multipliers are stacked in the order below:
        </p>

        <div className="rounded-lg border p-4 text-sm">
          <p className="font-semibold mb-2">Base event points by position</p>
          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="pb-1 pr-4">Event</th>
                <th className="pb-1 pr-4">GK</th>
                <th className="pb-1 pr-4">DEF</th>
                <th className="pb-1 pr-4">MID</th>
                <th className="pb-1">FWD</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Goal</td><td className="pr-4">10</td><td className="pr-4">8</td><td className="pr-4">6</td><td>5</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Assist</td><td className="pr-4">3</td><td className="pr-4">3</td><td className="pr-4">3</td><td>3</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Clean sheet</td><td className="pr-4">4</td><td className="pr-4">4</td><td className="pr-4">1</td><td>0</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Tackle (×0.5, cap 4)</td><td className="pr-4">—</td><td className="pr-4">✓</td><td className="pr-4">✓</td><td>✓</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Key pass (×0.3, cap 3)</td><td className="pr-4">—</td><td className="pr-4">✓</td><td className="pr-4">✓</td><td>✓</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Save (×0.5, cap 5)</td><td className="pr-4">✓</td><td className="pr-4">—</td><td className="pr-4">—</td><td>—</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Penalty saved</td><td className="pr-4">5</td><td className="pr-4">—</td><td className="pr-4">—</td><td>—</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">MOTM</td><td className="pr-4">3</td><td className="pr-4">3</td><td className="pr-4">3</td><td>3</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Played 60+ min</td><td className="pr-4">1</td><td className="pr-4">1</td><td className="pr-4">1</td><td>1</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Yellow card</td><td className="pr-4">−1</td><td className="pr-4">−1</td><td className="pr-4">−1</td><td>−1</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Red card</td><td className="pr-4">−3</td><td className="pr-4">−3</td><td className="pr-4">−3</td><td>−3</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Own goal</td><td className="pr-4">−2</td><td className="pr-4">−2</td><td className="pr-4">−2</td><td>−2</td></tr>
              <tr className="border-b border-border/20"><td className="py-1 pr-4">Penalty missed</td><td className="pr-4">−2</td><td className="pr-4">−2</td><td className="pr-4">−2</td><td>−2</td></tr>
              <tr><td className="py-1 pr-4">Goals conceded / 2</td><td className="pr-4">−1</td><td className="pr-4">−1</td><td className="pr-4">—</td><td>—</td></tr>
            </tbody>
          </table>

          <p className="font-semibold mb-1">Multiplier stacking order (spec §4.9)</p>
          <ol className="list-decimal list-inside text-xs space-y-1 opacity-90">
            <li>Base event points (table above)</li>
            <li>Tier bonus: Common ×1.0, Rare ×1.05, Super Rare ×1.12, Unique ×1.20</li>
            <li>Trait modifier (§4.2) — event-category boost from the card&apos;s assigned trait</li>
            <li>Out-of-position penalty: ×0.85 if the card plays in a different position to its NFT position</li>
            <li>Stamina: &gt;70 stamina → ×1.05 (fresh); &lt;30 stamina → ×0.80 (fatigued)</li>
            <li>Captain multiplier: ×2 (captain) or ×3 (Triple Captain chip)</li>
            <li>Country synergy: ≥7 same-nation cards ×1.20; ≥5 ×1.12; ≥3 ×1.05</li>
            <li>Formation synergy multiplier (§4.3, see below)</li>
            <li>Chip effects applied through captain/stamina inputs above</li>
          </ol>
        </div>

        <div className="rounded-lg border p-4 text-sm">
          <p className="font-semibold mb-2">§4.2 Trait modifier — scalar-collapse modeling note</p>
          <p className="text-xs opacity-80">
            Each card carries a single trait (e.g. <em>Poacher</em>, <em>Wall</em>, <em>Creator</em>).
            The trait is collapsed to a single scalar multiplier applied only to the event category
            it targets (e.g. Poacher ×1.25 on goals, Creator ×1.30 on key passes). When a trait
            targets a composite category (<em>attacking</em> = goals + assists + key passes, or
            <em>all</em> = every category), the multiplier is applied uniformly across all
            affected sub-buckets before final summing. This is a deliberate simplification:
            real match analysis would model each event type independently, but scalar collapse
            keeps the formula deterministic, gas-free to verify, and auditable in a single
            arithmetic pass.
          </p>
          <p className="font-semibold mb-1 mt-3">§4.3 Formation synergy — scalar-collapse modeling note</p>
          <p className="text-xs opacity-80">
            Formation synergies (WidePlay, IronWall, TikiTaka, CounterAttack, BrickDefense) fire
            a formation-level multiplier when a predicate over the 11-card lineup is satisfied.
            Rather than applying different bonuses to individual events within a position, the
            synergy is collapsed to a single per-position scalar (e.g. IronWall gives DEF/GK ×1.10).
            This means the synergy effect is position-uniform: a Wall defender with 5 tackles and a
            Wall defender with 0 tackles both receive the same percentage uplift. The trade-off is
            simplicity and verifiability — the Merkle root over all card scores can be
            independently reproduced in one pass without preserving intermediate per-event state.
          </p>
        </div>
      </Section>

      {/* FR-T2: Verifier command */}
      <Section title="Independent Score Verification (FR-T2)">
        <p className="text-sm opacity-80">
          You can re-run the score computation off-chain and check that the published Merkle root
          matches. Once the verifier script is available (Phase 4 delivery):
        </p>
        <pre className="rounded bg-muted/30 border p-3 text-xs overflow-x-auto">
          {`npm run verify -- <matchday>`}
        </pre>
        <p className="text-xs opacity-60">
          The command fetches raw events from <code className="font-mono">match_events</code>, applies
          the formula above, builds the Merkle tree, and prints the computed root next to the
          on-chain root from <code className="font-mono">ScoreOracle.roots(matchday)</code>.
          A mismatch should be reported via the dispute form below.
        </p>
      </Section>

      {/* FR-T3: Audit status */}
      <Section title="Audit Status (FR-T3)">
        <div className="rounded-lg border border-yellow-600/50 bg-yellow-600/10 p-4 text-sm text-yellow-800 dark:text-yellow-200">
          <p className="font-semibold mb-1">Pre-mainnet — third-party audit pending</p>
          <p className="opacity-90">
            ManagerCup smart contracts are deployed on <strong>X Layer Testnet only</strong>.
            A formal third-party security audit has not yet been conducted. Do not use
            real funds. All contracts will be re-audited before any mainnet launch.
          </p>
        </div>
      </Section>

      {/* FR-CT8: Rollover policy + escrow lock */}
      <Section title="Unclaimed Prize Rollover Policy (FR-CT8)">
        <p className="text-sm opacity-80">
          When a contest closes and one or more prize recipients do not claim their payout within
          the claim window, the unclaimed amount is recorded in the{" "}
          <code className="font-mono text-xs">contest_rollover</code> table. The protocol
          subsequently rolls that amount into the prize pool of the next eligible contest.
        </p>
        <p className="text-sm opacity-80">
          <strong>Escrow-lock limitation:</strong> the{" "}
          <code className="font-mono text-xs">ContestEscrow</code> contract locks entry fees
          at contest creation. Rolled-over amounts from a prior contest must be injected as
          a separate deposit transaction by the admin key before the destination contest
          closes. During the testnet phase this injection is performed manually; automation
          is planned for the mainnet launch.
        </p>
      </Section>

      {/* FR-CT10: Lineup flags */}
      <Section title="Same-Lineup Review Flags (FR-CT10)">
        <p className="text-sm opacity-80">
          When two or more wallets submit identical lineups (same 11 card token IDs in the
          same formation), an entry is written to the{" "}
          <code className="font-mono text-xs">lineup_flags</code> table. These flags are
          reviewed by the ManagerCup team before payouts are finalised. Flagged lineups do{" "}
          <strong>not</strong> automatically disqualify entries — they are surfaced for
          manual review only. The flag hash is derived from the sorted token ID array and
          formation code to ensure order-independence.
        </p>
      </Section>

      {/* FR-T1: Contract addresses */}
      <Section title="Deployed Contracts — X Layer Testnet (FR-T1)">
        <p className="text-xs opacity-60">
          Chain ID 1952 · Explorer:{" "}
          <a
            href={EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {EXPLORER}
          </a>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 text-sm">Contract</th>
                <th className="pb-2 text-sm">Address (OKLink)</th>
              </tr>
            </thead>
            <tbody>
              {contractEntries.map(([name, address]) => (
                <ContractRow key={name} name={name} address={address} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* FR-T4: Dispute form — client island */}
      <Section title="File a Dispute (FR-T4)">
        <p className="text-sm opacity-80">
          If you believe a score, payout, or data source is incorrect, you can file a
          dispute below. You will receive a tracking ID to follow up with the team.
          Disputes are reviewed within 72 hours.
        </p>
        <DisputeForm />
      </Section>
    </main>
  );
}
