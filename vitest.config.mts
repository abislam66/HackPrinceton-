import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same "@/..." imports as tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Unit tests for plain modules (schemas, the shot compiler). No browser environment.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
