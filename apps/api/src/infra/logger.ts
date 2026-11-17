import type { LoggerOptions } from "pino";
import type { Env } from "./env.js";

/**
 * Nada de dado pessoal ou credencial em log. Os caminhos abaixo são
 * substituídos por "[redacted]" antes de qualquer saída.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-hub-signature-256"]',
  'res.headers["set-cookie"]',
  // `*.x` cobre só UM nível de aninhamento: o caminho no topo vai explícito.
  "password",
  "*.password",
  "*.passwordHash",
  "temporaryPassword",
  "*.temporaryPassword",
  "*.token",
  "*.phone",
  "*.phoneE164",
  "*.phoneEnc",
  "*.name",
  "*.otp",
];

export function buildLoggerOptions(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): LoggerOptions {
  return {
    level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...(env.NODE_ENV === "development" && {
      transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } },
    }),
  };
}
