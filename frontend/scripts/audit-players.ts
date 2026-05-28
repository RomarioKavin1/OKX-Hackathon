/**
 * audit-players.ts — Report current player coverage gaps.
 *
 * Compares lib/data/players against NATIONS and TRAIT_BOOST. Prints a
 * coverage summary and a list of nations under-staffed for a full
 * 26-player World Cup squad.
 *
 * Usage:
 *   cd frontend
 *   tsx scripts/audit-players.ts
 *
 * Exit code is always 0; this script is informational, not a CI gate.
 */

import { PLAYERS } from "../lib/data/players";
import { NATION_NAME, type Nation } from "../lib/data/nations";
import { TRAIT_BOOST } from "../lib/data/traits";

const SQUAD_SIZE = 26;
const ALL_NATIONS = Object.keys(NATION_NAME) as Nation[];

// 1. Per-nation player counts
const countByNation = new Map<string, number>();
for (const p of PLAYERS) {
  countByNation.set(p.nation, (countByNation.get(p.nation) ?? 0) + 1);
}

console.log("Player coverage report");
console.log("─".repeat(50));
console.log(`Total players in catalog: ${PLAYERS.length}`);
console.log(`Nations defined:          ${ALL_NATIONS.length}`);
console.log(`Target per nation:        ${SQUAD_SIZE}`);
console.log();

// 2. Nations under-staffed
console.log("Coverage per nation:");
const validTraitSet = new Set(Object.keys(TRAIT_BOOST));
let understaffedCount = 0;
for (const nation of ALL_NATIONS) {
  const count = countByNation.get(nation) ?? 0;
  const flag = count < SQUAD_SIZE ? "  ← under" : "  ✓";
  if (count < SQUAD_SIZE) understaffedCount++;
  console.log(`  ${nation} (${NATION_NAME[nation]}): ${String(count).padStart(2)}/${SQUAD_SIZE}${flag}`);
}
console.log();

// 3. Cross-check: every player has valid traits
const invalidTrait: Array<{ key: string; name: string; trait: string; slot: string }> = [];
for (const p of PLAYERS) {
  if (!validTraitSet.has(p.primaryTrait)) {
    invalidTrait.push({ key: p.key, name: p.name, trait: p.primaryTrait, slot: "primary" });
  }
  if (!validTraitSet.has(p.secondaryTrait)) {
    invalidTrait.push({ key: p.key, name: p.name, trait: p.secondaryTrait, slot: "secondary" });
  }
}

console.log(`Players with invalid trait values: ${invalidTrait.length}`);
for (const e of invalidTrait.slice(0, 20)) {
  console.log(`  ${e.key}  ${e.name}  (${e.slot} = "${e.trait}")`);
}
if (invalidTrait.length > 20) {
  console.log(`  … and ${invalidTrait.length - 20} more`);
}
console.log();

// 4. Final summary
console.log("─".repeat(50));
console.log(
  `Summary: ${understaffedCount}/${ALL_NATIONS.length} nations under-staffed; ` +
  `${invalidTrait.length} invalid trait entries.`,
);
console.log(
  "This script is informational. Filling missing players is a content task " +
  "tracked in PRD.md §11 Open Decision #2 (player likeness).",
);
