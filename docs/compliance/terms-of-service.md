# Terms of Service (DRAFT — pre-legal-review)

> **Status:** Internal draft. Not for publication. Final version requires counsel review.
> **Product:** ManagerCup — World Cup fantasy football game on X Layer
> **Effective date:** TBD (on launch)

## 1. Acceptance

By connecting a wallet to ManagerCup ("the Service"), you ("User") agree to these Terms of Service ("Terms"). If you do not agree, do not use the Service.

## 2. Eligibility

- You must be at least **18 years of age** (or the age of majority in your jurisdiction, whichever is higher).
- You must reside in a jurisdiction where participation is permitted per the **Risk Jurisdictions Matrix** (`docs/compliance/risk-jurisdictions.md`). The Service may geofence access via IP and wallet checks (FR-CT9, anti-Sybil).
- You must not be on any OFAC sanctioned-persons list.
- You must have legal authority to operate the wallet you connect.

## 3. The Service

ManagerCup is a daily-cadence fantasy football game where:
- Players field 11-card lineups against real-world match performance (FR-G1, FR-S1)
- Cards are NFTs on X Layer (ERC-721 + ERC-4907 rentable, FR-C1, FR-C2)
- Free contests have no entry fee (FR-CT1)
- Paid contests require USDC entry fees and pay out USDC prizes via Merkle-proof claims (FR-CT2, FR-CT7)
- A free Starter Squad is airdropped on signup (FR-O3)

## 4. Wallets, Accounts, and Custody

- **No operator custody.** ManagerCup does not hold user funds or private keys. All assets are held in user-controlled wallets.
- Wallet authentication is provided by Privy and supports OKX Wallet, MetaMask, WalletConnect, and Privy embedded wallets.
- You are solely responsible for the security of your wallet, recovery phrases, and any signed transactions.
- The Service may rely on smart-contract logic for prize escrow and payouts; no off-chain claim against the operator is possible.

## 5. Cards and Rentals

- Cards are non-fungible tokens. Ownership grants the right to commit them to your lineup OR rent them out to other players (FR-R1).
- Rentals are atomic, per-matchday delegations via ERC-4907 (FR-R3). Rental fees split 88% owner / 10% platform / 2% original buyer (FR-R3).
- A single card NFT can be in at most ONE lineup per matchday (FR-R4).
- The platform does not guarantee any particular floor price, rental yield, or secondary market liquidity.

## 6. Contests and Prize Pools

- **Free contests** are funded from platform reserves and have no entry fee.
- **Paid contests** require USDC entry fees. The platform takes a **rake** (default 8%, FR-CT2); the remainder is paid to top finishers per a published prize curve.
- **All payouts** are settled on-chain via Merkle proofs (FR-CT7). The platform does not have discretionary control over who is paid.
- **Anti-Sybil**: one entry per wallet per contest (FR-CT9). Same-lineup detection across wallets may flag for review (FR-CT10).
- Unclaimed prizes roll into future free contests after the claim window expires (FR-CT8).

## 7. Oracle and Scoring

- Match data is sourced from API-Football (primary). Scoring is computed off-chain by a deterministic formula (FR-S1).
- Final scores are committed on-chain as Merkle roots, signed by an **N-of-M multi-sig of oracle signers**.
- The scoring formula is public and re-runnable by any third party (FR-S5).
- Match data feed source and oracle signer composition are disclosed on the Transparency page (FR-T1, FR-T3).

## 8. Prohibited Conduct

You will not:
- Operate multiple wallets to enter the same contest
- Use bots or scripted automation to bulk-enter contests
- Provide false location information to bypass geofencing
- Attempt to manipulate oracle data or front-run on-chain settlements
- Interact with the Service from a sanctioned jurisdiction

## 9. Disputes

The Service operates a public dispute reporting flow (FR-T4). Disputes regarding oracle scoring or payouts must be filed via the in-app form within 7 days of matchday finalization.

## 10. Intellectual Property

- Card designs, the ManagerCup brand, and Service code are property of the operator.
- Player likeness rights and team marks may be governed by separate licensing agreements (see Open Decisions §11.3 in PRD).
- Open-source components are licensed under their respective licenses (see repo for details).

## 11. Limitation of Liability

To the maximum extent permitted by law, the Service is provided **as-is** without warranty. The operator is not liable for:
- Losses due to user wallet compromise
- Smart-contract bugs (testnet is unaudited; pre-mainnet audit is required before mainnet launch — see Open Decisions §11.9)
- Oracle data feed outages or upstream errors
- Network gas spikes, chain reorgs, or RPC failures

## 12. Changes to Terms

The operator may modify these Terms with 14 days' notice posted in-app. Continued use after the notice period constitutes acceptance.

## 13. Governing Law

To be specified per launching entity jurisdiction.

## 14. Contact

For disputes: file via the in-app form. For other inquiries: [email TBD]
