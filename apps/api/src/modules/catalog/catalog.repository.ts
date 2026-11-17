import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db, DbTx } from "../../infra/db.js";
import { pageArgs, type PageQuery } from "../../infra/http/pagination.js";

const SERVICE_SELECT = {
  id: true,
  name: true,
  priceCents: true,
  durationMin: true,
  bufferMin: true,
  active: true,
  sortOrder: true,
} as const satisfies Prisma.ServiceSelect;

export type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof SERVICE_SELECT }>;
export type ServiceData = Omit<ServiceRow, "id">;

/** Todo método recebe `shopId`: serviço de outra loja simplesmente não existe aqui. */
export function createCatalogRepository(db: Db) {
  return {
    list(shopId: string, page: PageQuery, filter: { active?: boolean }) {
      return db.service.findMany({
        where: { shopId, ...(filter.active !== undefined && { active: filter.active }) },
        select: SERVICE_SELECT,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        ...pageArgs(page),
      });
    },

    find(shopId: string, id: string, tx: Db | DbTx = db) {
      return tx.service.findFirst({ where: { id, shopId }, select: SERVICE_SELECT });
    },

    create(shopId: string, data: ServiceData, tx: DbTx) {
      return tx.service.create({ data: { ...data, shopId }, select: SERVICE_SELECT });
    },

    async update(shopId: string, id: string, data: Partial<ServiceData>, tx: DbTx) {
      await tx.service.updateMany({ where: { id, shopId }, data });
    },

    async slotStepMin(shopId: string, tx: DbTx): Promise<number> {
      const shop = await tx.shop.findUniqueOrThrow({
        where: { id: shopId },
        select: { slotStepMin: true },
      });
      return shop.slotStepMin;
    },

    transaction<T>(fn: (tx: DbTx) => Promise<T>) {
      return db.$transaction(fn);
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
