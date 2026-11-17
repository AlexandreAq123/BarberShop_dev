import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Configuração usada SOMENTE pelo Prisma CLI (generate, migrate, seed).
 *
 * As migrations rodam com um usuário próprio (barber_migrator), que tem
 * permissão de DDL. A aplicação em execução usa DATABASE_URL (barber_app),
 * que só tem SELECT/INSERT/UPDATE/DELETE. Ver docs/adr/003.
 *
 * `prisma generate` não precisa de banco, por isso a URL é opcional aqui.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL,
    // Vazio no .env = não definido (o Prisma rejeita string vazia).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
