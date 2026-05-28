# PRODUCT.md — PANENKA

> Context for design work. Read before touching the frontend.

register: product

## Product purpose

**PANENKA** is a daily fantasy football game for the 2026 FIFA World Cup, built on OKX X Layer. Every player is an NFT card you actually own (ERC-721 + ERC-4907). You collect cards, set an XI for each matchday, play chips, and score against real match data. Prizes settle in USDC on-chain. The signature mechanic: a per-matchday **rental market**, so a small budget can field a superstar for one match without buying the card outright.

The name PANENKA is the chipped penalty: audacious, skillful, a little cheeky. The brand should feel the same.

## Users

- **Football fans first, crypto-curious second.** They know formations, captains, and squad rotation. Many are taking their first on-chain action here. The wallet must feel like a detail, not the point.
- **Collectors.** The card-ownership and rarity loop (Common → Rare → Super Rare → Unique) is core emotional fuel. They care about foil, scarcity, and showing off a portfolio.
- **Daily competitors.** During the tournament they return every matchday to rotate a lineup, rent a star, and check standings.

## Tone

Confident, celebratory, insider. Football-fluent copy (XI, gaffer, matchday, clean sheet, brace), never crypto-jargon-forward. Playful but precise: it's a real-money game with on-chain settlement, so trust and clarity matter as much as personality.

## Strategic principles

- **Ownership is felt, not explained.** Cards look and behave like prized collectibles. Rarity is visible at a glance.
- **The matchday is the heartbeat.** Everything orients around "what do I do for the next matchday" and "how did I score on the last one."
- **Verifiable, not trust-me.** Scoring is deterministic and public; the UI should surface that confidence (on-chain links, the verifier, the oracle roster) without burying the fun.
- **Affordability is the wedge.** Rentals turn a $5 budget into a competitive XI. Make that the hero of the value story.

## Anti-references (what PANENKA must NOT look like)

- The green-pitch + gold-trophy World Cup template. Banned reflex. (The previous "ManagerCup" UI did exactly this.)
- Generic crypto-dashboard: neon-on-black, glassmorphism, hero-metric cards, gradient text.
- A spreadsheet. It's a game; dense surfaces are allowed but the experiential ones (packs, collection, lineup) must feel alive.

## Register note (game = product + moments of brand)

This is an app (product register): predictable navigation, full component states, density where users need it, motion that conveys state. BUT the experiential surfaces (home/hero, pack reveal, card collection, lineup pitch, win moments) earn brand-level expression. The display typeface and foil/holo treatment live there, never in form labels, buttons, or data tables.