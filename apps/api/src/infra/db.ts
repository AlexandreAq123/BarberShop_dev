import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";
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

/**
 * Cliente dentro de `db.$transaction(async (tx) => …)`. Repositórios recebem
 * `Db | DbTx` para que o mesmo método rode dentro ou fora de uma transação.
 */
export type DbTx = Prisma.TransactionClient;

/**
 * Trava a linha da loja até o fim da transação. Operações que validam dados contra a
 * configuração da loja (passo de slot, horário de funcionamento) passam por aqui:
 * assim "alterar a configuração" e "gravar algo que depende dela" nunca se cruzam.
 * Template tag ⇒ parâmetro preparado; nunca `$queryRawUnsafe`.
 */
export async function lockShop(tx: DbTx, shopId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM shops WHERE id = ${shopId} FOR UPDATE`;
}

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
