import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { DbHealth } from "../db.js";
import type { Env } from "../env.js";
import { buildLoggerOptions } from "../logger.js";
import { healthRoutes } from "../../modules/health/health.routes.js";

export interface AppDeps {
  env: Env;
  db: DbHealth;
}

/**
 * Monta a aplicação sem chamar listen(): o mesmo app serve para o servidor
 * real e para os testes (app.inject).
 */
export async function buildApp({ env, db }: AppDeps) {
  const app = Fastify({
    logger: buildLoggerOptions(env),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 64 * 1024, // nenhum payload legítimo do sistema passa disso
    // Gera IDs de request para correlacionar logs sem expor dados do cliente.
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, {
    // A API só devolve JSON; nada de HTML para ser enquadrado ou executar script.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  // Fase 1: lista de origens conhecidas. Na Fase 2 as rotas /admin passam a
  // aceitar SOMENTE ADMIN_ORIGIN, via escopo próprio de plugin.
  await app.register(cors, {
    origin: [env.ADMIN_ORIGIN, env.BOOKING_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  });

  // Limite global generoso; rotas críticas (login, OTP, esquecimento)
  // recebem limites próprios e bem mais rígidos na Fase 2.
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
  });

  app.setErrorHandler((error: { statusCode?: number; validation?: unknown }, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, "erro não tratado");

    // Nunca devolve stack trace nem mensagem interna para o cliente.
    const message =
      status === 429
        ? "Muitas requisições. Tente novamente em instantes."
        : status < 500
          ? "Requisição inválida."
          : "Erro interno.";
    return reply.code(status).send({ error: message });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Não encontrado." }));

  await app.register(healthRoutes({ db }), { prefix: "/health" });

  return app;
}
