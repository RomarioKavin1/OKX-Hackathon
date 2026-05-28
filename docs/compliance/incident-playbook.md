# Incident Response Playbook (DRAFT)

> **Status:** Internal operations document. Maintain under version control; update post-incident.
> **Product:** ManagerCup
> **Owner:** Operator on-call rotation

## Severity tiers

| Sev | Definition | Response time | Comms |
|---|---|---|---|
| Sev0 | User funds at risk OR oracle posting a wrong root that will pay incorrect winners | < 15 min | Pause contracts; status page; X/Discord update |
| Sev1 | Production unavailable for > 50% of users OR matchday cannot finalize | < 60 min | Status page; X update |
| Sev2 | Degraded UX but workarounds exist (slow indexer, partial outages) | < 4 hours | Status page if > 1 hour |
| Sev3 | Minor (cosmetic, single-user) | next business day | None |

## Common scenarios

### A. Oracle signer disagreement

**Detection:** Two or more signers publish different score roots for the same matchday; vote does not reach threshold within 90 minutes of last whistle.

**Mitigation:**
1. On-call posts in the signer Signal channel: "matchday X — disagreement."
2. Each signer re-runs the `verifier/index.ts` CLI against the canonical data feed and shares the resulting root.
3. If roots converge: signers re-submit; matchday finalizes normally.
4. If they don't: triage the data inputs (one signer may have stale data, wrong fixture id, etc.).
5. If the dispute is unresolvable within 6 hours, the on-call may invoke the dispute window per `docs/compliance/fair-play.md` §4 and notify all paid-contest entrants.

**Comms:** Status page note; in-app banner for the affected matchday.

### B. Data feed outage (API-Football down)

**Detection:** `services/oracle/ingest.ts` failing with API errors for > 10 minutes during a live match.

**Mitigation:**
1. On-call switches the ingester to the fallback feed (documented in Transparency page).
2. If both primary and fallback are down: pause `services/lifecycle/cron.ts` to prevent stale Merkle commitment.
3. Once data is available, re-run ingest with the recovered window.

**Comms:** Status page; affected users notified via in-app banner.

### C. Smart-contract pause request

**Detection:** A critical bug is reported in the bug-bounty channel OR a black-hat exploit is observed on-chain.

**Mitigation:**
1. Operator multi-sig calls the appropriate pause / disable function (see contract surface for which functions exist per contract).
2. Post-pause: confirm pause is effective by attempting a tx; verify revert.
3. Notify all signers; pause oracle posting until root cause is fixed.

**Comms:** Sev0 — immediate status page post + X update + email to known contest entrants.

### D. Indexer lag

**Detection:** Supabase `indexer_cursor` is more than 100 blocks behind chain head.

**Mitigation:**
1. Check indexer worker logs for errors.
2. Restart the worker.
3. If RPC is the bottleneck, switch to backup RPC endpoint (X Layer testnet has multiple).
4. If structural (e.g., schema mismatch), rollback recent deploy.

**Comms:** Status page if lag > 5 minutes during a live matchday.

### E. Privy outage

**Detection:** Users cannot log in for > 5 minutes.

**Mitigation:**
1. Confirm via Privy status page.
2. If Privy-side: post status; wait.
3. Frontend continues to serve read-only views (browse, transparency, leaderboard) for un-authenticated users.

**Comms:** Status page note linked to Privy's status page.

### F. Supabase outage

**Detection:** Read endpoints (claims, career, portfolio, profile, transparency) timing out.

**Mitigation:**
1. Confirm via Supabase status.
2. If Supabase-side: post status.
3. The on-chain settlement layer is independent of Supabase — claims still work via direct on-chain `claimed()` reads.

**Comms:** Status page note.

## On-call rotation

- Primary on-call (24/7): rotates weekly, listed in #ops channel
- Secondary: backup; escalated to if primary unreachable in 15 minutes
- Signer on-call: each signer is responsible for their own key availability during matchdays

## Post-incident review

Within 5 business days of any Sev0/Sev1 incident:

1. Author a public post-mortem in `docs/incidents/YYYY-MM-DD-<slug>.md`
2. Cover: what happened, why, what we did, what we'll change
3. List action items with owners and due dates
4. Cross-link from the public Transparency page

## Communication templates

### Status page — incident open

> "[SEV X] We're investigating reports of [symptom] affecting [scope]. Updates every 15 minutes."

### Status page — root cause found

> "Root cause identified: [brief]. Mitigation in progress. ETA [time]."

### Status page — resolved

> "Resolved at [time]. [Brief summary]. Post-mortem to follow within 5 business days."
