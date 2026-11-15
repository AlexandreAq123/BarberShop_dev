import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/infra/http/app.js";
import { testDeps } from "./helpers.js";

const ADMIN = "http://localhost:5174";
const BOOKING = "http://localhost:5173";
const EVIL = "https://site-malicioso.com";

let app: App;
beforeAll(async () => {
  app = await buildApp(testDeps());
});
afterAll(() => app.close());

/** Preflight do navegador: é ele que decide se o front pode chamar a rota. */
async function preflight(url: string, origin: string) {
  const res = await app.inject({
    method: "OPTIONS",
    url,
    headers: { origin, "access-control-request-method": "POST" },
  });
  return res.headers["access-control-allow-origin"];
}

describe("CORS por escopo", () => {
  it.each([
    ["/api/admin/qualquer", ADMIN],
    ["/api/public/qualquer", BOOKING],
    ["/api/privacy/qualquer", BOOKING],
  ])("%s libera %s", async (url, origin) => {
    expect(await preflight(url, origin)).toBe(origin);
  });

  it.each([
    ["/api/admin/qualquer", BOOKING],
    ["/api/public/qualquer", ADMIN],
    ["/api/privacy/qualquer", ADMIN],
    ["/api/admin/qualquer", EVIL],
    ["/api/public/qualquer", EVIL],
  ])("%s NÃO libera %s", async (url, origin) => {
    expect(await preflight(url, origin)).toBeUndefined();
  });

  it("origem do booking não recebe CORS em /api/admin/*", async () => {
    expect(await preflight("/api/admin/auth/login", BOOKING)).toBeUndefined();
  });
});
