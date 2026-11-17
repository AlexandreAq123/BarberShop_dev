// Aplica as migrations no banco de TESTE (barber_test). Rode: pnpm db:deploy:test
// Usa TEST_MIGRATION_DATABASE_URL (ambiente ou apps/api/.env) no lugar da
// MIGRATION_DATABASE_URL — o banco de desenvolvimento nunca é tocado.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.TEST_MIGRATION_DATABASE_URL;
if (!url) {
  console.error("TEST_MIGRATION_DATABASE_URL não definida (ver apps/api/.env.example).");
  process.exit(1);
}
const name = new URL(url).pathname.replace(/^\//, "");
if (!name.endsWith("_test")) {
  console.error(
    `TEST_MIGRATION_DATABASE_URL precisa apontar para um banco *_test (recebido: "${name}").`,
  );
  process.exit(1);
}

const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, MIGRATION_DATABASE_URL: url },
});
process.exit(result.status ?? 1);
