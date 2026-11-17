import { lockShop } from "../../infra/db.js";
import { fitsWithin } from "../../infra/http/fields.js";
import { AppError, type ErrorConflict } from "../../infra/http/errors.js";
import type { StaffClaims } from "../auth/auth.tokens.js";
import { canManageShop } from "../staff/staff.permissions.js";
import type {
  BusinessHourRow,
  SchedulingRepository,
  ShopSettings,
} from "./scheduling.repository.js";

/**
 * Dados e horário da loja. Mudanças que invalidariam dados existentes respondem 422
 * listando os conflitos — nada é ajustado em silêncio.
 */
export function createShopSettingsService(deps: { repo: SchedulingRepository }) {
  const { repo } = deps;

  function assertCanManage(actor: StaffClaims) {
    if (!canManageShop(actor)) throw new AppError("FORBIDDEN", "Acesso negado.");
  }

  return {
    get(actor: StaffClaims) {
      return repo.shop(actor.shopId);
    },

    async update(actor: StaffClaims, patch: Partial<ShopSettings>) {
      assertCanManage(actor);
      return repo.transaction(async (tx) => {
        await lockShop(tx, actor.shopId);
        const current = await repo.shop(actor.shopId, tx);

        const step = patch.slotStepMin;
        if (step !== undefined && step !== current.slotStepMin) {
          const { services, overrides } = await repo.durations(actor.shopId, tx);
          const conflicts: ErrorConflict[] = [
            ...services
              .filter((s) => s.durationMin % step !== 0)
              .map((s) => ({ serviceId: s.id, staffId: null, durationMin: s.durationMin })),
            ...overrides
              .filter((o) => o.durationMin! % step !== 0)
              .map((o) => ({
                serviceId: o.serviceId,
                staffId: o.staffId,
                durationMin: o.durationMin,
              })),
          ];
          if (conflicts.length > 0) {
            throw new AppError(
              "UNPROCESSABLE",
              `Há durações que não são múltiplas de ${step} min.`,
              {
                code: "SLOT_STEP_CONFLICT",
                conflicts,
              },
            );
          }
        }

        await repo.updateShop(actor.shopId, patch, tx);
        return repo.shop(actor.shopId, tx);
      });
    },

    async getHours(actor: StaffClaims) {
      return { hours: await repo.hours(actor.shopId) };
    },

    /** Substitui a semana inteira. Escala de alguém fora da nova faixa ⇒ 422. */
    async replaceHours(actor: StaffClaims, hours: BusinessHourRow[]) {
      assertCanManage(actor);
      await repo.transaction(async (tx) => {
        // Mesma trava da gravação de escala: as duas checagens nunca se cruzam.
        await lockShop(tx, actor.shopId);
        const ranges = hours.map((h) => ({
          weekday: h.weekday,
          start: h.openMin,
          end: h.closeMin,
        }));
        const outside = (await repo.staffSchedules(actor.shopId, tx)).filter(
          (s) => !fitsWithin({ weekday: s.weekday, start: s.startMin, end: s.endMin }, ranges),
        );
        if (outside.length > 0) {
          throw new AppError("UNPROCESSABLE", "Há escalas fora do novo horário da loja.", {
            code: "HOURS_CONFLICT",
            conflicts: outside.map((s) => ({ ...s })),
          });
        }
        await repo.replaceHours(actor.shopId, hours, tx);
      });
      return { hours: await repo.hours(actor.shopId) };
    },
  };
}

export type ShopSettingsService = ReturnType<typeof createShopSettingsService>;
