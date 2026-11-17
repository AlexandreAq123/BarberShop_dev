import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

/**
 * Testes de integração: MySQL real no banco `barber_test`.
 * Do .env local lemos APENAS TEST_DATABASE_URL (no CI ela vem do ambiente).
 */
const fromFile = existsSync(".env") ? parse(readFileSync(".env")) : {};
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? fromFile.TEST_DATABASE_URL ?? "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.int.test.ts"],
    setupFiles: ["test/integration/setup.ts"],
    // Um arquivo por vez: todos compartilham o mesmo banco.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: { NODE_ENV: "test", TEST_DATABASE_URL },
  },
});
