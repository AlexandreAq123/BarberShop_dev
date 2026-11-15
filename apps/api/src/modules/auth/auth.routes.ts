import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../../infra/http/errors.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../../infra/password.js";
import { currentStaff } from "./auth.plugin.js";
import { normalizeEmail, type AuthResult, type AuthService } from "./auth.service.js";

export const REFRESH_COOKIE = "rt";
export const REFRESH_COOKIE_PATH = "/api/admin/auth";

const role = z.enum(["OWNER", "MANAGER", "BARBER", "FINANCE"]);
const staffOut = z.object({
  id: z.string(),
  name: z.string(),
  role,
  mustChangePassword: z.boolean(),
});
const sessionOut = z.object({ accessToken: z.string(), staff: staffOut });

const loginBody = z.object({
  shopSlug: z.string().trim().min(1).max(60),
  email: z.string().trim().max(120),
  password: z.string().min(1).max(PASSWORD_MAX),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z
    .string()
    .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
    .max(PASSWORD_MAX),
});

/** Defesa extra de CSRF: formulário/navegação cross-site não consegue enviar este header. */
async function requireFetchHeader(request: FastifyRequest) {
  if (request.headers["x-requested-with"] !== "fetch") {
    throw new AppError("FORBIDDEN", "Requisição inválida.", { code: "CSRF" });
  }
}

/** Chave do limite por conta: hash de loja+e-mail (e-mail não fica em memória). */
function accountKey(request: FastifyRequest) {
  const body = request.body as z.infer<typeof loginBody>;
  return createHash("sha256")
    .update(`login:${body.shopSlug.toLowerCase()}:${normalizeEmail(body.email)}`)
    .digest("hex");
}

export function authRoutes(deps: { auth: AuthService; secureCookies: boolean }) {
  const { auth, secureCookies } = deps;

  function setRefreshCookie(reply: FastifyReply, result: AuthResult) {
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      expires: result.refreshExpiresAt,
    });
  }

  function clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });
  }

  const plugin: FastifyPluginAsyncZod = async (app) => {
    // Limite por loja+e-mail: segura força bruta distribuída por vários IPs.
    const perAccountLimit = app.rateLimit({
      max: 5,
      timeWindow: "15 minutes",
      keyGenerator: accountKey,
    });

    app.post(
      "/login",
      {
        config: { auth: false, rateLimit: { max: 5, timeWindow: "1 minute" } },
        preHandler: perAccountLimit,
        schema: { body: loginBody, response: { 200: sessionOut } },
      },
      async (request, reply) => {
        const result = await auth.login(request.body);
        setRefreshCookie(reply, result);
        return { accessToken: result.accessToken, staff: result.staff };
      },
    );

    app.post(
      "/refresh",
      {
        config: { auth: false, rateLimit: { max: 30, timeWindow: "1 minute" } },
        preHandler: requireFetchHeader,
        schema: { response: { 200: sessionOut } },
      },
      async (request, reply) => {
        try {
          const result = await auth.refresh(request.cookies[REFRESH_COOKIE]);
          setRefreshCookie(reply, result);
          return { accessToken: result.accessToken, staff: result.staff };
        } catch (err) {
          clearRefreshCookie(reply);
          throw err;
        }
      },
    );

    app.post(
      "/logout",
      { config: { auth: false }, preHandler: requireFetchHeader },
      async (request, reply) => {
        await auth.logout(request.cookies[REFRESH_COOKIE]);
        clearRefreshCookie(reply);
        return reply.code(204).send();
      },
    );

    app.post(
      "/password",
      {
        config: { allowMustChangePassword: true, rateLimit: { max: 5, timeWindow: "1 minute" } },
        schema: { body: passwordBody, response: { 200: z.object({ accessToken: z.string() }) } },
      },
      async (request) =>
        auth.changePassword({
          claims: currentStaff(request),
          currentPassword: request.body.currentPassword,
          newPassword: request.body.newPassword,
          refreshToken: request.cookies[REFRESH_COOKIE],
        }),
    );

    app.get("/me", { schema: { response: { 200: staffOut } } }, async (request) =>
      auth.me(currentStaff(request)),
    );
  };

  return plugin;
}
