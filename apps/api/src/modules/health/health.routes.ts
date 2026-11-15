import type { FastifyInstance } from "fastify";
import type { DbHealth } from "../../infra/db.js";

/**
 * /health/live  → o processo está de pé (usado pelo PM2/monitor de uptime).
 * /health/ready → o processo consegue falar com o MySQL (usado antes de receber tráfego).
 * Nenhum dos dois expõe versão, hostname ou detalhes do erro.
 */
const READY_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function healthRoutes(deps: { db: DbHealth }) {
  return async (app: FastifyInstance) => {
    app.get("/live", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

    app.get("/ready", { config: { rateLimit: false } }, async (request, reply) => {
      try {
        await withTimeout(deps.db.ping(), READY_TIMEOUT_MS);
        return { status: "ok" };
      } catch (err) {
        request.log.error({ err }, "health/ready: banco indisponível");
        return reply.code(503).send({ status: "unavailable" });
      }
    });
  };
}
