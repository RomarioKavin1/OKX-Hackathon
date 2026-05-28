# OKX Build X Hackathon — xCup Track

Reference document for the project we're building. Scope is full-quality, not deadline-bounded.

## Overview

The **xCup track** is the World Cup–themed track of OKX's **Build X Hackathon**, run on **X Layer** (OKX's ZK L2 in the Polygon CDK family, gas token OKB). It's one of three Build X seasons, each with a 14,000 USDT pool:

- **Season 1 — Agent track** — X Layer Arena (full-stack agentic apps) + Skills Arena (reusable agent skills)
- **Hook track** — Uniswap V4 Hook mechanism on X Layer, partnered with Uniswap and Flap
- **xCup track** — World Cup themed, the one we're targeting

## Prize structure — 14,000 USDT total

| Place | Winners | Reward |
|---|---|---|
| 1st | 1 | 5,000 USDT + OKX official PR support + cooperation opportunity |
| 2nd | 2 | 3,000 USDT each + OKX official PR support |
| 3rd | 3 | 1,000 USDT each + social media exposure |

Winners across Build X tracks have also reportedly received **priority access to the X Layer Future Accelerator Program** (verify with organizers if relevant).

## Eligible project categories

- Prediction markets
- Trading
- Social
- NFT
- GameFi
- AI Agent

## Theme

World Cup–themed projects, timed around the 2026 FIFA World Cup (hosted by US/Canada/Mexico, kicking off June 11, 2026). OKX is launching its own 2026 World Cup prediction market on X Layer's new Exchange OS, so the ecosystem signal is clear: **prediction markets and World Cup–native primitives are the highest-fit category.**

## Hard requirements

1. **At least part of the project must be deployed on X Layer** (mainnet or testnet)
2. Project must have a **dedicated X (Twitter) account**, tagging **@XLayerOfficial** on submission
3. If based on an existing project, must show **substantial new development** during the hackathon
4. Submission via **Google Form**
5. Remote-only participation

## Judging — dual-track (AI + human)

AI judges auto-review code + on-chain data; human judges score creativity & practicality; final score is a weighted blend.

Evaluation criteria:

- **Innovation** — differentiation within the World Cup context
- **Market Potential** — ability to capture real World Cup traffic and convert it to on-chain X Layer users
- **Completion** — actual output delivered, demonstrability, on-chain verifiability
- **Demo Video (bonus)** — optional 1–3 min walkthrough

---

## X Layer — chain we're deploying on

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `196` (0xC4) | `1952` (0x7A0) |
| RPC | `https://rpc.xlayer.tech` | `https://testrpc.xlayer.tech` |

- ZK L2 in the Polygon CDK family
- Gas token: OKB
- Developer docs: `https://web3.okx.com/xlayer/docs/developer/`

### Exchange OS (X Layer upgrade)

A major X Layer upgrade for builders:

- Permissionless deployment of **custom crypto markets**: spot, perp futures, and **prediction markets**
- "Trade Zone" — spin up trading venues on demand
- Runs on OKX-grade infra: ~300,000 TPS, millisecond matching, unified settlement
- Strongly relevant for the xCup theme since OKX is using it to ship a 2026 World Cup prediction market

---

## Developer toolkit

### OnchainOS Skills — on-chain agent skills

Repo: `https://github.com/okx/onchainos-skills`
Install: `npx skills add okx/onchainos-skills`

14 plug-and-play skills:

- `okx-agentic-wallet` — auth, balances, txs, contract calls
- `okx-dex-swap` — trades via 500+ liquidity sources
- `okx-dex-token` — search, metadata, market cap, liquidity, holders
- `okx-dex-market` — real-time pricing, K-line, PnL
- `okx-dex-signal` — smart money / whale tracking, leaderboards
- `okx-dex-social` — crypto news + sentiment
- `okx-security` — token, dapp, tx risk scans
- `okx-onchain-gateway` — gas estimation, simulation, tx broadcasting
- DApp routing to Polymarket, Aave, Hyperliquid, others

Requires OKX API credentials (`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`) from the OKX Developer Portal.

### Agent Skills — CEX-side skills

Repo: `https://github.com/okx/agent-skills`
CLI: `npm i -g @okx_ai/okx-trade-cli`

- `okx-cex-trade` — spot, perpetual swaps, futures, options, advanced algo orders
- `okx-cex-market` — 70+ technical indicators, funding rates, open interest
- `okx-cex-portfolio` — balances, positions, P&L, transfers
- `okx-cex-bot` — grid bots, DCA Martingale bots
- `okx-cex-earn` — Simple Earn, Flash Earn, staking, dual investment
- `okx-cex-smartmoney` — smart-money analytics, trader leaderboards
- `okx-sentiment-tracker` — news + coin-level sentiment

Compatible with Claude Code, Cursor, Windsurf, Codex CLI, OpenCode.

### Hackathon lifecycle plugin

```
npx skills add okx/plugin-store --skill okx-buildx-hackathon-agent-track
```

Automates registration, deployment, submission, and peer voting.

### Moltbook

`https://moltbook.com` — agent-native social network where agents register, post, vote on peer projects, and settle rewards on-chain. The hackathon channel is the `m/buildx` submolt. Peer voting on ≥5 projects has historically been a prize-eligibility gate for the agent-track seasons.

### Support

- "X Layer Builder Hub" Telegram community
- X Layer Docs: `https://web3.okx.com/xlayer/docs/`

---

## Strategic angles

Given the categories, the Exchange OS launch, and the World Cup timing, the strongest builds cluster around:

1. **World Cup prediction market on Exchange OS / X Layer** — native to the platform's flagship use case
2. **AI agent that trades/bets on match outcomes** via OnchainOS skills — exercises the full agentic stack
3. **Social-fi fan token / team-loyalty game** — engagement-driven, captures traffic
4. **Fantasy World Cup GameFi** with on-chain scoring tied to real match data
5. **NFT "moments" collector** — verifiable, on-chain match highlights
6. **Trading-focused tool** for football-correlated assets / fan tokens / prediction-market arb

The judging rubric (Innovation, Market Potential, Completion, on-chain verifiability) rewards builds that are **actually deployed on X Layer**, **demonstrable**, and **plausibly capture World Cup traffic**.

---

## Key links

- Hackathon home: `https://web3.okx.com/xlayer/build-x-hackathon`
- xCup track: `https://web3.okx.com/xlayer/build-x-hackathon/xcup`
- Hook track: `https://web3.okx.com/xlayer/build-x-hackathon/hook`
- X Layer docs: `https://web3.okx.com/xlayer/docs/developer/`
- OnchainOS skills: `https://github.com/okx/onchainos-skills`
- Agent skills: `https://github.com/okx/agent-skills`
- Hackathon plugin page: `https://web3.okx.com/onchainos/plugins/detail/okx-buildx-hackathon-agent-track`
- Moltbook: `https://moltbook.com`
- @XLayerOfficial on X
