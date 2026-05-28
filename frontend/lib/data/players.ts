/**
 * players.ts — Real player catalog for the PANENKA demo.
 *
 * Four nations:
 *   FRA — full starting XI + 4 bench (demo match home)
 *   ARG — full starting XI + 4 bench (demo match away)
 *   ENG — ~11 rental pool
 *   BRA — ~11 rental pool
 *
 * playerId = keccak256(toHex(key))  — the on-chain bytes32 player id.
 * base Stats are Common-tier values; use tierStats() to scale.
 * Traits MUST be valid for the player's position per TRAITS_BY_POSITION.
 */

import { keccak256, toHex } from "viem";
import { Tier, type Position, type Stats } from "@/lib/types";
import { TIER_BONUS } from "@/lib/constants";
import type { Trait } from "./traits";
import type { Nation } from "./nations";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface PlayerDef {
  key: string;              // e.g. "FRA-10-Mbappe"
  playerId: `0x${string}`;  // keccak256(toHex(key)) — the on-chain player id
  name: string;
  nation: Nation;
  position: Position;
  primaryTrait: Trait;
  secondaryTrait: Trait;
  base: Stats;              // Common-tier base stats; higher tiers scale by TIER_BONUS
  apiFootballId?: number;   // left undefined for now; wired in Phase 4
}

// ---------------------------------------------------------------------------
// Helper: deterministic on-chain playerId
// ---------------------------------------------------------------------------

export const playerId = (key: string): `0x${string}` =>
  keccak256(toHex(key));

// ---------------------------------------------------------------------------
// Helper: scale stats by tier
// Common = base; Rare/SuperRare/Unique scale each stat by TIER_BONUS[tier].
// Monotonic non-decreasing with tier (TIER_BONUS is >= 1 for all tiers).
// ---------------------------------------------------------------------------

export function tierStats(base: Stats, tier: Tier): Stats {
  const mult = TIER_BONUS[tier];
  return {
    pace:     Math.round(base.pace     * mult),
    shooting: Math.round(base.shooting * mult),
    passing:  Math.round(base.passing  * mult),
    defense:  Math.round(base.defense  * mult),
    physical: Math.round(base.physical * mult),
  };
}

// ---------------------------------------------------------------------------
// Player catalog
// ---------------------------------------------------------------------------

export const PLAYERS: PlayerDef[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // FRANCE — starting XI (4-3-3) + 4 bench
  // ─────────────────────────────────────────────────────────────────────────

  // GK
  {
    key: "FRA-1-Maignan",
    playerId: playerId("FRA-1-Maignan"),
    name: "Mike Maignan",
    nation: "FRA",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "SweeperKeeper",
    base: { pace: 60, shooting: 20, passing: 55, defense: 72, physical: 68 },
  },

  // DEF
  {
    key: "FRA-2-Pavard",
    playerId: playerId("FRA-2-Pavard"),
    name: "Benjamin Pavard",
    nation: "FRA",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "Aggressor",
    base: { pace: 68, shooting: 40, passing: 62, defense: 74, physical: 72 },
  },
  {
    key: "FRA-5-Kounde",
    playerId: playerId("FRA-5-Kounde"),
    name: "Jules Koundé",
    nation: "FRA",
    position: "DEF",
    primaryTrait: "BallPlaying",
    secondaryTrait: "Wall",
    base: { pace: 76, shooting: 38, passing: 68, defense: 76, physical: 70 },
  },
  {
    key: "FRA-4-Upamecano",
    playerId: playerId("FRA-4-Upamecano"),
    name: "Dayot Upamecano",
    nation: "FRA",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "Aggressor",
    base: { pace: 72, shooting: 30, passing: 58, defense: 78, physical: 80 },
  },
  {
    key: "FRA-22-Theo",
    playerId: playerId("FRA-22-Theo"),
    name: "Theo Hernández",
    nation: "FRA",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "BallPlaying",
    base: { pace: 82, shooting: 55, passing: 65, defense: 66, physical: 74 },
  },

  // MID
  {
    key: "FRA-8-Tchouameni",
    playerId: playerId("FRA-8-Tchouameni"),
    name: "Aurélien Tchouaméni",
    nation: "FRA",
    position: "MID",
    primaryTrait: "Anchor",
    secondaryTrait: "BallWinner",
    base: { pace: 65, shooting: 58, passing: 70, defense: 74, physical: 78 },
  },
  {
    key: "FRA-14-Rabiot",
    playerId: playerId("FRA-14-Rabiot"),
    name: "Adrien Rabiot",
    nation: "FRA",
    position: "MID",
    primaryTrait: "BoxToBox",
    secondaryTrait: "Playmaker",
    base: { pace: 68, shooting: 60, passing: 72, defense: 65, physical: 76 },
  },
  {
    key: "FRA-7-Griezmann",
    playerId: playerId("FRA-7-Griezmann"),
    name: "Antoine Griezmann",
    nation: "FRA",
    position: "MID",
    primaryTrait: "Creator",
    secondaryTrait: "BoxToBox",
    base: { pace: 74, shooting: 74, passing: 80, defense: 56, physical: 68 },
  },

  // FWD
  {
    key: "FRA-11-Dembele",
    playerId: playerId("FRA-11-Dembele"),
    name: "Ousmane Dembélé",
    nation: "FRA",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "InsideForward",
    base: { pace: 90, shooting: 72, passing: 70, defense: 36, physical: 65 },
  },
  {
    key: "FRA-9-Giroud",
    playerId: playerId("FRA-9-Giroud"),
    name: "Olivier Giroud",
    nation: "FRA",
    position: "FWD",
    primaryTrait: "TargetMan",
    secondaryTrait: "Poacher",
    base: { pace: 60, shooting: 76, passing: 62, defense: 42, physical: 80 },
  },
  {
    key: "FRA-10-Mbappe",
    playerId: playerId("FRA-10-Mbappe"),
    name: "Kylian Mbappé",
    nation: "FRA",
    position: "FWD",
    primaryTrait: "Poacher",
    secondaryTrait: "False9",
    base: { pace: 96, shooting: 88, passing: 78, defense: 38, physical: 74 },
  },

  // BENCH (+4)
  {
    key: "FRA-16-Lloris",
    playerId: playerId("FRA-16-Lloris"),
    name: "Hugo Lloris",
    nation: "FRA",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "PenaltySpecialist",
    base: { pace: 55, shooting: 18, passing: 50, defense: 68, physical: 64 },
  },
  {
    key: "FRA-13-Kante",
    playerId: playerId("FRA-13-Kante"),
    name: "N'Golo Kanté",
    nation: "FRA",
    position: "MID",
    primaryTrait: "BallWinner",
    secondaryTrait: "BoxToBox",
    base: { pace: 72, shooting: 52, passing: 68, defense: 76, physical: 72 },
  },
  {
    key: "FRA-6-Varane",
    playerId: playerId("FRA-6-Varane"),
    name: "Raphaël Varane",
    nation: "FRA",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "BallPlaying",
    base: { pace: 74, shooting: 32, passing: 60, defense: 80, physical: 76 },
  },
  {
    key: "FRA-19-Benzema",
    playerId: playerId("FRA-19-Benzema"),
    name: "Karim Benzema",
    nation: "FRA",
    position: "FWD",
    primaryTrait: "False9",
    secondaryTrait: "TargetMan",
    base: { pace: 76, shooting: 86, passing: 80, defense: 42, physical: 76 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ARGENTINA — starting XI (4-3-3) + 4 bench
  // ─────────────────────────────────────────────────────────────────────────

  // GK
  {
    key: "ARG-1-Martinez",
    playerId: playerId("ARG-1-Martinez"),
    name: "Emiliano Martínez",
    nation: "ARG",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "PenaltySpecialist",
    base: { pace: 56, shooting: 18, passing: 52, defense: 76, physical: 70 },
  },

  // DEF
  {
    key: "ARG-2-Molina",
    playerId: playerId("ARG-2-Molina"),
    name: "Nahuel Molina",
    nation: "ARG",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "Aggressor",
    base: { pace: 78, shooting: 50, passing: 64, defense: 68, physical: 66 },
  },
  {
    key: "ARG-19-Otamendi",
    playerId: playerId("ARG-19-Otamendi"),
    name: "Nicolás Otamendi",
    nation: "ARG",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "Aggressor",
    base: { pace: 64, shooting: 34, passing: 56, defense: 80, physical: 82 },
  },
  {
    key: "ARG-6-Romero",
    playerId: playerId("ARG-6-Romero"),
    name: "Cristian Romero",
    nation: "ARG",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "BallPlaying",
    base: { pace: 70, shooting: 36, passing: 58, defense: 78, physical: 80 },
  },
  {
    key: "ARG-3-Tagliafico",
    playerId: playerId("ARG-3-Tagliafico"),
    name: "Nicolás Tagliafico",
    nation: "ARG",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "Wall",
    base: { pace: 74, shooting: 44, passing: 62, defense: 70, physical: 68 },
  },

  // MID
  {
    key: "ARG-5-Paredes",
    playerId: playerId("ARG-5-Paredes"),
    name: "Leandro Paredes",
    nation: "ARG",
    position: "MID",
    primaryTrait: "Anchor",
    secondaryTrait: "Playmaker",
    base: { pace: 62, shooting: 56, passing: 76, defense: 66, physical: 70 },
  },
  {
    key: "ARG-7-DePaul",
    playerId: playerId("ARG-7-DePaul"),
    name: "Rodrigo De Paul",
    nation: "ARG",
    position: "MID",
    primaryTrait: "BoxToBox",
    secondaryTrait: "BallWinner",
    base: { pace: 72, shooting: 64, passing: 74, defense: 64, physical: 74 },
  },
  {
    key: "ARG-18-MacAllister",
    playerId: playerId("ARG-18-MacAllister"),
    name: "Alexis Mac Allister",
    nation: "ARG",
    position: "MID",
    primaryTrait: "Playmaker",
    secondaryTrait: "Creator",
    base: { pace: 70, shooting: 66, passing: 78, defense: 60, physical: 70 },
  },

  // FWD
  {
    key: "ARG-11-DiMaria",
    playerId: playerId("ARG-11-DiMaria"),
    name: "Ángel Di María",
    nation: "ARG",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "InsideForward",
    base: { pace: 84, shooting: 76, passing: 76, defense: 34, physical: 60 },
  },
  {
    key: "ARG-9-Lautaro",
    playerId: playerId("ARG-9-Lautaro"),
    name: "Lautaro Martínez",
    nation: "ARG",
    position: "FWD",
    primaryTrait: "Poacher",
    secondaryTrait: "TargetMan",
    base: { pace: 78, shooting: 82, passing: 66, defense: 38, physical: 76 },
  },
  {
    key: "ARG-10-Messi",
    playerId: playerId("ARG-10-Messi"),
    name: "Lionel Messi",
    nation: "ARG",
    position: "FWD",
    primaryTrait: "False9",
    secondaryTrait: "InsideForward",
    base: { pace: 82, shooting: 90, passing: 92, defense: 38, physical: 66 },
  },

  // BENCH (+4)
  {
    key: "ARG-23-Rulli",
    playerId: playerId("ARG-23-Rulli"),
    name: "Gerónimo Rulli",
    nation: "ARG",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "SweeperKeeper",
    base: { pace: 54, shooting: 16, passing: 48, defense: 66, physical: 62 },
  },
  {
    key: "ARG-14-Fernandez",
    playerId: playerId("ARG-14-Fernandez"),
    name: "Enzo Fernández",
    nation: "ARG",
    position: "MID",
    primaryTrait: "Playmaker",
    secondaryTrait: "BoxToBox",
    base: { pace: 70, shooting: 62, passing: 80, defense: 58, physical: 68 },
  },
  {
    key: "ARG-20-Alvarez",
    playerId: playerId("ARG-20-Alvarez"),
    name: "Julián Álvarez",
    nation: "ARG",
    position: "FWD",
    primaryTrait: "Poacher",
    secondaryTrait: "False9",
    base: { pace: 80, shooting: 78, passing: 68, defense: 40, physical: 70 },
  },
  {
    key: "ARG-4-Lisandro",
    playerId: playerId("ARG-4-Lisandro"),
    name: "Lisandro Martínez",
    nation: "ARG",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "Aggressor",
    base: { pace: 68, shooting: 32, passing: 62, defense: 82, physical: 78 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ENGLAND — ~11 rental pool
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "ENG-1-Pickford",
    playerId: playerId("ENG-1-Pickford"),
    name: "Jordan Pickford",
    nation: "ENG",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "SweeperKeeper",
    base: { pace: 56, shooting: 18, passing: 52, defense: 70, physical: 66 },
  },
  {
    key: "ENG-2-Alexander-Arnold",
    playerId: playerId("ENG-2-Alexander-Arnold"),
    name: "Trent Alexander-Arnold",
    nation: "ENG",
    position: "DEF",
    primaryTrait: "BallPlaying",
    secondaryTrait: "Wingback",
    base: { pace: 76, shooting: 60, passing: 84, defense: 64, physical: 68 },
  },
  {
    key: "ENG-5-Stones",
    playerId: playerId("ENG-5-Stones"),
    name: "John Stones",
    nation: "ENG",
    position: "DEF",
    primaryTrait: "BallPlaying",
    secondaryTrait: "Wall",
    base: { pace: 68, shooting: 36, passing: 72, defense: 78, physical: 74 },
  },
  {
    key: "ENG-6-Maguire",
    playerId: playerId("ENG-6-Maguire"),
    name: "Harry Maguire",
    nation: "ENG",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "Aggressor",
    base: { pace: 60, shooting: 34, passing: 58, defense: 76, physical: 80 },
  },
  {
    key: "ENG-3-Shaw",
    playerId: playerId("ENG-3-Shaw"),
    name: "Luke Shaw",
    nation: "ENG",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "Wall",
    base: { pace: 74, shooting: 44, passing: 65, defense: 70, physical: 70 },
  },
  {
    key: "ENG-4-Rice",
    playerId: playerId("ENG-4-Rice"),
    name: "Declan Rice",
    nation: "ENG",
    position: "MID",
    primaryTrait: "BallWinner",
    secondaryTrait: "Anchor",
    base: { pace: 68, shooting: 58, passing: 72, defense: 76, physical: 78 },
  },
  {
    key: "ENG-8-Bellingham",
    playerId: playerId("ENG-8-Bellingham"),
    name: "Jude Bellingham",
    nation: "ENG",
    position: "MID",
    primaryTrait: "BoxToBox",
    secondaryTrait: "Creator",
    base: { pace: 76, shooting: 74, passing: 78, defense: 62, physical: 76 },
  },
  {
    key: "ENG-20-Foden",
    playerId: playerId("ENG-20-Foden"),
    name: "Phil Foden",
    nation: "ENG",
    position: "MID",
    primaryTrait: "Playmaker",
    secondaryTrait: "Creator",
    base: { pace: 78, shooting: 72, passing: 82, defense: 48, physical: 66 },
  },
  {
    key: "ENG-11-Saka",
    playerId: playerId("ENG-11-Saka"),
    name: "Bukayo Saka",
    nation: "ENG",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "InsideForward",
    base: { pace: 82, shooting: 72, passing: 74, defense: 44, physical: 66 },
  },
  {
    key: "ENG-9-Kane",
    playerId: playerId("ENG-9-Kane"),
    name: "Harry Kane",
    nation: "ENG",
    position: "FWD",
    primaryTrait: "TargetMan",
    secondaryTrait: "Poacher",
    base: { pace: 68, shooting: 88, passing: 74, defense: 44, physical: 80 },
  },
  {
    key: "ENG-7-Sterling",
    playerId: playerId("ENG-7-Sterling"),
    name: "Raheem Sterling",
    nation: "ENG",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "False9",
    base: { pace: 88, shooting: 70, passing: 68, defense: 38, physical: 64 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BRAZIL — ~11 rental pool
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: "BRA-1-Alisson",
    playerId: playerId("BRA-1-Alisson"),
    name: "Alisson Becker",
    nation: "BRA",
    position: "GK",
    primaryTrait: "ShotStopper",
    secondaryTrait: "SweeperKeeper",
    base: { pace: 58, shooting: 16, passing: 56, defense: 80, physical: 72 },
  },
  {
    key: "BRA-2-Militao",
    playerId: playerId("BRA-2-Militao"),
    name: "Éder Militão",
    nation: "BRA",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "BallPlaying",
    base: { pace: 74, shooting: 34, passing: 60, defense: 80, physical: 78 },
  },
  {
    key: "BRA-3-Marquinhos",
    playerId: playerId("BRA-3-Marquinhos"),
    name: "Marquinhos",
    nation: "BRA",
    position: "DEF",
    primaryTrait: "Wall",
    secondaryTrait: "BallPlaying",
    base: { pace: 68, shooting: 36, passing: 66, defense: 82, physical: 74 },
  },
  {
    key: "BRA-6-Alex-Sandro",
    playerId: playerId("BRA-6-Alex-Sandro"),
    name: "Alex Sandro",
    nation: "BRA",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "Aggressor",
    base: { pace: 78, shooting: 48, passing: 64, defense: 68, physical: 72 },
  },
  {
    key: "BRA-4-Danilo",
    playerId: playerId("BRA-4-Danilo"),
    name: "Danilo",
    nation: "BRA",
    position: "DEF",
    primaryTrait: "Wingback",
    secondaryTrait: "Wall",
    base: { pace: 72, shooting: 44, passing: 66, defense: 72, physical: 68 },
  },
  {
    key: "BRA-5-Casemiro",
    playerId: playerId("BRA-5-Casemiro"),
    name: "Casemiro",
    nation: "BRA",
    position: "MID",
    primaryTrait: "Anchor",
    secondaryTrait: "BallWinner",
    base: { pace: 62, shooting: 60, passing: 68, defense: 78, physical: 82 },
  },
  {
    key: "BRA-8-Fabinho",
    playerId: playerId("BRA-8-Fabinho"),
    name: "Fabinho",
    nation: "BRA",
    position: "MID",
    primaryTrait: "BallWinner",
    secondaryTrait: "Anchor",
    base: { pace: 64, shooting: 54, passing: 70, defense: 76, physical: 80 },
  },
  {
    key: "BRA-10-Neymar",
    playerId: playerId("BRA-10-Neymar"),
    name: "Neymar Jr.",
    nation: "BRA",
    position: "FWD",
    primaryTrait: "InsideForward",
    secondaryTrait: "False9",
    base: { pace: 86, shooting: 82, passing: 86, defense: 38, physical: 62 },
  },
  {
    key: "BRA-11-Vinicius",
    playerId: playerId("BRA-11-Vinicius"),
    name: "Vinícius Jr.",
    nation: "BRA",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "InsideForward",
    base: { pace: 94, shooting: 78, passing: 70, defense: 34, physical: 64 },
  },
  {
    key: "BRA-9-Richarlison",
    playerId: playerId("BRA-9-Richarlison"),
    name: "Richarlison",
    nation: "BRA",
    position: "FWD",
    primaryTrait: "TargetMan",
    secondaryTrait: "Poacher",
    base: { pace: 78, shooting: 78, passing: 62, defense: 42, physical: 74 },
  },
  {
    key: "BRA-20-Rodrygo",
    playerId: playerId("BRA-20-Rodrygo"),
    name: "Rodrygo",
    nation: "BRA",
    position: "FWD",
    primaryTrait: "Winger",
    secondaryTrait: "False9",
    base: { pace: 84, shooting: 72, passing: 72, defense: 36, physical: 62 },
  },
];

// ---------------------------------------------------------------------------
// Lookup maps
// ---------------------------------------------------------------------------

export const PLAYER_BY_ID = new Map<`0x${string}`, PlayerDef>(
  PLAYERS.map((p) => [p.playerId, p]),
);

export const PLAYER_BY_APIID = new Map<number, PlayerDef>(
  PLAYERS.filter((p) => p.apiFootballId !== undefined).map((p) => [
    p.apiFootballId!,
    p,
  ]),
);
