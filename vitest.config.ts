import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["addon/test/**/*.test.ts", "tools/**/*.test.ts"] },
});
