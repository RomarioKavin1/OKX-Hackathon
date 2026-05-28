import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADDRESSES } from "../addresses";

// Load the deployment JSON via fs so this test works regardless of TS rootDir
// constraints. The file lives at repo-root/contracts/deployments/xlayer-testnet.json.
const deploymentPath = resolve(
  __dirname,
  "../../../../contracts/deployments/xlayer-testnet.json"
);
const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8")) as {
  contracts: Record<string, string>;
};

describe("address drift", () => {
  it("ADDRESSES match deployments JSON for all 11 contracts", () => {
    const entries = Object.entries(ADDRESSES);
    expect(entries).toHaveLength(11);

    for (const [name, addr] of entries) {
      const deployed = deployment.contracts[name];
      expect(deployed, `${name} missing from deployment JSON`).toBeDefined();
      expect(deployed.toLowerCase()).toBe((addr as string).toLowerCase());
    }
  });
});
