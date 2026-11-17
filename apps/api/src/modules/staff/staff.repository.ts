import type { Prisma, StaffRole } from "../../generated/prisma/client.ts";
import type { Db, DbTx } from "../../infra/db.js";
import { pageArgs, type PageQuery } from "../../infra/http/pagination.js";

/** Campos de staff que podem sair da API. Nunca passwordHash nem mfaSecretEnc. */
const STAFF_SELECT = {
  id: true,
  name: true,
  title: true,
  email: true,
  role: true,
  commissionBps: true,
  active: true,
  mustChangePassword: true,
} as const satisfies Prisma.StaffSelect;

export type StaffRow = Prisma.StaffGetPayload<{ select: typeof STAFF_SELECT }>;

export interface ScheduleInterval {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface ServiceLink {
  serviceId: string;
  priceCents: number | null;
  durationMin: number | null;
}

/** Todo método recebe `shopId`: não existe consulta de staff sem o filtro da loja. */
export function createStaffRepository(db: Db) {
  return {
    list(shopId: string, page: PageQuery, filter: { active?: boolean }) {
      return db.staff.findMany({
        where: { shopId, ...(filter.active !== undefined && { active: filter.active }) },
        select: STAFF_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...pageArgs(page),
      });
    },

    find(shopId: string, id: string, tx: Db | DbTx = db) {
      return tx.staff.findFirst({ where: { id, shopId }, select: STAFF_SELECT });
    },

    create(
      shopId: string,
      data: {
        name: string;
        title: string | null;
        email: string;
        role: StaffRole;
        commissionBps: number;
        passwordHash: string;
      },
    ) {
      return db.staff.create({
        data: { ...data, shopId, mustChangePassword: true },
        select: STAFF_SELECT,
      });
    },

    async update(
      shopId: string,
      id: string,
      data: Partial<Pick<StaffRow, "name" | "title" | "role" | "commissionBps" | "active">>,
      tx: Db | DbTx = db,
    ) {
      // updateMany: o filtro por shopId vale também na escrita.
      await tx.staff.updateMany({ where: { id, shopId }, data });
    },

    async setTemporaryPassword(shopId: string, id: string, passwordHash: string, tx: DbTx) {
      await tx.staff.updateMany({
        where: { id, shopId },
        data: { passwordHash, mustChangePassword: true },
      });
    },

    /**
     * Trava as linhas dos OWNERs ativos da loja até o fim da transação e devolve os ids.
     * Dois OWNERs se rebaixando ao mesmo tempo serializam aqui — a loja nunca fica sem dono.
     */
    async lockActiveOwners(tx: DbTx, shopId: string): Promise<string[]> {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM staff
        WHERE shopId = ${shopId} AND role = 'OWNER' AND active = TRUE
        FOR UPDATE`;
      return rows.map((r) => r.id);
    },

    async endAllSessions(staffId: string, tx: DbTx) {
      await tx.staffSession.deleteMany({ where: { staffId } });
    },

    // --- Escala ---------------------------------------------------------------

    schedule(staffId: string): Promise<ScheduleInterval[]> {
      return db.staffSchedule.findMany({
        where: { staffId },
        select: { weekday: true, startMin: true, endMin: true },
        orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
      });
    },

    async replaceSchedule(staffId: string, intervals: ScheduleInterval[], tx: DbTx) {
      await tx.staffSchedule.deleteMany({ where: { staffId } });
      if (intervals.length > 0) {
        await tx.staffSchedule.createMany({ data: intervals.map((i) => ({ ...i, staffId })) });
      }
    },

    businessHours(shopId: string, tx: DbTx) {
      return tx.businessHour.findMany({
        where: { shopId },
        select: { weekday: true, openMin: true, closeMin: true },
      });
    },

    // --- Vínculos staff × serviço --------------------------------------------

    serviceLinks(staffId: string): Promise<ServiceLink[]> {
      return db.staffService.findMany({
        where: { staffId },
        select: { serviceId: true, priceCents: true, durationMin: true },
        orderBy: { serviceId: "asc" },
      });
    },

    async replaceServiceLinks(staffId: string, links: ServiceLink[], tx: DbTx) {
      await tx.staffService.deleteMany({ where: { staffId } });
      if (links.length > 0) {
        await tx.staffService.createMany({ data: links.map((l) => ({ ...l, staffId })) });
      }
    },

    /** Ids (dentre os pedidos) que são serviços DESTA loja. */
    async serviceIdsInShop(shopId: string, ids: string[], tx: DbTx): Promise<Set<string>> {
      const rows = await tx.service.findMany({
        where: { shopId, id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
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

export type StaffRepository = ReturnType<typeof createStaffRepository>;
