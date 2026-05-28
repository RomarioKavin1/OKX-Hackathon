# Risk Jurisdictions Matrix

> Living document — review quarterly. Operative source of truth for the geofencing middleware in `frontend/middleware.ts` and `frontend/lib/geofence.ts`.

## Legend

- **Allow** — no restrictions, full participation
- **KYC** — identity verification required before paid contest entry
- **Block** — paid contests denied; free track still accessible (unless sanctioned country)

## US States

DFS (Daily Fantasy Sports) classification varies by state. ManagerCup's paid contests are skill-based DFS in legal posture; this matrix reflects a defensive read on state-level restrictions.

| State | Free track | Paid track | Notes |
|---|---|---|---|
| AL | Allow | Allow | — |
| AK | Allow | Allow | — |
| AZ | Allow | Allow | — |
| AR | Allow | Allow | — |
| CA | Allow | Allow | DFS classified as game of skill |
| CO | Allow | Allow | — |
| CT | Allow | Allow | — |
| DE | Allow | Allow | — |
| FL | Allow | Allow | — |
| GA | Allow | Allow | — |
| HI | Allow | Block | DFS prohibited |
| ID | Allow | Block | DFS prohibited |
| IL | Allow | Allow | — |
| IN | Allow | Allow | DFS regulated, license required for operator |
| IA | Allow | Allow | DFS regulated |
| KS | Allow | Allow | — |
| KY | Allow | Allow | — |
| LA | Allow | Block | DFS restricted |
| ME | Allow | Allow | — |
| MD | Allow | Allow | — |
| MA | Allow | Allow | — |
| MI | Allow | Allow | DFS regulated |
| MN | Allow | Allow | — |
| MS | Allow | Allow | — |
| MO | Allow | Allow | — |
| MT | Allow | Block | DFS prohibited |
| NE | Allow | Allow | — |
| NV | Allow | Block | Treats DFS as gambling |
| NH | Allow | Allow | — |
| NJ | Allow | Allow | — |
| NM | Allow | Allow | — |
| NY | Allow | Allow | DFS regulated |
| NC | Allow | Allow | — |
| ND | Allow | Allow | — |
| OH | Allow | Allow | — |
| OK | Allow | Allow | — |
| OR | Allow | Allow | — |
| PA | Allow | Allow | DFS regulated |
| RI | Allow | Allow | — |
| SC | Allow | Allow | — |
| SD | Allow | Allow | — |
| TN | Allow | Allow | DFS regulated |
| TX | Allow | Allow | — |
| UT | Allow | Allow | — |
| VT | Allow | Allow | — |
| VA | Allow | Allow | — |
| WA | Allow | Block | DFS restricted |
| WV | Allow | Allow | — |
| WI | Allow | Allow | — |
| WY | Allow | Allow | — |

## EU & UK

| Country | Free track | Paid track | Notes |
|---|---|---|---|
| UK | Allow | Allow | — |
| Germany | Allow | Allow | — |
| France | Allow | Allow | — |
| Spain | Allow | Allow | — |
| Italy | Allow | Allow | — |
| Netherlands | Allow | Allow | — |
| Sweden | Allow | Allow | — |
| Belgium | Allow | KYC | Strict gambling regulation — verify counsel before launch |
| Norway | Allow | KYC | — |

## Other Markets

| Country | Free track | Paid track | Notes |
|---|---|---|---|
| Brazil | Allow | Allow | — |
| Argentina | Allow | Allow | — |
| India | Allow | Allow | DFS classified as game of skill |
| Singapore | Allow | KYC | — |
| Australia | Allow | Allow | — |
| Canada | Allow | Allow | Province-level review recommended pre-launch |

## Sanctioned / Restricted

Full block, both tracks, no participation:

| Jurisdiction | Reason |
|---|---|
| North Korea (KP) | OFAC sanctions |
| Iran (IR) | OFAC sanctions |
| Cuba (CU) | OFAC sanctions |
| Syria (SY) | OFAC sanctions |
| China mainland (CN) | Crypto + sports betting restrictions |
| Crimea / Donetsk / Luhansk regions | OFAC sanctions |

## Process

A jurisdiction added to or moved from **Block** requires a code change to `frontend/lib/geofence.ts` and a deployment. The middleware (`frontend/middleware.ts`) reads the `x-vercel-ip-country` / `cf-ipcountry` request headers and the `x-vercel-ip-country-region` header to resolve the posture per request.

## Review cadence

This document is reviewed:
- Quarterly by the compliance owner
- Immediately on any change to DFS regulation in a major market
- Before any new paid-tier rollout

## Disclaimer

This is a **non-lawyer technical posture document**, not legal advice. Final classifications require counsel review before any real-money launch in non-Allow jurisdictions. Sanctioned-country list is based on OFAC SDN list and standard sports-data-provider exclusions; it must be re-verified at launch.
