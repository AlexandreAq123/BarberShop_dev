import { describe, expect, it } from "vitest";
import type { DbTx } from "../../src/infra/db.js";
import { testDb } from "./db.js";
import { createService, createShop, createStaff } from "./factories.js";

describe("integração com MySQL", () => {
  it("grava e lê uma Shop", async () => {
    const created = await createShop({ name: "Barbearia do Teste" });
    const read = await testDb().shop.findUnique({ where: { slug: created.slug } });
    expect(read).toMatchObject({ id: created.id, name: "Barbearia do Teste", active: true });
  });

  it("fábricas criam staff e serviço ligados à loja", async () => {
    const shop = await createShop();
    const staff = await createStaff(shop.id, { role: "OWNER" });
    const service = await createService(shop.id, { durationMin: 45 });
    expect(staff).toMatchObject({ shopId: shop.id, role: "OWNER", active: true });
    expect(service).toMatchObject({ shopId: shop.id, durationMin: 45 });
  });

  it("DbTx: erro dentro da transação desfaz tudo", async () => {
    const insertShop = (tx: DbTx, slug: string) =>
      tx.shop.create({ data: { slug, name: "Rollback", policyVersion: "2026-01" } });

    await expect(
      testDb().$transaction(async (tx) => {
        await insertShop(tx, "rollback-1");
        throw new Error("falha simulada");
      }),
    ).rejects.toThrow("falha simulada");

    expect(await testDb().shop.findUnique({ where: { slug: "rollback-1" } })).toBeNull();
  });
});
