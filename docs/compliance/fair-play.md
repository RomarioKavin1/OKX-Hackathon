# Fair-Play Rules (DRAFT — pre-legal-review)

> **Status:** Internal draft.
> **Product:** ManagerCup

## 1. One Entry Per Wallet Per Contest

Each wallet may enter a paid contest **once** (FR-CT9). Attempts to enter the same contest via multiple wallets controlled by the same person ("Sybil farming") violate these rules.

## 2. Anti-Sybil Measures

- Per-wallet entry caps enforced by the `ContestEscrow` contract
- Wallet history checks (gas paid on X Layer, minimum activity threshold) for high-value paid pools
- Captcha / signed message at signup
- Same-lineup detection across multiple wallets flagged for review (FR-CT10)

## 3. Bots and Automation

You may not:
- Use scripted automation to bulk-enter contests
- Use bots to spam-rent cards at scale to manipulate the rental market
- Run market-making bots that materially distort marketplace floor prices

Allowed:
- Manual play through the official UI or SDK
- Solo agentic play via the published agent skills (see OnchainOS integration)

## 4. Oracle and Scoring

- The scoring formula is **public** and **deterministic** (FR-S1, FR-S5)
- Match data is sourced from API-Football with documented fallback (FR-T1)
- Final scores are committed on-chain as multi-sig Merkle roots
- A dispute window of **7 days** is open after each matchday's payout root is finalized (FR-T4)
- Disputes are reviewed by the oracle signer committee; resolutions are documented publicly

## 5. DNP Insurance Abuse

Insurance premiums are 20% of rental cost; payouts on DNP are 100% rental + 50% premium refund (FR-R6). Attempts to repeatedly insure rentals where DNP is already known (e.g., a player publicly announced as out before kickoff) may result in insurance suspension.

## 6. Refunds

- Pre-lock rental cancel: 90% refund to renter (FR-R8)
- Match postponed / cancelled: 100% refund to renter (FR-R7)
- Paid contest entry: no refunds once the matchday locks
- DNP claim approved: 100% rental + half premium refund (FR-R6)

## 7. Enforcement

Violations may result in:
- Contest entry forfeiture (entry fee retained as rake)
- Temporary or permanent service ban (wallet-level)
- For severe cases: reporting to law enforcement in the user's jurisdiction

## 8. Appeal

Wallet bans may be appealed via the in-app dispute form within 30 days.

## 9. Updates

These rules may evolve as the Service grows. Material changes will be announced in-app at least 14 days before they take effect.
