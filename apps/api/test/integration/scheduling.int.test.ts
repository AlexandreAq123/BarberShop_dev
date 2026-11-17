import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Container } from "../../src/app/container.js";
import type { App } from "../../src/infra/http/app.js";
import { adminAs, daysFromNow } from "./admin.js";
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
  const shop = await createShop(); // slotStepMin padrão = 15
  const owner = await createStaff(shop.id, { role: "OWNER" });
  return { shop, owner, call: await adminAs(app, container, owner) };
}

/** Seg–sex 09:00–18:00. */
const WEEKDAYS_9_TO_18 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  openMin: 540,
  closeMin: 1080,
}));

describe("catálogo: duração múltipla do passo de slot", () => {
  it("cria com 30 min, recusa 25 min com 422", async () => {
    const { call } = await shopWithOwner();
    const base = { name: "Corte", priceCents: 5000 };
    expect((await call("POST", "/services", { ...base, durationMin: 30 })).statusCode).toBe(201);
    const bad = await call("POST", "/services", { ...base, durationMin: 25 });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe("DURATION_NOT_MULTIPLE");
  });

  it("preço negativo ⇒ 400", async () => {
    const { call } = await shopWithOwner();
    const res = await call("POST", "/services", { name: "X", priceCents: -1, durationMin: 30 });
    expect(res.statusCode).toBe(400);
  });

  it("desativar não apaga", async () => {
    const { shop, call } = await shopWithOwner();
    const service = await createService(shop.id);
    const res = await call("PATCH", `/services/${service.id}`, { active: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    expect(await testDb().service.count({ where: { id: service.id } })).toBe(1);
  });
});

describe("passo de slot da loja", () => {
  it("mudar para um passo incompatível ⇒ 422 listando serviços e overrides", async () => {
    const { shop, call } = await shopWithOwner();
    const ok = await createService(shop.id, { durationMin: 60 });
    const bad = await createService(shop.id, { durationMin: 45 });
    const barber = await createStaff(shop.id, { role: "BARBER" });
    await testDb().staffService.create({
      data: { staffId: barber.id, serviceId: ok.id, durationMin: 15 },
    });

    const res = await call("PATCH", "/shop", { slotStepMin: 30 });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe("SLOT_STEP_CONFLICT");
    expect(body.conflicts).toEqual(
      expect.arrayContaining([
        { serviceId: bad.id, staffId: null, durationMin: 45 },
        { serviceId: ok.id, staffId: barber.id, durationMin: 15 },
      ]),
    );
    expect(body.conflicts).toHaveLength(2);
    const after = await testDb().shop.findUniqueOrThrow({ where: { id: shop.id } });
    expect(after.slotStepMin).toBe(15);
  });

  it("passo compatível é aceito", async () => {
    const { shop, call } = await shopWithOwner();
    await createService(shop.id, { durationMin: 60 });
    const res = await call("PATCH", "/shop", { slotStepMin: 30 });
    expect(res.statusCode).toBe(200);
    expect(res.json().slotStepMin).toBe(30);
  });

  it.each([7, 0, 90])("passo %i fora da lista ⇒ 400", async (step) => {
    const { call } = await shopWithOwner();
    expect((await call("PATCH", "/shop", { slotStepMin: step })).statusCode).toBe(400);
  });

  it("fuso horário inválido ⇒ 400", async () => {
    const { call } = await shopWithOwner();
    expect((await call("PATCH", "/shop", { timezone: "America/Atlantida" })).statusCode).toBe(400);
  });
});

describe("horário da loja × escala", () => {
  it("escala precisa caber no horário da loja", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    expect((await call("PUT", "/shop/hours", { hours: WEEKDAYS_9_TO_18 })).statusCode).toBe(200);

    const outside = await call("PUT", `/staff/${barber.id}/schedule`, {
      intervals: [
        { weekday: 1, startMin: 480, endMin: 720 }, // começa 08:00, antes de abrir
        { weekday: 0, startMin: 600, endMin: 720 }, // domingo fechado
      ],
    });
    expect(outside.statusCode).toBe(422);
    expect(outside.json().code).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(outside.json().conflicts).toHaveLength(2);

    const inside = await call("PUT", `/staff/${barber.id}/schedule`, {
      intervals: [
        { weekday: 1, startMin: 540, endMin: 720 },
        { weekday: 1, startMin: 780, endMin: 1080 }, // almoço 12–13h
      ],
    });
    expect(inside.statusCode).toBe(200);
    expect(inside.json().intervals).toHaveLength(2);
  });

  it("reduzir o horário com escala fora da nova faixa ⇒ 422 com os conflitos, nada muda", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    await call("PUT", "/shop/hours", { hours: WEEKDAYS_9_TO_18 });
    await call("PUT", `/staff/${barber.id}/schedule`, {
      intervals: [{ weekday: 2, startMin: 900, endMin: 1080 }], // ter 15–18h
    });

    const shorter = WEEKDAYS_9_TO_18.map((h) => ({ ...h, closeMin: 960 })); // fecha 16h
    const res = await call("PUT", "/shop/hours", { hours: shorter });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      code: "HOURS_CONFLICT",
      conflicts: [{ staffId: barber.id, weekday: 2, startMin: 900, endMin: 1080 }],
    });
    const hours = (await call("GET", "/shop/hours")).json().hours;
    expect(hours.every((h: { closeMin: number }) => h.closeMin === 1080)).toBe(true);
  });

  it.each([
    [
      "sobreposição no mesmo dia",
      [
        { weekday: 1, openMin: 540, closeMin: 800 },
        { weekday: 1, openMin: 780, closeMin: 1080 },
      ],
    ],
    ["abre depois de fechar", [{ weekday: 1, openMin: 1080, closeMin: 540 }]],
    ["weekday 7", [{ weekday: 7, openMin: 540, closeMin: 1080 }]],
  ])("%s ⇒ 400", async (_name, hours) => {
    const { call } = await shopWithOwner();
    expect((await call("PUT", "/shop/hours", { hours })).statusCode).toBe(400);
  });
});

describe("bloqueios", () => {
  it.each([
    ["sem fuso", { startsAt: "2026-12-01T10:00:00", endsAt: "2026-12-01T11:00:00" }],
    ["início depois do fim", { startsAt: daysFromNow(2, 15), endsAt: daysFromNow(2, 14) }],
    ["mais de 31 dias", { startsAt: daysFromNow(1), endsAt: daysFromNow(40) }],
  ])("%s ⇒ 400", async (_name, range) => {
    const { owner, call } = await shopWithOwner();
    expect((await call("POST", "/blocks", { staffId: owner.id, ...range })).statusCode).toBe(400);
  });

  it("aceita ISO com offset e guarda em UTC", async () => {
    const { owner, call } = await shopWithOwner();
    const res = await call("POST", "/blocks", {
      staffId: owner.id,
      startsAt: "2030-01-10T12:00:00-03:00",
      endsAt: "2030-01-10T13:00:00-03:00",
      reason: "Almoço",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().startsAt).toBe("2030-01-10T15:00:00.000Z");
  });

  it("BARBER lista os próprios e os da loja, nunca os de colegas", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const colleague = await createStaff(shop.id, { role: "BARBER" });
    const range = { startsAt: daysFromNow(2, 13), endsAt: daysFromNow(2, 14) };
    await call("POST", "/blocks", { staffId: barber.id, ...range });
    await call("POST", "/blocks", { staffId: colleague.id, ...range });
    await call("POST", "/blocks", { staffId: null, ...range });

    const asBarber = await adminAs(app, container, barber);
    const from = encodeURIComponent(daysFromNow(0));
    const to = encodeURIComponent(daysFromNow(7));
    const res = await asBarber("GET", `/blocks?from=${from}&to=${to}`);
    expect(res.statusCode).toBe(200);
    const staffIds = res.json().items.map((b: { staffId: string | null }) => b.staffId);
    expect(staffIds.sort()).toEqual([barber.id, null].sort());
  });

  it("BARBER remove o próprio bloqueio, não o de um colega", async () => {
    const { shop, call } = await shopWithOwner();
    const barber = await createStaff(shop.id, { role: "BARBER" });
    const colleague = await createStaff(shop.id, { role: "BARBER" });
    const range = { startsAt: daysFromNow(2, 13), endsAt: daysFromNow(2, 14) };
    const own = (await call("POST", "/blocks", { staffId: barber.id, ...range })).json();
    const theirs = (await call("POST", "/blocks", { staffId: colleague.id, ...range })).json();

    const asBarber = await adminAs(app, container, barber);
    expect((await asBarber("DELETE", `/blocks/${theirs.id}`)).statusCode).toBe(403);
    expect((await asBarber("DELETE", `/blocks/${own.id}`)).statusCode).toBe(204);
  });

  it("bloqueio de outra loja ⇒ 404", async () => {
    const { call } = await shopWithOwner();
    const other = await shopWithOwner();
    const block = (
      await other.call("POST", "/blocks", {
        staffId: other.owner.id,
        startsAt: daysFromNow(2, 13),
        endsAt: daysFromNow(2, 14),
      })
    ).json();
    expect((await call("DELETE", `/blocks/${block.id}`)).statusCode).toBe(404);
  });
});
