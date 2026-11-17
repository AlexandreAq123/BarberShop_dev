import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../../src/app/container.js";
import type { App } from "../../src/infra/http/app.js";
import { adminAs } from "./admin.js";
import { buildTestApp } from "./app.js";
import { testDb } from "./db.js";
import { createService, createShop, createStaff } from "./factories.js";

let app: App;
let container: Container;
beforeEach(async () => {
  ({ app, container } = await buildTestApp());
});
afterEach(() => app.close());

async function shopWithOwner() {
  const shop = await createShop();
  const owner = await createStaff(shop.id, { role: "OWNER" });
  return { shop, owner, call: await adminAs(app, container, owner) };
}

function login(shopSlug: string, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: { shopSlug, email, password },
  });
}

const activeSessions = (staffId: string) => testDb().staffSession.count({ where: { staffId } });

describe("criação de staff", () => {
  it("devolve a senha temporária UMA vez, sem cache, e ela exige troca no 1º acesso", async () => {
    const { shop, call } = await shopWithOwner();
    const res = await call("POST", "/staff", {
      name: "Novo Barbeiro",
      email: "Novo@Teste.Local",
      role: "BARBER",
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.json();
    expect(body.staff).toMatchObject({ email: "novo@teste.local", mustChangePassword: true });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2|mfa/);

    const first = await login(shop.slug, "novo@teste.local", body.temporaryPassword);
    expect(first.statusCode).toBe(200);
    expect(first.json().staff.mustChangePassword).toBe(true);
  });

  it("e-mail repetido na loja ⇒ 409, sem diferenciar maiúsculas", async () => {
    const { shop, call } = await shopWithOwner();
    await createStaff(shop.id, { email: "dup@teste.local" });
    const res = await call("POST", "/staff", {
      name: "X",
      email: "DUP@teste.local",
      role: "BARBER",
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EMAIL_TAKEN");
  });
});

describe("reset de senha", () => {
  it("senha temporária, mustChangePassword e todas as sessões do alvo encerradas", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER", password: "senha-antiga-123" });
    expect((await login(shop.slug, barber.email, "senha-antiga-123")).statusCode).toBe(200);
    expect(await activeSessions(barber.id)).toBe(1);

    const res = await call("POST", `/staff/${barber.id}/password-reset`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const { temporaryPassword } = res.json();
    expect(temporaryPassword).toMatch(/^[\w-]{16}$/);

    expect(await activeSessions(barber.id)).toBe(0);
    const row = await testDb().staff.findUniqueOrThrow({ where: { id: barber.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(row.passwordHash).not.toContain(temporaryPassword);
    expect((await login(shop.slug, barber.email, "senha-antiga-123")).statusCode).toBe(401);
    expect((await login(shop.slug, barber.email, temporaryPassword)).statusCode).toBe(200);
  });

  it("registra staff.password_reset com ids, sem a senha", async () => {
    const { shop, owner } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const audit = vi.fn();
    const actor = {
      staffId: owner.id,
      shopId: shop.id,
      role: "OWNER" as const,
      mustChangePassword: false,
    };
    const { temporaryPassword } = await container.staff.resetPassword(actor, barber.id, audit);

    expect(audit).toHaveBeenCalledWith("staff.password_reset", {
      actorId: owner.id,
      targetId: barber.id,
      shopId: shop.id,
    });
    expect(JSON.stringify(audit.mock.calls)).not.toContain(temporaryPassword);
  });
});

describe("desativação e troca de papel", () => {
  it("desativar encerra as sessões e derruba o access token na hora", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER", password: "senha-forte-123" });
    const { accessToken } = (await login(shop.slug, barber.email, "senha-forte-123")).json();

    const res = await call("PATCH", `/staff/${barber.id}`, { active: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    expect(await activeSessions(barber.id)).toBe(0);

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("novo papel vale na hora, mesmo com token emitido com o papel antigo", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const asBarber = await adminAs(app, container, barber); // token diz BARBER
    expect((await asBarber("GET", `/staff/${barber.id}/schedule`)).statusCode).toBe(200);

    expect((await call("PATCH", `/staff/${barber.id}`, { role: "FINANCE" })).statusCode).toBe(200);
    // FINANCE não acessa escala — vale o banco, não o token.
    expect((await asBarber("GET", `/staff/${barber.id}/schedule`)).statusCode).toBe(403);
  });

  it("registra staff.role_changed e staff.deactivated", async () => {
    const { shop, owner } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const audit = vi.fn();
    const actor = {
      staffId: owner.id,
      shopId: shop.id,
      role: "OWNER" as const,
      mustChangePassword: false,
    };
    await container.staff.update(actor, barber.id, { role: "FINANCE", active: false }, audit);
    const ids = { actorId: owner.id, targetId: barber.id, shopId: shop.id };
    expect(audit).toHaveBeenCalledWith("staff.role_changed", ids);
    expect(audit).toHaveBeenCalledWith("staff.deactivated", ids);
  });

  it("ninguém muda o próprio papel ou se desativa", async () => {
    const { owner, call } = await shopWithOwner();
    for (const patch of [{ role: "MANAGER" }, { active: false }]) {
      const res = await call("PATCH", `/staff/${owner.id}`, patch);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("SELF_CHANGE_FORBIDDEN");
    }
  });
});

describe("último OWNER", () => {
  it("dois OWNERs se rebaixando ao mesmo tempo: a loja nunca fica sem dono", async () => {
    const { shop, owner: a } = await shopWithOwner();
    const b = await createStaff(shop.id, { role: "OWNER" });
    const asA = await adminAs(app, container, a);
    const asB = await adminAs(app, container, b);

    const results = await Promise.all([
      asA("PATCH", `/staff/${b.id}`, { role: "MANAGER" }),
      asB("PATCH", `/staff/${a.id}`, { role: "MANAGER" }),
    ]);
    const codes = results.map((r) => r.statusCode).sort();
    // Um vence. O outro perde por LAST_OWNER (corrida dentro do lock) ou por já não ser
    // OWNER quando o guard o releu (corrida perdida antes do lock).
    expect(codes[0]).toBe(200);
    expect([403, 422]).toContain(codes[1]);

    const owners = await testDb().staff.count({
      where: { shopId: shop.id, role: "OWNER", active: true },
    });
    expect(owners).toBe(1);
  });
});

describe("vínculos staff × serviço", () => {
  it("serviço de outra loja ⇒ 404 e nada é gravado", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const foreign = await createService((await createShop()).id);
    const res = await call("PUT", `/staff/${barber.id}/services`, {
      services: [{ serviceId: foreign.id }],
    });
    expect(res.statusCode).toBe(404);
    expect(await testDb().staffService.count({ where: { staffId: barber.id } })).toBe(0);
  });

  it("override de duração precisa ser múltiplo do passo de slot", async () => {
    const { shop, call } = await shopWithOwner(); // slotStepMin padrão = 15
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const service = await createService(shop.id);

    const bad = await call("PUT", `/staff/${barber.id}/services`, {
      services: [{ serviceId: service.id, durationMin: 40 }],
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({
      code: "DURATION_NOT_MULTIPLE",
      conflicts: [{ serviceId: service.id, durationMin: 40 }],
    });

    const ok = await call("PUT", `/staff/${barber.id}/services`, {
      services: [{ serviceId: service.id, durationMin: 45, priceCents: 6000 }],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().services).toEqual([
      { serviceId: service.id, durationMin: 45, priceCents: 6000 },
    ]);
  });
});

describe("respostas por papel e paginação", () => {
  it("BARBER vê só id, nome, papel e ativo dos colegas", async () => {
    const { shop, owner } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const call = await adminAs(app, container, barber);

    const list = (await call("GET", "/staff")).json();
    for (const item of list.items) {
      expect(Object.keys(item).sort()).toEqual(["active", "id", "name", "role"]);
    }
    const colleague = (await call("GET", `/staff/${owner.id}`)).json();
    expect(Object.keys(colleague).sort()).toEqual(["active", "id", "name", "role"]);
    const self = (await call("GET", `/staff/${barber.id}`)).json();
    expect(self.email).toBe(barber.email);
  });

  it("limit ≤ 100, próxima página e ordenação estável", async () => {
    const { shop, call } = await shopWithOwner();
    for (let i = 0; i < 3; i++) await createStaff(shop.id, { name: "Mesmo Nome" });

    expect((await call("GET", "/staff?limit=101")).statusCode).toBe(400);
    const p1 = (await call("GET", "/staff?limit=2")).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextOffset).toBe(2);
    const p2 = (await call("GET", "/staff?limit=2&offset=2")).json();
    expect(p2.items).toHaveLength(2);
    expect(p2.nextOffset).toBeNull();

    const ids = [...p1.items, ...p2.items].map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(4); // empate de nome desempatado por id: sem repetir
  });
});
