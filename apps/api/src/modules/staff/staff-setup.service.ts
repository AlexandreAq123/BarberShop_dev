import { lockShop } from "../../infra/db.js";
import { fitsWithin } from "../../infra/http/fields.js";
import { AppError } from "../../infra/http/errors.js";
import type { StaffClaims } from "../auth/auth.tokens.js";
import { canAccessStaffAgenda, canManageStaff } from "./staff.permissions.js";
import type { ScheduleInterval, ServiceLink, StaffRepository } from "./staff.repository.js";

/**
 * Configuração de UM staff: escala semanal e serviços que ele atende.
 * `staff_schedules` e `staff_services` não têm `shopId`: o staff (e cada serviço) é
 * confirmado como da loja do ator ANTES de qualquer escrita.
 */
export function createStaffSetupService(deps: { repo: StaffRepository }) {
  const { repo } = deps;

  async function staffInShop(actor: StaffClaims, staffId: string) {
    const staff = await repo.find(actor.shopId, staffId);
    if (!staff) throw new AppError("NOT_FOUND", "Não encontrado.");
    return staff;
  }

  function assertAgenda(actor: StaffClaims, staffId: string) {
    if (!canAccessStaffAgenda(actor, staffId)) throw new AppError("FORBIDDEN", "Acesso negado.");
  }

  return {
    async getSchedule(actor: StaffClaims, staffId: string) {
      await staffInShop(actor, staffId);
      assertAgenda(actor, staffId);
      return { intervals: await repo.schedule(staffId) };
    },

    /** Substitui a escala inteira. Cada faixa precisa caber no horário da loja. */
    async replaceSchedule(actor: StaffClaims, staffId: string, intervals: ScheduleInterval[]) {
      await staffInShop(actor, staffId);
      assertAgenda(actor, staffId);

      await repo.transaction(async (tx) => {
        // Trava a loja: o horário de funcionamento não muda no meio desta checagem.
        await lockShop(tx, actor.shopId);
        const hours = (await repo.businessHours(actor.shopId, tx)).map((h) => ({
          weekday: h.weekday,
          start: h.openMin,
          end: h.closeMin,
        }));
        const outside = intervals.filter(
          (i) => !fitsWithin({ weekday: i.weekday, start: i.startMin, end: i.endMin }, hours),
        );
        if (outside.length > 0) {
          throw new AppError("UNPROCESSABLE", "Escala fora do horário de funcionamento da loja.", {
            code: "OUTSIDE_BUSINESS_HOURS",
            conflicts: outside.map((i) => ({ ...i })),
          });
        }
        await repo.replaceSchedule(staffId, intervals, tx);
      });
      return { intervals: await repo.schedule(staffId) };
    },

    async getServices(actor: StaffClaims, staffId: string) {
      await staffInShop(actor, staffId);
      return { services: await repo.serviceLinks(staffId) };
    },

    /** Substitui os vínculos. OWNER pode configurar os próprios; os demais, hierarquia. */
    async replaceServices(actor: StaffClaims, staffId: string, links: ServiceLink[]) {
      const target = await staffInShop(actor, staffId);
      const allowed =
        actor.staffId === staffId ? actor.role === "OWNER" : canManageStaff(actor, target);
      if (!allowed) throw new AppError("FORBIDDEN", "Acesso negado.");

      await repo.transaction(async (tx) => {
        await lockShop(tx, actor.shopId); // o passo de slot não muda no meio da checagem
        const ids = links.map((l) => l.serviceId);
        const inShop = await repo.serviceIdsInShop(actor.shopId, ids, tx);
        // Serviço de outra loja (ou inexistente) é tratado igual: 404, sem distinguir.
        if (ids.some((id) => !inShop.has(id))) throw new AppError("NOT_FOUND", "Não encontrado.");

        const step = await repo.slotStepMin(actor.shopId, tx);
        const bad = links.filter((l) => l.durationMin !== null && l.durationMin % step !== 0);
        if (bad.length > 0) {
          throw new AppError("UNPROCESSABLE", `A duração precisa ser múltipla de ${step} min.`, {
            code: "DURATION_NOT_MULTIPLE",
            conflicts: bad.map((l) => ({ serviceId: l.serviceId, durationMin: l.durationMin })),
          });
        }
        await repo.replaceServiceLinks(staffId, links, tx);
      });
      return { services: await repo.serviceLinks(staffId) };
    },
  };
}

export type StaffSetupService = ReturnType<typeof createStaffSetupService>;
