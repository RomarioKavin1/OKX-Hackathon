# Privacy Policy (DRAFT — pre-legal-review)

> **Status:** Internal draft. Not for publication.
> **Product:** ManagerCup
> **Effective date:** TBD

## 1. Information We Collect

### Required
- **Wallet address.** Public, on-chain. Required to participate.

### Optional (only if you provide it)
- **Email address** (Privy account linkage)
- **Display name / handle**

### Automatic
- **IP address** — used solely for geofencing per the Risk Jurisdictions Matrix
- **Browser user-agent** — for fraud detection only
- **On-chain transaction history** related to ManagerCup contracts — public ledger

## 2. How We Use Information

- Wallet address + on-chain history: render your portfolio, score your lineups, route prize claims
- IP: determine geofencing posture (no IP is logged for advertising or third-party sharing)
- Email (if provided): account recovery, important service notices

## 3. Third-Party Processors

| Processor | Purpose | Data shared |
|---|---|---|
| Privy | Wallet authentication | Wallet address, email (if linked) |
| Supabase | Read-layer database | Aggregated game state — wallet address, lineups, scores |
| X Layer (OKX) | Blockchain transactions | All on-chain interaction |
| API-Football | Match data | None — we pull data from them; we don't send user data |

## 4. Free-Track Participation

Free contests require no PII beyond a wallet address. You may participate in the free track without providing an email or any other identifier.

## 5. Geofencing Data

Your IP is checked at request time against the Risk Jurisdictions Matrix. The check result is stored briefly in a request cookie (`mc-geo`); no historical IP log is retained for analytics.

## 6. Children's Privacy

The Service is not directed to anyone under 18. We do not knowingly collect data from minors. If we learn that we have, we will delete it.

## 7. Your Rights

Depending on your jurisdiction:
- **Access** — request a copy of your data (GDPR, CCPA)
- **Deletion** — request deletion of your off-chain data. On-chain data is immutable.
- **Portability** — your on-chain card holdings and lineup history are inherently portable
- **Objection** — opt out of optional email notifications via in-app settings

To exercise these rights: [contact TBD]

## 8. Data Retention

- Aggregated game state in Supabase: retained for the duration of the active product
- Disputes: retained for 7 years per standard record-keeping
- Geofence cookie: 1-hour TTL

## 9. Security

- Wallet signing happens client-side; we never see private keys
- Backend writes use service-role authentication separated from anon reads
- All data in transit is TLS-encrypted
- Supabase tables are RLS-enforced; anon reads are limited to public game state

## 10. International Transfers

Data may be processed in any region where our service providers operate. Supabase regions and Privy regions are listed in our infrastructure documentation.

## 11. Changes

We will notify users in-app of any material change to this Policy at least 14 days before the change takes effect.

## 12. Contact

[Contact TBD]
