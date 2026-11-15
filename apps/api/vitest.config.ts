import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Nenhum teste unitário pode depender de segredos reais nem do .env local.
    env: { NODE_ENV: "test" },
  },
});
