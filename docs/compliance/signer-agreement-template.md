# Oracle Signer Agreement (Template)

> **Status:** Template for external oracle signers. Each signer instance is a fully-completed copy of this document, executed before the signer key is added to ScoreOracle.
> **Product:** ManagerCup
> **Effective on:** [DATE]

## 1. Parties

- **Operator:** [Operator legal name, jurisdiction]
- **Signer:** [Signer name / entity, jurisdiction]

## 2. Role and Responsibilities

The Signer agrees to:

1. Hold a private key authorized to sign on the ScoreOracle contract (X Layer chain 1952, address `0x3470694dD5Afd5474F916B89C108bBB85d05A295`).
2. Independently compute matchday scores using the published deterministic formula (`frontend/lib/business/scoring.ts`) against the canonical match data feed (API-Football primary, fallback documented on the Transparency page).
3. Submit the score Merkle root, DNP Merkle root, and per-contest payout roots via `submitRoot`, `submitPayoutRoot`, and `submitSeasonRoot` calls.
4. Submit within **90 minutes** of the last whistle of each matchday's last fixture (SLA).
5. Not collude with other signers to misreport scores.

## 3. Key Management

The Signer commits to:

- Storing the signing key in a hardware wallet or HSM
- Maintaining backup access in a separate physical location
- Notifying the Operator within **24 hours** of any suspected compromise
- Rotating the key on a schedule no longer than **12 months**
- Using a unique key not shared with any other oracle, custodian, or service

## 4. Voting and Conflict

The Signer:

- Votes their own computed root, not a coordinated one
- May not preview other signers' votes before submitting (the contract surface does not expose votes-in-progress, but the Signer agrees not to inspect mempool for other signers' pending transactions either)
- Discloses any material conflicts of interest with the Operator, ManagerCup, or contest entrants (e.g., the Signer running paid entries on a wallet associated with their identity)

## 5. Term

This Agreement begins on the Effective Date and continues until terminated by either party with **30 days' written notice** or immediately for cause (e.g., reasonable belief of key compromise or material breach).

## 6. Removal

The Operator may remove the Signer from the ScoreOracle multi-sig (`setSigner(addr, false)`) at any time without notice in case of:

- Detected key compromise
- Material breach of these terms
- Persistent SLA violations (≥ 3 missed matchdays in any 30-day period without prior notice)
- Inactivity beyond 60 days during an active competition

## 7. Compensation

[Operator and Signer specify compensation arrangement or "no compensation" — strike whichever is inapplicable]

- Compensation amount: [USDC per matchday signed] OR not applicable
- Payment cadence: [monthly / per-event] OR not applicable

## 8. Confidentiality

Neither party will disclose:

- The other's contact details, key fingerprints, or operational schedule beyond what is public on-chain
- Any pre-publication score data or proposed roots before they are finalized on-chain
- Any internal communications about disputes, audits, or pending changes

## 9. Liability

The Signer:

- Is not liable for honest computation errors made in good faith following the published formula
- Is liable for gross negligence in key management or willful misconduct
- Is not personally liable for chain-level failures (gas spikes, reorgs, RPC outages)

The Operator:

- Is not liable for the Signer's tax obligations, regulatory exposure, or personal disputes
- Does not custody the Signer's key

## 10. Dispute Resolution

Disputes about computed scores follow the public process documented in `docs/compliance/fair-play.md` §4. Disputes about this Agreement are resolved by [chosen forum — operator jurisdiction or mutually agreed arbitration].

## 11. Public Disclosure

The Signer's address and active status are listed on the in-product Transparency page (FR-T1). The Signer's legal name and entity are not published unless the Signer consents in writing.

## 12. Counterpart Execution

This Agreement may be executed in counterparts. Digital signatures (PGP-signed email; on-chain attestation; standard DocuSign) are acceptable.

---

**Signed:**

Operator: ____________________  Date: __________

Signer:   ____________________  Date: __________

Signer address (0x…): ____________________________________

Signer key fingerprint (if PGP): _________________________
