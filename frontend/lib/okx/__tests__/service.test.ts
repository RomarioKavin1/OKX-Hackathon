import { describe, it, expect } from "vitest";
import { OkxService } from "../service";

describe("OkxService", () => {
  it("builds an execFile invocation with json output and passes auth env", () => {
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const svc = new OkxService({
      bin: "onchainos",
      env: { OKX_API_KEY: "k", OKX_SECRET_KEY: "s", OKX_PASSPHRASE: "p" },
      runner: async (bin, args, env) => { calls.push({ args, env }); return JSON.stringify({ ok: true }); },
    });
    return svc.run(["wallet", "balance", "--chain", "xlayer_test"]).then((out) => {
      expect(out).toEqual({ ok: true });
      expect(calls[0].args).toContain("--output");
      expect(calls[0].args).toContain("json");
      expect(calls[0].env.OKX_API_KEY).toBe("k");
    });
  });
});
