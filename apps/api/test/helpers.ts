import { randomBytes } from "node:crypto";
import { loadEnv } from "../src/infra/env.js";

/** Ambiente completo e válido, gerado na hora — testes nunca leem o .env real. */
export function validEnvSource(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "mysql://barber_app:x@127.0.0.1:3306/barber",
    JWT_ACCESS_SECRET: randomBytes(48).toString("base64url"),
    PHONE_ENC_KEY: randomBytes(32).toString("base64"),
    PHONE_HASH_PEPPER: randomBytes(32).toString("base64url"),
    WA_APP_SECRET: randomBytes(24).toString("base64url"),
    WA_VERIFY_TOKEN: randomBytes(24).toString("base64url"),
    ADMIN_ORIGIN: "http://localhost:5174",
    BOOKING_ORIGIN: "http://localhost:5173",
    ...overrides,
  };
}

export const testEnv = (overrides?: Record<string, string | undefined>) =>
  loadEnv(validEnvSource(overrides));
