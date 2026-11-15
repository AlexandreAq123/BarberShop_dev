import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { AppDeps } from "../../app/container.js";
import { registerRoutes } from "../../app/routes.js";
import { buildLoggerOptions } from "../logger.js";
import { errorHandler, notFoundHandler } from "./errors.js";

/**
 * Monta a aplicação sem chamar listen(): o mesmo app serve para o servidor
 * real e para os testes (app.inject).
 */
export async function buildApp(deps: AppDeps) {
  const { env } = deps;
  const app = Fastify({
    logger: buildLoggerOptions(env),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 64 * 1024, // nenhum payload legítimo do sistema passa disso
    // Gera IDs de request para correlacionar logs sem expor dados do cliente.
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  // Zod valida body/query/params na entrada E filtra a resposta na saída:
  // campo fora do schema de resposta (ex.: passwordHash) nunca sai da API.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    // A API só devolve JSON; nada de HTML para ser enquadrado ou executar script.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  // Limite global generoso; rotas críticas (login, OTP, esquecimento)
  // recebem limites próprios e bem mais rígidos.
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // CORS é registrado por grupo de rotas (ver app/routes.ts), nunca global.
  await registerRoutes(app, deps);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
