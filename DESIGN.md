# DESIGN.md — PANENKA design system

> Source of truth for the visual language. Tokens live in `frontend/app/globals.css` (Tailwind v4 `@theme`). This file explains intent.

## Direction: Panini Collector, elevated

The feeling of spreading a World Cup sticker album across a table on matchday: warm paper, tactile cards, foil on the rare ones, confident editorial type. Playful-premium, never childish. Bright base, ink feature panels, deliberate multi-color. We deliberately reject green-pitch + gold as the brand spine; green is demoted to a supporting "pitch/positive" role only.

## Theme

**Primary is light** — warm album-paper. Scene: a fan opening packs and setting a lineup on a bright matchday afternoon. That forces light, not dark. A dark variant exists (night-match) via `prefers-color-scheme`, but the design is authored light-first. Always-dark "ink" feature panels (scoreboards, the live ticker, hero stat blocks) provide contrast inside the light page.

## Color (OKLCH, all neutrals tinted, never #000/#fff)

Strategy: **Full palette** — collector multi-color, each role deliberate.

| Token | Role |
|---|---|
| `paper` / `paper-2` / `paper-3` | page / raised card / sunken track (warm cream, hue ~85) |
| `ink` / `ink-2` / `muted` | text on paper: strong / secondary / tertiary (cool, hue ~265) |
| `panel` / `panel-2` + `on-panel` | always-dark feature panels and their text |
| `line` / `line-2` | hairline / stronger divider |
| `cobalt` | **primary interactive** — links, primary buttons, current selection |
| `flame` | energy: LIVE, primary CTAs, urgency, the wordmark accent dot |
| `gold` | foil / Unique tier / trophy / win moments |
| `violet` | Super Rare tier |
| `grass` | pitch + positive only (supporting, NOT brand) |
| `ok` / `warn` / `danger` / `info` | semantic; always paired with icon or text, never hue alone |

**Rarity → color (the collector spine):** Common = ink/slate · Rare = cobalt · Super Rare = violet · Unique = gold + holographic foil. Rarity must read instantly from across the room.

## Typography

- **Display — `font-display` (Anton):** hero headlines, big stat numbers, card player names, scoreboards. Condensed poster face = sticker-album / sports-poster energy. ALL-CAPS by nature; never use for body, buttons, labels, or data.
- **Sans — `font-sans` (Hanken Grotesk, variable):** body, UI, buttons, labels, most numbers. Warm grotesque, not Inter.
- **Mono — `font-mono` (Geist Mono):** addresses, tx hashes, technical/verifiable data.
- Scale ratio ~1.25 for headings; fixed rem, not fluid. Body capped 65–75ch.

## Shape, elevation, texture

- Radii: cards 14px (`rounded-card`), controls 8px (`rounded-sm`), pills full. Sticker corners, slightly generous.
- Elevation: `shadow-sticker` (resting card on paper) and `shadow-lift` (hover/active). Soft, tinted, never harsh black.
- **Foil** (`.foil`): conic holographic gradient for Unique cards + trophy moments. Tasteful, on rare surfaces only.
- **Grain** (`.grain`): subtle print noise overlay on dark panels for the album-print feel. Low opacity, decorative, optional.

## Motion

- Ease-out-expo (`--ease-out-expo`), 150–250ms for state; longer only for deliberate moments (pack reveal, card flip, win).
- Motion conveys state (placement, reveal, score tick), never decorates. No bounce/elastic. Never animate layout properties.

## Component vocabulary

One button family, one form-control family, consistent across every screen. Every interactive element ships default / hover / focus / active / disabled / loading. Skeletons for loading (not center spinners). Empty states teach the next action. Primitives live in `frontend/components/ui.tsx`.

## Hard bans (inherited + project)

No green-pitch+gold reflex · no gradient text · no glassmorphism-by-default · no hero-metric template · no identical card grids · no side-stripe borders · no em dashes in copy · display font never in labels/buttons/data.