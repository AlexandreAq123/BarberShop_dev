import { lockShop } from "../../infra/db.js";
import { AppError } from "../../infra/http/errors.js";
import { toPage, type PageQuery } from "../../infra/http/pagination.js";
import type { StaffClaims } from "../auth/auth.tokens.js";
import { canManageShop } from "../staff/staff.permissions.js";
import type { CatalogRepository, ServiceData } from "./catalog.repository.js";

/** Catálogo de serviços. Nada é apagado: serviço sai de cena com `active=false`. */
export function createCatalogService(deps: { repo: CatalogRepository }) {
  const { repo } = deps;

  function assertCanManage(actor: StaffClaims) {
    if (!canManageShop(actor)) throw new AppError("FORBIDDEN", "Acesso negado.");
  }

  function assertMultiple(durationMin: number, step: number) {
    if (durationMin % step !== 0) {
      throw new AppError("UNPROCESSABLE", `A duração precisa ser múltipla de ${step} min.`, {
        code: "DURATION_NOT_MULTIPLE",
        conflicts: [{ durationMin, slotStepMin: step }],
      });
    }
  }

  return {
    async list(actor: StaffClaims, page: PageQuery, filter: { active?: boolean }) {
      return toPage(await repo.list(actor.shopId, page, filter), page);
    },

    async get(actor: StaffClaims, id: string) {
      const service = await repo.find(actor.shopId, id);
      if (!service) throw new AppError("NOT_FOUND", "Não encontrado.");
      return service;
    },

    async create(actor: StaffClaims, data: ServiceData) {
      assertCanManage(actor);
      return repo.transaction(async (tx) => {
        // Trava a loja: o passo de slot não muda entre a checagem e o insert.
        await lockShop(tx, actor.shopId);
        assertMultiple(data.durationMin, await repo.slotStepMin(actor.shopId, tx));
        return repo.create(actor.shopId, data, tx);
      });
    },

    async update(actor: StaffClaims, id: string, patch: Partial<ServiceData>) {
      // Ordem fixa em todo o admin: outra loja ⇒ 404 antes de qualquer checagem de papel.
      if (!(await repo.find(actor.shopId, id))) throw new AppError("NOT_FOUND", "Não encontrado.");
      assertCanManage(actor);
      return repo.transaction(async (tx) => {
        await lockShop(tx, actor.shopId);
        const current = await repo.find(actor.shopId, id, tx);
        if (!current) throw new AppError("NOT_FOUND", "Não encontrado.");
        // Vale também ao reativar um serviço antigo com duração fora do passo atual.
        const step = await repo.slotStepMin(actor.shopId, tx);
        assertMultiple(patch.durationMin ?? current.durationMin, step);
        await repo.update(actor.shopId, id, patch, tx);
        return { ...current, ...patch };
      });
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
