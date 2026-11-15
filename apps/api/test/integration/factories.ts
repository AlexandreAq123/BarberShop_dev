import { randomBytes } from "node:crypto";
import type { Prisma } from "../../src/generated/prisma/client.ts";
import { testDb } from "./db.js";

/**
 * Fábricas com o MÍNIMO de dados válidos. Cada teste sobrescreve só o que importa.
 * Nenhum dado real: nomes e e-mails são sintéticos e únicos por chamada.
 */

const uniq = () => randomBytes(4).toString("hex");

/** Hash fictício: suficiente para gravar. Testes de login (2.1) geram um argon2 real. */
const FAKE_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$ZmFrZQ$ZmFrZQ";

export function createShop(data: Partial<Prisma.ShopUncheckedCreateInput> = {}) {
  const id = uniq();
  return testDb().shop.create({
    data: { slug: `loja-${id}`, name: `Loja ${id}`, policyVersion: "2026-01", ...data },
  });
}

export function createStaff(
  shopId: string,
  data: Partial<Omit<Prisma.StaffUncheckedCreateInput, "shopId">> = {},
) {
  const id = uniq();
  return testDb().staff.create({
    data: {
      shopId,
      name: `Barbeiro ${id}`,
      email: `staff-${id}@teste.local`,
      passwordHash: FAKE_PASSWORD_HASH,
      ...data,
    },
  });
}

export function createService(
  shopId: string,
  data: Partial<Omit<Prisma.ServiceUncheckedCreateInput, "shopId">> = {},
) {
  return testDb().service.create({
    data: { shopId, name: `Corte ${uniq()}`, priceCents: 5000, durationMin: 30, ...data },
  });
}
