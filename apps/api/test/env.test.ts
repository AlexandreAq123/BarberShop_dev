import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "../src/infra/env.js";
import { validEnvSource } from "./helpers.js";

describe("loadEnv", () => {
  it("aceita um ambiente completo e aplica defaults", () => {
    const env = loadEnv(validEnvSource());
    expect(env.PORT).toBe(3333);
    expect(env.TRUST_PROXY).toBe(false);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("falha listando TODAS as variáveis ausentes, sem vazar valores", () => {
    const source = validEnvSource({ JWT_ACCESS_SECRET: undefined, WA_APP_SECRET: undefined });
    try {
      loadEnv(source);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const message = (err as Error).message;
      expect(message).toContain("JWT_ACCESS_SECRET");
      expect(message).toContain("WA_APP_SECRET");
      expect(message).not.toContain(source.PHONE_HASH_PEPPER);
    }
  });

  it("rejeita chave AES com tamanho errado", () => {
    expect(() => loadEnv(validEnvSource({ PHONE_ENC_KEY: "curta" }))).toThrow(/PHONE_ENC_KEY/);
  });

  it("rejeita banco que não é MySQL", () => {
    expect(() => loadEnv(validEnvSource({ DATABASE_URL: "postgres://u:p@h/db" }))).toThrow(
      /DATABASE_URL/,
    );
  });

  it("exige https nas origens em produção", () => {
    expect(() => loadEnv(validEnvSource({ NODE_ENV: "production" }))).toThrow(/ADMIN_ORIGIN/);
    expect(() =>
      loadEnv(
        validEnvSource({
          NODE_ENV: "production",
          ADMIN_ORIGIN: "https://admin.exemplo.com.br",
          BOOKING_ORIGIN: "https://exemplo.com.br",
        }),
      ),
    ).not.toThrow();
  });
});
