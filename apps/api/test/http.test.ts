import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/infra/http/app.js";
import { testDeps } from "./helpers.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const healthyDb = { ping: async () => {} };
const brokenDb = {
  ping: async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:3306 senha=segredo");
  },
};

describe("health", () => {
  it("live responde 200 sem tocar no banco", async () => {
    app = await buildApp(testDeps({ health: brokenDb }));
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("ready responde 200 com banco ok", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
  });

  it("ready responde 503 sem vazar o erro interno", async () => {
    app = await buildApp(testDeps({ health: brokenDb }));
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("ECONNREFUSED");
    expect(res.body).not.toContain("segredo");
  });
});

describe("health com banco travado", () => {
  it("ready desiste em ~2s em vez de prender a requisição", async () => {
    const hangingDb = { ping: () => new Promise<void>(() => {}) };
    app = await buildApp(testDeps({ health: hangingDb }));
    const started = Date.now();
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

describe("hardening HTTP", () => {
  it("envia headers de segurança", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("health não envia CORS (não é chamado por navegador)", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    const res = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { origin: "http://localhost:5174" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("404 padronizado em JSON", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    const res = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Não encontrado.", code: "NOT_FOUND" });
  });

  it("rejeita payload acima do limite", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    app.post("/eco", async () => ({ ok: true }));
    const res = await app.inject({
      method: "POST",
      url: "/eco",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ x: "a".repeat(70 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: "Requisição muito grande.", code: "PAYLOAD_TOO_LARGE" });
  });

  it("aplica rate limit global", async () => {
    app = await buildApp(testDeps({ health: healthyDb }));
    app.get("/ping", async () => ({ ok: true }));
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (await app.inject({ method: "GET", url: "/ping" })).statusCode;
    }
    expect(last).toBe(429);
  });

  describe("com TRUST_PROXY=1", () => {
    async function ipVia(remoteAddress: string) {
      const proxied = await buildApp(testDeps({ health: healthyDb, env: { TRUST_PROXY: "1" } }));
      app = proxied;
      proxied.get("/ip", async (request) => ({ ip: request.ip }));
      const res = await proxied.inject({
        method: "GET",
        url: "/ip",
        remoteAddress,
        headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" }, // 1º forjado pelo cliente
      });
      return res.json<{ ip: string }>().ip;
    }

    // O Nginx pode chegar em qualquer formato de loopback, conforme a config dele e do Node.
    // Se algum não for aceito, o IP vira o do proxy em silêncio e o rate limit fica global.
    it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
      "peer loopback %s: IP vem do último salto de X-Forwarded-For",
      async (peer) => {
        expect(await ipVia(peer)).toBe("203.0.113.7");
      },
    );

    it("peer não-loopback (acesso direto à API): X-Forwarded-For é ignorado", async () => {
      expect(await ipVia("198.51.100.9")).toBe("198.51.100.9");
    });
  });
});
