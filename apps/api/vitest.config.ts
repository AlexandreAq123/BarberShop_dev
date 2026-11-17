import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integração tem config própria (vitest.int.config.ts) e precisa de MySQL.
    exclude: ["test/integration/**", "**/node_modules/**"],
    // Nenhum teste unitário pode depender de segredos reais nem do .env local.
    env: { NODE_ENV: "test" },
  },
});
