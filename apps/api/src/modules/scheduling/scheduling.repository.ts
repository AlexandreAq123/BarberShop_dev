import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db, DbTx } from "../../infra/db.js";
import { pageArgs, type PageQuery } from "../../infra/http/pagination.js";

const SHOP_SELECT = {
  id: true,
  slug: true,
  name: true,
  timezone: true,
  slotStepMin: true,
  bookingWindowDays: true,
  cancelNoticeMin: true,
  reminderLeadMin: true,
} as const satisfies Prisma.ShopSelect;

export type ShopRow = Prisma.ShopGetPayload<{ select: typeof SHOP_SELECT }>;
export type ShopSettings = Omit<ShopRow, "id" | "slug">;

export interface BusinessHourRow {
  weekday: number;
  openMin: number;
  closeMin: number;
}

const BLOCK_SELECT = {
  id: true,
  staffId: true,
  startsAt: true,
  endsAt: true,
  reason: true,
} as const satisfies Prisma.ScheduleBlockSelect;

export type BlockRow = Prisma.ScheduleBlockGetPayload<{ select: typeof BLOCK_SELECT }>;

/** Todo método recebe `shopId`. */
export function createSchedulingRepository(db: Db) {
  return {
    // --- Loja -----------------------------------------------------------------

    shop(shopId: string, tx: Db | DbTx = db) {
      return tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: SHOP_SELECT });
    },

    async updateShop(shopId: string, data: Partial<ShopSettings>, tx: DbTx) {
      await tx.shop.update({ where: { id: shopId }, data, select: { id: true } });
    },

    /** Serviços e overrides da loja — para conferir contra um novo passo de slot. */
    async durations(shopId: string, tx: DbTx) {
      // Sequencial: dentro da transação é uma conexão só.
      const services = await tx.service.findMany({
        where: { shopId },
        select: { id: true, durationMin: true },
      });
      const overrides = await tx.staffService.findMany({
        where: { staff: { shopId }, durationMin: { not: null } },
        select: { staffId: true, serviceId: true, durationMin: true },
      });
      return { services, overrides };
    },

    // --- Horário de funcionamento --------------------------------------------

    hours(shopId: string): Promise<BusinessHourRow[]> {
      return db.businessHour.findMany({
        where: { shopId },
        select: { weekday: true, openMin: true, closeMin: true },
        orderBy: [{ weekday: "asc" }, { openMin: "asc" }],
      });
    },

    async replaceHours(shopId: string, rows: BusinessHourRow[], tx: DbTx) {
      await tx.businessHour.deleteMany({ where: { shopId } });
      if (rows.length > 0) {
        await tx.businessHour.createMany({ data: rows.map((r) => ({ ...r, shopId })) });
      }
    },

    /** Escalas de TODA a equipe da loja (ativos e inativos: quem volta, volta com a escala). */
    staffSchedules(shopId: string, tx: DbTx) {
      return tx.staffSchedule.findMany({
        where: { staff: { shopId } },
        select: { staffId: true, weekday: true, startMin: true, endMin: true },
      });
    },

    // --- Bloqueios ------------------------------------------------------------

    /**
     * Bloqueios que tocam [from, to). Com `staffId`: os dele + os da loja inteira
     * (que também o afetam). Sem: todos.
     */
    listBlocks(shopId: string, range: { from: Date; to: Date; staffId?: string }, page: PageQuery) {
      return db.scheduleBlock.findMany({
        where: {
          shopId,
          startsAt: { lt: range.to },
          endsAt: { gt: range.from },
          ...(range.staffId && { OR: [{ staffId: range.staffId }, { staffId: null }] }),
        },
        select: BLOCK_SELECT,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        ...pageArgs(page),
      });
    },

    findBlock(shopId: string, id: string) {
      return db.scheduleBlock.findFirst({ where: { id, shopId }, select: BLOCK_SELECT });
    },

    createBlock(
      shopId: string,
      data: { staffId: string | null; startsAt: Date; endsAt: Date; reason: string | null },
    ) {
      return db.scheduleBlock.create({ data: { ...data, shopId }, select: BLOCK_SELECT });
    },

    async deleteBlock(shopId: string, id: string) {
      await db.scheduleBlock.deleteMany({ where: { id, shopId } });
    },

    staffExists(shopId: string, staffId: string) {
      return db.staff.count({ where: { id: staffId, shopId } }).then((n) => n > 0);
    },

    transaction<T>(fn: (tx: DbTx) => Promise<T>) {
      return db.$transaction(fn);
    },
  };
}

export type SchedulingRepository = ReturnType<typeof createSchedulingRepository>;
