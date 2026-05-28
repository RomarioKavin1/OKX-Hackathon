/**
 * /transparency — Transparency, Audit & Dispute page (FR-T1/T2/T3/T4)
 *
 * Server component for the static + oracle-read sections.
 * DisputeForm is a client island loaded at the bottom of the page.
 */

import type { ReactNode } from "react";
import { publicClient } from "@/lib/clients";
import { ADDRESSES } from "@/lib/contracts/addresses";
import { ScoreOracleAbi } from "@/lib/abis/ScoreOracle";
import { xLayerTestnet } from "@/lib/contracts/chain";
import { DEMO_FIXTURE_ID } from "@/lib/data/fixtures";
import { Panel, Pill, SectionHeading, cx } from "@/components/ui";
import { DisputeForm } from "./DisputeForm";

// ── Env config ────────────────────────────────────────────────────────────────

const KNOWN_SIGNERS = (process.env.NEXT_PUBLIC_SCORE_ORACLE_SIGNERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s)) as `0x${string}`[];

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Sub-components (module-scope, server) ─────────────────────────────────────

const EXPLORER = xLayerTestnet.blockExplorers.default.url;

function ExplorerLink({ address }: { address: string }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "font-mono text-xs break-all text-cobalt-ink underline decoration-cobalt/40",
        "hover:decoration-cobalt transition-colors duration-150",
      )}
    >
      {address}
    </a>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-xs text-ink-2">
      {children}
    </code>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TransparencyPage() {
  const [oracle, signers] = await Promise.all([fetchOracleInfo(), fetchSigners()]);

  const contractEntries = Object.entries(ADDRESSES) as [string, string][];

  return (
    <main className="flex max-w-3xl flex-col gap-14">

      {/* ── Header ── */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="warn">Testnet only</Pill>
          <Pill tone="cobalt">X Layer · Chain 1952</Pill>
        </div>
        <h1 className="display text-4xl text-ink sm:text-5xl">Proof &amp; Audit</h1>
        <p className="max-w-2xl text-sm text-ink-2 leading-relaxed">
          All PANENKA scoring, payouts, and contract logic is verifiable on-chain.
          This page documents the oracle, the scoring formula, all deployed contracts,
          and how to raise a dispute.
        </p>
      </header>

      {/* ── FR-T1: Score Oracle ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T1" title="Score Oracle" />
        <p className="text-sm text-ink-2 leading-relaxed">
          Score roots and DNP roots are submitted by authorised signers and finalised
          once the required threshold of signers agree. The oracle contract is at{" "}
          <ExplorerLink address={ADDRESSES.ScoreOracle} />.
        </p>

        {/* Oracle stats — ink panel (always-dark scoreboard treatment) */}
        {oracle ? (
          <Panel variant="ink" className="p-5">
            <dl className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="min-w-[9rem]">
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
                    Signing threshold
                  </dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <Pill tone="cobalt">
                      {oracle.threshold} of {signers.length || "?"} signers
                    </Pill>
                    <span className="text-xs text-on-panel-muted">
                      required to finalise a root
                    </span>
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-on-panel-muted">
                  Contract owner
                </dt>
                <dd className="mt-1">
                  <a
                    href={`${EXPLORER}/address/${oracle.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs break-all text-on-panel underline decoration-on-panel/40 hover:decoration-on-panel transition-colors duration-150"
                  >
                    {oracle.owner}
                  </a>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-on-panel-muted leading-relaxed border-t border-panel-2 pt-4">
              The ABI exposes <InlineCode>threshold()</InlineCode> (uint256) and{" "}
              <InlineCode>owner()</InlineCode> (address) as view functions.
              Signer membership can be queried via{" "}
              <InlineCode>isSigner(address)</InlineCode>.
              Signers are managed by the owner through{" "}
              <InlineCode>setSigner(address, bool)</InlineCode>.
            </p>
          </Panel>
        ) : (
          <Panel variant="sunken" className="flex items-start gap-3 p-4">
            <Pill tone="warn">RPC unavailable</Pill>
            <p className="text-sm text-ink-2">
              Oracle read unavailable. Contract address:{" "}
              <ExplorerLink address={ADDRESSES.ScoreOracle} />
            </p>
          </Panel>
        )}

        {/* Signer roster */}
        {signers.length > 0 ? (
          <Panel variant="paper" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
              <span className="text-sm font-semibold text-ink">Signer roster</span>
              <Pill tone="neutral">
                {signers.filter((s) => s.active).length} active / {signers.length} known
              </Pill>
            </div>
            <ul className="divide-y divide-line">
              {signers.map((s) => (
                <li
                  key={s.address}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <ExplorerLink address={s.address} />
                  <Pill tone={s.active ? "ok" : "neutral"}>
                    {s.active ? "active" : "inactive"}
                  </Pill>
                </li>
              ))}
            </ul>
            <p className="px-5 py-3 text-xs text-muted border-t border-line">
              Active status read live from{" "}
              <InlineCode>ScoreOracle.isSigner(address)</InlineCode>.
              Set <InlineCode>NEXT_PUBLIC_SCORE_ORACLE_SIGNERS</InlineCode> in env to populate
              this list.
            </p>
          </Panel>
        ) : (
          <Panel variant="sunken" className="p-4">
            <p className="text-xs text-muted">
              Signer roster not configured. Set{" "}
              <InlineCode>NEXT_PUBLIC_SCORE_ORACLE_SIGNERS</InlineCode> in env to display
              the multi-sig composition here.
            </p>
          </Panel>
        )}
      </section>

      {/* ── FR-T2: Data Source ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T2" title="Data Source" />
        <p className="text-sm text-ink-2 leading-relaxed">
          Live match events are sourced from{" "}
          <strong className="font-semibold text-ink">API-Football</strong> (v3, RapidAPI).
          Each matchday is assigned one or more fixture IDs. The demo fixture ID is{" "}
          <InlineCode>
            {DEMO_FIXTURE_ID === 0 ? "0 (offline replay)" : DEMO_FIXTURE_ID}
          </InlineCode>
          {DEMO_FIXTURE_ID === 0
            ? ", which replays a finished historical match until the tournament provides live fixtures on 11 June 2026."
            : "."}{" "}
          Ingested events are stored in the{" "}
          <InlineCode>match_events</InlineCode>{" "}
          table (public read) and are preserved immutably as the canonical input to the
          score runner.
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          Anyone can inspect the raw events for any completed matchday by querying the
          Supabase public API:
        </p>

        <Panel variant="sunken" className="px-4 py-3">
          <pre className="font-mono text-xs text-ink-2 overflow-x-auto">
            {`GET /rest/v1/match_events?matchday=eq.1&select=*`}
          </pre>
        </Panel>

        <Panel variant="paper" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-line">
            <span className="text-sm font-semibold text-ink">Ingest details</span>
          </div>
          <dl className="divide-y divide-line">
            {(
              [
                {
                  term: "Primary source",
                  def: (
                    <a
                      className="text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150"
                      href="https://api-football.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      API-Football v3 (RapidAPI)
                    </a>
                  ),
                },
                {
                  term: "Fallback source",
                  def: <span>SportRadar trial / FotMob (manual)</span>,
                },
                {
                  term: "Ingest cadence",
                  def: (
                    <span>
                      Every 60 seconds during live matches; final snapshot 30 minutes after
                      last whistle
                    </span>
                  ),
                },
                {
                  term: "Re-verify the root",
                  def: (
                    <InlineCode>
                      cd frontend &amp;&amp; npm run verify -- &lt;matchday&gt;
                    </InlineCode>
                  ),
                },
              ] as { term: string; def: ReactNode }[]
            ).map(({ term, def }) => (
              <div key={term} className="grid grid-cols-[10rem_1fr] gap-4 px-5 py-3">
                <dt className="text-xs font-medium text-muted self-start pt-px">{term}</dt>
                <dd className="text-xs text-ink-2">{def}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      {/* ── FR-T2: Scoring Formula ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T2" title="Scoring Formula" />
        <p className="text-sm text-ink-2 leading-relaxed">
          Each player card earns fantasy points from match events in the following deterministic
          formula (spec §4.8). All multipliers are stacked in the order below.
        </p>

        <Panel variant="paper" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-line">
            <span className="text-sm font-semibold text-ink">
              Base event points by position
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-paper-3">
                  <th className="py-2 pl-5 pr-4 text-left font-semibold text-ink-2">
                    Event
                  </th>
                  <th className="py-2 px-3 text-center font-semibold text-ink-2">GK</th>
                  <th className="py-2 px-3 text-center font-semibold text-ink-2">DEF</th>
                  <th className="py-2 px-3 text-center font-semibold text-ink-2">MID</th>
                  <th className="py-2 pl-3 pr-5 text-center font-semibold text-ink-2">FWD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {(
                  [
                    ["Goal", "10", "8", "6", "5"],
                    ["Assist", "3", "3", "3", "3"],
                    ["Clean sheet", "4", "4", "1", "0"],
                    ["Tackle (×0.5, cap 4)", "—", "✓", "✓", "✓"],
                    ["Key pass (×0.3, cap 3)", "—", "✓", "✓", "✓"],
                    ["Save (×0.5, cap 5)", "✓", "—", "—", "—"],
                    ["Penalty saved", "5", "—", "—", "—"],
                    ["MOTM", "3", "3", "3", "3"],
                    ["Played 60+ min", "1", "1", "1", "1"],
                    ["Yellow card", "−1", "−1", "−1", "−1"],
                    ["Red card", "−3", "−3", "−3", "−3"],
                    ["Own goal", "−2", "−2", "−2", "−2"],
                    ["Penalty missed", "−2", "−2", "−2", "−2"],
                    ["Goals conceded / 2", "−1", "−1", "—", "—"],
                  ] as string[][]
                ).map(([event, gk, def, mid, fwd]) => (
                  <tr
                    key={event}
                    className="hover:bg-paper-3 transition-colors duration-100"
                  >
                    <td className="py-2 pl-5 pr-4 font-sans font-normal text-ink-2">
                      {event}
                    </td>
                    <td className="py-2 px-3 text-center text-ink">{gk}</td>
                    <td className="py-2 px-3 text-center text-ink">{def}</td>
                    <td className="py-2 px-3 text-center text-ink">{mid}</td>
                    <td className="py-2 pl-3 pr-5 text-center text-ink">{fwd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel variant="paper" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-line">
            <span className="text-sm font-semibold text-ink">
              Multiplier stacking order (spec §4.9)
            </span>
          </div>
          <ol className="divide-y divide-line">
            {[
              "Base event points (table above)",
              "Tier bonus: Common ×1.0, Rare ×1.05, Super Rare ×1.12, Unique ×1.20",
              "Trait modifier (§4.2) — event-category boost from the card's assigned trait",
              "Out-of-position penalty: ×0.85 if the card plays in a different position to its NFT position",
              "Stamina: >70 stamina → ×1.05 (fresh); <30 stamina → ×0.80 (fatigued)",
              "Captain multiplier: ×2 (captain) or ×3 (Triple Captain chip)",
              "Country synergy: ≥7 same-nation cards ×1.20; ≥5 ×1.12; ≥3 ×1.05",
              "Formation synergy multiplier (§4.3, see below)",
              "Chip effects applied through captain/stamina inputs above",
            ].map((step, i) => (
              <li key={i} className="flex gap-4 px-5 py-3">
                <span className="shrink-0 font-mono text-xs text-muted pt-px w-5 text-right">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs text-ink-2">{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel variant="sunken" className="p-5 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-ink mb-1">
              §4.2 Trait modifier — scalar-collapse modeling note
            </p>
            <p className="text-xs text-ink-2 leading-relaxed">
              Each card carries a single trait (e.g. <em>Poacher</em>, <em>Wall</em>,{" "}
              <em>Creator</em>). The trait is collapsed to a single scalar multiplier
              applied only to the event category it targets (e.g. Poacher ×1.25 on goals,
              Creator ×1.30 on key passes). When a trait targets a composite category (
              <em>attacking</em> = goals + assists + key passes, or <em>all</em> = every
              category), the multiplier is applied uniformly across all affected sub-buckets
              before final summing. This is a deliberate simplification: real match analysis
              would model each event type independently, but scalar collapse keeps the formula
              deterministic, gas-free to verify, and auditable in a single arithmetic pass.
            </p>
          </div>
          <div className="border-t border-line pt-4">
            <p className="text-sm font-semibold text-ink mb-1">
              §4.3 Formation synergy — scalar-collapse modeling note
            </p>
            <p className="text-xs text-ink-2 leading-relaxed">
              Formation synergies (WidePlay, IronWall, TikiTaka, CounterAttack, BrickDefense)
              fire a formation-level multiplier when a predicate over the 11-card lineup is
              satisfied. Rather than applying different bonuses to individual events within a
              position, the synergy is collapsed to a single per-position scalar (e.g. IronWall
              gives DEF/GK ×1.10). This means the synergy effect is position-uniform: a Wall
              defender with 5 tackles and a Wall defender with 0 tackles both receive the same
              percentage uplift. The trade-off is simplicity and verifiability — the Merkle
              root over all card scores can be independently reproduced in one pass without
              preserving intermediate per-event state.
            </p>
          </div>
        </Panel>
      </section>

      {/* ── FR-T2: Independent Verification ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T2" title="Independent Verification" />
        <p className="text-sm text-ink-2 leading-relaxed">
          You can re-run the score computation off-chain and check that the published Merkle
          root matches. Once the verifier script is available (Phase 4 delivery):
        </p>
        <Panel variant="sunken" className="px-4 py-3">
          <pre className="font-mono text-xs text-ink-2 overflow-x-auto">
            {`npm run verify -- <matchday>`}
          </pre>
        </Panel>
        <p className="text-xs text-muted leading-relaxed">
          The command fetches raw events from <InlineCode>match_events</InlineCode>, applies
          the formula above, builds the Merkle tree, and prints the computed root next to the
          on-chain root from <InlineCode>ScoreOracle.roots(matchday)</InlineCode>.
          A mismatch should be reported via the dispute form below.
        </p>
      </section>

      {/* ── FR-T3: Audit Status ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T3" title="Audit Status" />
        <Panel variant="sunken" className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Pill tone="warn">Pre-mainnet</Pill>
            <span className="text-sm font-semibold text-ink">
              Third-party audit pending
            </span>
          </div>
          <p className="text-xs text-ink-2 leading-relaxed">
            PANENKA smart contracts are deployed on{" "}
            <strong className="font-semibold text-ink">X Layer Testnet only</strong>.
            A formal third-party security audit has not yet been conducted. Do not use
            real funds. All contracts will be re-audited before any mainnet launch.
          </p>
        </Panel>
        <p className="text-sm text-ink-2 leading-relaxed">
          Researchers can report findings via the{" "}
          <a
            className="text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150"
            href="https://github.com/RomarioKavin1/OKX-Hackathon/blob/main/docs/compliance/bug-bounty.md"
            target="_blank"
            rel="noreferrer"
          >
            bug bounty program
          </a>
          . Known issues, design ambiguities, and trust assumptions are documented in{" "}
          <a
            className="text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150"
            href="https://github.com/RomarioKavin1/OKX-Hackathon/blob/main/docs/contracts/flow-issues.md"
            target="_blank"
            rel="noreferrer"
          >
            contracts/flow-issues.md
          </a>{" "}
          and{" "}
          <a
            className="text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150"
            href="https://github.com/RomarioKavin1/OKX-Hackathon/blob/main/docs/contracts/contract-surface.md"
            target="_blank"
            rel="noreferrer"
          >
            contracts/contract-surface.md
          </a>
          .
        </p>
      </section>

      {/* ── FR-CT8: Rollover Policy ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-CT8" title="Unclaimed Prize Rollover" />
        <p className="text-sm text-ink-2 leading-relaxed">
          When a contest closes and one or more prize recipients do not claim their payout
          within the claim window, the unclaimed amount is recorded in the{" "}
          <InlineCode>contest_rollover</InlineCode> table. The protocol subsequently rolls
          that amount into the prize pool of the next eligible contest.
        </p>
        <Panel variant="sunken" className="p-4">
          <p className="text-xs font-semibold text-ink mb-1">Escrow-lock limitation</p>
          <p className="text-xs text-ink-2 leading-relaxed">
            The <InlineCode>ContestEscrow</InlineCode> contract locks entry fees at contest
            creation. Rolled-over amounts from a prior contest must be injected as a separate
            deposit transaction by the admin key before the destination contest closes. During
            the testnet phase this injection is performed manually; automation is planned for
            the mainnet launch.
          </p>
        </Panel>
      </section>

      {/* ── FR-CT10: Lineup Flags ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-CT10" title="Same-Lineup Review Flags" />
        <p className="text-sm text-ink-2 leading-relaxed">
          When two or more wallets submit identical lineups (same 11 card token IDs in the
          same formation), an entry is written to the{" "}
          <InlineCode>lineup_flags</InlineCode> table. These flags are reviewed by the
          PANENKA team before payouts are finalised. Flagged lineups do{" "}
          <strong className="font-semibold text-ink">not</strong> automatically disqualify
          entries — they are surfaced for manual review only. The flag hash is derived from
          the sorted token ID array and formation code to ensure order-independence.
        </p>
      </section>

      {/* ── FR-T1: Deployed Contracts ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          kicker="FR-T1"
          title="Deployed Contracts"
          action={<Pill tone="warn">X Layer Testnet</Pill>}
        />
        <p className="text-xs text-muted">
          Chain ID 1952 · Explorer:{" "}
          <a
            href={EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150"
          >
            {EXPLORER}
          </a>
        </p>
        <Panel variant="paper" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-paper-3">
                  <th className="py-2.5 pl-5 pr-6 text-left text-xs font-semibold text-ink-2 whitespace-nowrap">
                    Contract
                  </th>
                  <th className="py-2.5 pl-0 pr-5 text-left text-xs font-semibold text-ink-2">
                    Address (OKLink)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contractEntries.map(([name, address]) => (
                  <tr
                    key={name}
                    className="hover:bg-paper-3 transition-colors duration-100"
                  >
                    <td className="py-3 pl-5 pr-6 text-sm font-semibold text-ink align-top whitespace-nowrap">
                      {name}
                    </td>
                    <td className="py-3 pr-5 align-top">
                      <ExplorerLink address={address} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      {/* ── FR-T4: Dispute Form ── */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="FR-T4" title="File a Dispute" />
        <p className="text-sm text-ink-2 leading-relaxed">
          If you believe a score, payout, or data source is incorrect, you can file a
          dispute below. You will receive a tracking ID to follow up with the team.
          Disputes are reviewed within 72 hours.
        </p>
        <DisputeForm />
      </section>

    </main>
  );
}
