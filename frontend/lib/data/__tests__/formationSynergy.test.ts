import { describe, it, expect } from "vitest";
import { FORMATION_SYNERGIES } from "../formationSynergy";
import type { Trait } from "../traits";
import type { FormationName, Position } from "@/lib/types";

function syn(name: string) {
  const s = FORMATION_SYNERGIES.find((s) => s.name === name);
  if (!s) throw new Error(`synergy ${name} not found`);
  return s;
}

function ctx(formation: FormationName, traits: Trait[][], positions: Position[] = []) {
  return { formation, traits, positions };
}

describe("FORMATION_SYNERGIES — spec §4.3 pin tests", () => {
  describe("WidePlay", () => {
    const s = syn("WidePlay");

    it("triggers with 4-3-3 + 2 Wingers", () => {
      expect(
        s.triggers(ctx("4-3-3", [
          ["Winger"], ["Winger"], ["Playmaker"],
        ])),
      ).toBe(true);
    });

    it("does NOT trigger with 4-3-3 + 1 Winger only", () => {
      expect(
        s.triggers(ctx("4-3-3", [
          ["Winger"], ["Playmaker"], ["Playmaker"],
        ])),
      ).toBe(false);
    });

    it("does NOT trigger with a non-wide formation", () => {
      expect(
        s.triggers(ctx("5-3-2", [
          ["Winger"], ["Winger"], ["Winger"],
        ])),
      ).toBe(false);
    });

    it("multiplier — DEF/MID/FWD = 1.05, GK = 1.0", () => {
      expect(s.multForPosition("DEF")).toBeCloseTo(1.05);
      expect(s.multForPosition("MID")).toBeCloseTo(1.05);
      expect(s.multForPosition("FWD")).toBeCloseTo(1.05);
      expect(s.multForPosition("GK")).toBeCloseTo(1.0);
    });
  });

  describe("IronWall", () => {
    const s = syn("IronWall");

    it("triggers with 5-3-2 + 3 Wall traits", () => {
      expect(
        s.triggers(ctx("5-3-2", [
          ["Wall"], ["Wall"], ["Wall"], ["Poacher"],
        ])),
      ).toBe(true);
    });

    it("does NOT trigger with 5-3-2 + 2 Wall traits", () => {
      expect(
        s.triggers(ctx("5-3-2", [
          ["Wall"], ["Wall"], ["Aggressor"],
        ])),
      ).toBe(false);
    });

    it("does NOT trigger with a non-5-3-2 formation", () => {
      expect(
        s.triggers(ctx("4-3-3", [
          ["Wall"], ["Wall"], ["Wall"], ["Wall"],
        ])),
      ).toBe(false);
    });

    it("multiplier — DEF/GK = 1.10, MID/FWD = 1.0", () => {
      expect(s.multForPosition("DEF")).toBeCloseTo(1.10);
      expect(s.multForPosition("GK")).toBeCloseTo(1.10);
      expect(s.multForPosition("MID")).toBeCloseTo(1.0);
      expect(s.multForPosition("FWD")).toBeCloseTo(1.0);
    });
  });

  describe("TikiTaka", () => {
    const s = syn("TikiTaka");

    it("triggers with 4-3-3 + 3 Playmakers", () => {
      expect(
        s.triggers(ctx("4-3-3", [
          ["Playmaker"], ["Playmaker"], ["Playmaker"], ["Wall"],
        ])),
      ).toBe(true);
    });

    it("triggers with 3-5-2 + 2 Playmakers + 1 Creator", () => {
      expect(
        s.triggers(ctx("3-5-2", [
          ["Playmaker"], ["Playmaker"], ["Creator"], ["Wall"],
        ])),
      ).toBe(true);
    });

    it("does NOT trigger with 3-5-2 + 2 Playmakers only", () => {
      expect(
        s.triggers(ctx("3-5-2", [
          ["Playmaker"], ["Playmaker"], ["Wall"],
        ])),
      ).toBe(false);
    });

    it("multiplier — MID = 1.08, others = 1.0", () => {
      expect(s.multForPosition("MID")).toBeCloseTo(1.08);
      expect(s.multForPosition("DEF")).toBeCloseTo(1.0);
      expect(s.multForPosition("FWD")).toBeCloseTo(1.0);
      expect(s.multForPosition("GK")).toBeCloseTo(1.0);
    });
  });

  describe("CounterAttack", () => {
    const s = syn("CounterAttack");

    it("triggers with 2 Poachers + 2 BallWinners (any formation)", () => {
      expect(
        s.triggers(ctx("4-4-2", [
          ["Poacher"], ["Poacher"], ["BallWinner"], ["BallWinner"], ["Wall"],
        ])),
      ).toBe(true);
    });

    it("does NOT trigger with 2 Poachers + 1 BallWinner", () => {
      expect(
        s.triggers(ctx("4-4-2", [
          ["Poacher"], ["Poacher"], ["BallWinner"], ["Wall"],
        ])),
      ).toBe(false);
    });

    it("multiplier — FWD = 1.12, others = 1.0", () => {
      expect(s.multForPosition("FWD")).toBeCloseTo(1.12);
      expect(s.multForPosition("MID")).toBeCloseTo(1.0);
      expect(s.multForPosition("DEF")).toBeCloseTo(1.0);
      expect(s.multForPosition("GK")).toBeCloseTo(1.0);
    });
  });

  describe("BrickDefense", () => {
    const s = syn("BrickDefense");

    it("triggers with 5 Wall traits (any formation)", () => {
      expect(
        s.triggers(ctx("4-4-2", [
          ["Wall"], ["Wall"], ["Wall"], ["Wall"], ["Wall"], ["Poacher"],
        ])),
      ).toBe(true);
    });

    it("triggers with 4 Wall + 1 SweeperKeeper", () => {
      expect(
        s.triggers(ctx("3-5-2", [
          ["Wall"], ["Wall"], ["Wall"], ["Wall"], ["SweeperKeeper"], ["Poacher"],
        ])),
      ).toBe(true);
    });

    it("does NOT trigger with only 4 Wall traits", () => {
      expect(
        s.triggers(ctx("4-4-2", [
          ["Wall"], ["Wall"], ["Wall"], ["Wall"], ["Aggressor"], ["Poacher"],
        ])),
      ).toBe(false);
    });

    it("multiplier — DEF/GK = 1.15, FWD/MID = 0.95", () => {
      expect(s.multForPosition("DEF")).toBeCloseTo(1.15);
      expect(s.multForPosition("GK")).toBeCloseTo(1.15);
      expect(s.multForPosition("FWD")).toBeCloseTo(0.95);
      expect(s.multForPosition("MID")).toBeCloseTo(0.95);
    });
  });
});
