import { z } from "zod";

/**
 * Validação de ambiente no boot ("Crash Early").
 * Se qualquer variável crítica faltar ou estiver malformada, a API não sobe.
 * As mensagens de erro citam apenas o NOME da variável — nunca o valor.
 */

const secret = (min: number) => z.string().min(min, `precisa ter pelo menos ${min} caracteres`);

const aes256Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "precisa ser 32 bytes em base64");

const dbUrl = z
  .string()
  .refine((v) => /^(mysql|mariadb):\/\//.test(v), "precisa começar com mysql:// ou mariadb://")
  .refine((v) => URL.canParse(v), "URL inválida");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /**
     * `false` (dev, sem proxy) ou o número de proxies confiáveis à frente da API (1–5).
     * Atrás do Nginx (na mesma máquina) use 1: o IP real vem do último salto de
     * X-Forwarded-For. O salto 0 precisa ser loopback (ver trustProxyFn em http/app.ts).
     * `true` não é aceito — confiaria em qualquer X-Forwarded-For forjado pelo cliente.
     */
    TRUST_PROXY: z
      .enum(["false", "1", "2", "3", "4", "5"], {
        error: "precisa ser false ou o número de proxies (1–5)",
      })
      .transform((v) => (v === "false" ? false : Number(v)))
      .default(false),

    DATABASE_URL: dbUrl,
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).default(5),

    JWT_ACCESS_SECRET: secret(32),
    PHONE_ENC_KEY: aes256Key,
    PHONE_HASH_PEPPER: secret(32),

    WA_APP_SECRET: secret(16),
    WA_VERIFY_TOKEN: secret(16),

    ADMIN_ORIGIN: z.url(),
    BOOKING_ORIGIN: z.url(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["ADMIN_ORIGIN", "BOOKING_ORIGIN"] as const) {
      if (!env[key].startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: [key], message: "precisa ser https em produção" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Variáveis de ambiente inválidas:\n${issues.map((i) => `  • ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return Object.freeze(result.data);

  const issues = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(raiz)";
    const message = issue.code === "invalid_type" ? "ausente ou com tipo errado" : issue.message;
    return `${key}: ${message}`;
  });
  throw new EnvValidationError(issues);
}
