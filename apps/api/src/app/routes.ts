import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { healthRoutes } from "../modules/health/health.routes.js";
import type { AppDeps } from "./container.js";

/**
 * Grupos de rotas por prefixo. Cada grupo é um escopo encapsulado do Fastify
 * com o SEU CORS — a origem do booking nunca recebe CORS nas rotas de admin.
 *
 * | Prefixo        | CORS           | Auth (tarefas seguintes) |
 * | /health        | —              | —                        |
 * | /api/public    | BOOKING_ORIGIN | —                        |
 * | /api/privacy   | BOOKING_ORIGIN | token de privacidade     |
 * | /api/admin     | ADMIN_ORIGIN   | JWT de staff             |
 */

function corsFor(origin: string) {
  return {
    origin: [origin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 600,
  };
}

export async function registerRoutes(app: FastifyInstance, deps: AppDeps) {
  const { env } = deps;

  await app.register(healthRoutes({ db: deps.health }), { prefix: "/health" });

  await app.register(
    async (publicApi) => {
      await publicApi.register(cors, corsFor(env.BOOKING_ORIGIN));
    },
    { prefix: "/api/public" },
  );

  await app.register(
    async (privacyApi) => {
      await privacyApi.register(cors, corsFor(env.BOOKING_ORIGIN));
    },
    { prefix: "/api/privacy" },
  );

  await app.register(
    async (adminApi) => {
      await adminApi.register(cors, corsFor(env.ADMIN_ORIGIN));
    },
    { prefix: "/api/admin" },
  );
}
