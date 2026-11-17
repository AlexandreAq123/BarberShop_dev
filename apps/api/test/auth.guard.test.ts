import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type App } from "../src/infra/http/app.js";
import type { StaffClaims } from "../src/modules/auth/auth.tokens.js";
import { fakeStaffAccess, testDeps } from "./helpers.js";

/** O guard relê o staff via StaffAccess; aqui ele é um mapa em memória (sem MySQL). */
const access = new Map<string, Awaited<ReturnType<ReturnType<typeof fakeStaffAccess>["load"]>>>([
  ["staff-mcp", { active: true, role: "BARBER", mustChangePassword: true }],
]);
let app: App;
let deps: ReturnType<typeof testDeps>;
beforeAll(async () => {
  deps = testDeps({ staffAccess: fakeStaffAccess(access) });
  app = await buildApp(deps);
});
afterAll(() => app.close());

const sign = (overrides: Partial<StaffClaims> = {}) =>
  deps.staffTokens.sign({
    staffId: "staff-1",
    shopId: "shop-1",
    role: "OWNER",
    mustChangePassword: false,
    ...overrides,
  });

describe("guard do /api/admin", () => {
  it("rota protegida sem token ⇒ 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Não autenticado.", code: "UNAUTHORIZED" });
  });

  it("rota inexistente no /api/admin ⇒ 404 padrão, sem detalhes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/qualquer-coisa" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Não encontrado.", code: "NOT_FOUND" });
  });

  it.each([
    ["esquema errado", (t: string) => `Basic ${t}`],
    ["token adulterado", (t: string) => `Bearer ${t.slice(0, -2)}xx`],
    ["lixo", () => "Bearer abc.def.ghi"],
  ])("%s ⇒ 401", async (_name, header) => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { authorization: header(await sign()) },
    });
    expect(res.statusCode).toBe(401);
  });

  it("mustChangePassword (do BANCO) bloqueia as demais rotas com 403", async () => {
    // O token diz mustChangePassword=false; vale o banco (true).
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { authorization: `Bearer ${await sign({ staffId: "staff-mcp" })}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it.each([
    ["desativado", { active: false, role: "OWNER" as const, mustChangePassword: false }],
    ["inexistente", null],
  ])("token válido de staff %s ⇒ 401", async (_name, row) => {
    access.set("staff-gone", row);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { authorization: `Bearer ${await sign({ staffId: "staff-gone" })}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login, refresh e logout são públicos (não pedem JWT)", async () => {
    const login = await app.inject({ method: "POST", url: "/api/admin/auth/login", payload: {} });
    expect(login.statusCode).toBe(400); // validação, não 401
    const refresh = await app.inject({ method: "POST", url: "/api/admin/auth/refresh" });
    expect(refresh.statusCode).toBe(403); // falta X-Requested-With, não 401
  });

  it("refresh e logout exigem X-Requested-With: fetch", async () => {
    for (const url of ["/api/admin/auth/refresh", "/api/admin/auth/logout"]) {
      const res = await app.inject({ method: "POST", url });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF");
    }
  });

  it("senha nova curta ⇒ 400 sem ecoar a senha", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/auth/password",
      headers: { authorization: `Bearer ${await sign({ staffId: "staff-mcp" })}` },
      payload: { currentPassword: "atual-secreta", newPassword: "curta" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe("body.newPassword");
    expect(res.body).not.toContain("curta");
    expect(res.body).not.toContain("atual-secreta");
  });
});
