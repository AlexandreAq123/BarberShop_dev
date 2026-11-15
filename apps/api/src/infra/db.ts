import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";
import type { Env } from "./env.js";

/**
 * Único ponto de criação do Prisma Client.
 * Apenas a camada Repository de cada módulo deve recebê-lo.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function createDb(env: Pick<Env, "DATABASE_URL" | "DB_CONNECTION_LIMIT">) {
  const url = new URL(env.DATABASE_URL);
  const host = url.hostname;

  const adapter = new PrismaMariaDb({
    host,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: env.DB_CONNECTION_LIMIT,
    // Falhar rápido: com o banco fora, a requisição não deve ficar presa por 20s+.
    connectTimeout: 3_000,
    acquireTimeout: 5_000,
    // MySQL 8 usa caching_sha2_password; sem TLS o driver precisa buscar a chave
    // pública do servidor. Só permitimos isso em conexão local (sem risco de MITM).
    allowPublicKeyRetrieval: LOOPBACK_HOSTS.has(host),
  });

  return new PrismaClient({ adapter });
}

export type Db = ReturnType<typeof createDb>;

/** Contrato mínimo usado pelo health check — facilita testar sem banco. */
export interface DbHealth {
  ping(): Promise<void>;
}

export function dbHealth(db: Db): DbHealth {
  return {
    ping: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  };
}
