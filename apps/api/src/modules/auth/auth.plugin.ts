import type { FastifyInstance, FastifyRequest } from "fastify";
import type { StaffRole } from "../../generated/prisma/client.ts";
import { AppError } from "../../infra/http/errors.js";
import type { StaffClaims, StaffTokens } from "./auth.tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo authenticate em toda rota protegida do /api/admin. */
    staff: StaffClaims | null;
  }
  interface FastifyContextConfig {
    /** false = rota pública dentro do /api/admin (login, refresh, logout). */
    auth?: false;
    /** true = acessível mesmo com mustChangePassword (só a troca de senha). */
    allowMustChangePassword?: true;
  }
}

const UNAUTHENTICATED = "Não autenticado.";

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

/**
 * Protege TODAS as rotas do escopo por padrão (secure by default): uma rota
 * nova esquecida sem configuração fica fechada, não aberta.
 */
export function registerStaffAuth(app: FastifyInstance, tokens: StaffTokens) {
  app.decorateRequest("staff", null);

  app.addHook("onRequest", async (request) => {
    if (request.method === "OPTIONS") return; // preflight de CORS
    const config = request.routeOptions.config;
    if (config.auth === false) return;

    const token = bearer(request);
    if (!token) throw new AppError("UNAUTHORIZED", UNAUTHENTICATED);
    try {
      request.staff = await tokens.verify(token);
    } catch {
      throw new AppError("UNAUTHORIZED", UNAUTHENTICATED);
    }

    if (request.staff.mustChangePassword && !config.allowMustChangePassword) {
      throw new AppError("FORBIDDEN", "Troque sua senha para continuar.", {
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }
  });
}

/** Staff autenticado (use só em rotas protegidas). */
export function currentStaff(request: FastifyRequest): StaffClaims {
  if (!request.staff) throw new AppError("UNAUTHORIZED", UNAUTHENTICATED);
  return request.staff;
}

/** preHandler: exige um dos papéis. Ex.: `preHandler: requireRole("OWNER", "MANAGER")`. */
export function requireRole(...roles: StaffRole[]) {
  return async (request: FastifyRequest) => {
    if (!roles.includes(currentStaff(request).role)) {
      throw new AppError("FORBIDDEN", "Acesso negado.");
    }
  };
}
