# Bug Bounty Program (DRAFT)

> **Status:** Internal draft. Public version requires legal review.
> **Product:** ManagerCup

## In scope

| Surface | Scope |
|---|---|
| Smart contracts | All 10 deployed contracts on X Layer testnet (chain 1952) and any future mainnet deployment. Addresses listed in the Transparency page. |
| Off-chain services | `frontend/services/oracle/*`, `frontend/services/indexer/*`, `frontend/services/livescore/*`, `frontend/services/lifecycle/*` |
| Frontend | All routes under `frontend/app/(app)/*` |
| API endpoints | All routes under `frontend/app/api/*` |
| Verifier CLI | `frontend/verifier/*` |
| Geofencing middleware | `frontend/middleware.ts`, `frontend/lib/geofence.ts` |

## Out of scope

- Issues already documented in `docs/contracts/flow-issues.md` or `docs/contracts/contract-surface.md`
- Known testnet limitations (1-of-1 oracle signer until Phase A multi-sig migration completes)
- Findings against third-party services (Privy, Supabase, X Layer, API-Football) — report those upstream
- Social engineering, phishing, physical attacks
- Denial of service requiring sustained financial cost on the attacker side
- Findings that require an already-compromised wallet or key

## Severity and payout tiers

| Severity | Examples | Payout (USDC) |
|---|---|---|
| Critical | Funds drain from any escrow, oracle root forgery, smart-contract upgrade hijack | $5,000 – $25,000 |
| High | Per-user funds at risk, lineup commit bypass, contest rake redirect | $1,000 – $5,000 |
| Medium | Unfair gameplay advantage (synergy bonus exploit), info disclosure of off-chain data | $500 – $1,000 |
| Low | UI bypasses without economic impact, minor information leaks | $100 – $500 |

Payouts are made in USDC on X Layer (or any mainstream L2 the researcher prefers, post-launch). Severity is determined by the operator with reference to CVSS 3.1 and the contract trust model documented in `docs/contracts/contract-surface.md`.

## Safe harbor

Researchers acting in good faith — not stealing funds, not disrupting service, reporting promptly, and giving the operator a reasonable time to fix — will not be subject to legal action by the operator.

Researchers must:

- Not extract more data than necessary to demonstrate the issue
- Not disclose to third parties until the operator has fixed and announced
- Not test against user funds (the testnet faucet provides test USDC; use that)
- Follow responsible-disclosure conventions

## Submission

Send to: [security email TBD]

For sensitive reports, encrypt to: [PGP key TBD]

Include:

- Affected component + git SHA / contract address
- Reproduction steps (proof of concept; minimize fund movement)
- Severity assessment + reasoning
- Recommended fix (optional but helpful)
- Wallet address for payout
- Whether you wish to be credited publicly

## Triage SLA

- Acknowledgement: within 48 hours of submission
- Severity assessment: within 7 days
- Fix and payout: within 30 days for Critical/High; 60 days for Medium/Low
- Public disclosure (with researcher's consent): after fix is deployed

## Exclusions and clarifications

- Test transactions are fine on the X Layer testnet; do not test against any future mainnet deployment without prior written authorization
- We don't pay multiple bounties for the same root cause; the highest-severity issue wins
- We may also award discretionary bonuses for unusually impactful or well-written reports
