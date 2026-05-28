import { defineConfig, configDefaults } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "services/**/*.test.ts", "verifier/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.it.test.ts"],
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
