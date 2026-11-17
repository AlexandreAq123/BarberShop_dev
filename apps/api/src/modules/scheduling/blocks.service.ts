import { AppError } from "../../infra/http/errors.js";
import { toPage, type PageQuery } from "../../infra/http/pagination.js";
import type { StaffClaims } from "../auth/auth.tokens.js";
import { canAccessStaffAgenda, canManageShop, canReadBlocks } from "../staff/staff.permissions.js";
import type { BlockRow, SchedulingRepository } from "./scheduling.repository.js";

const FORBIDDEN = "Acesso negado.";
const NOT_FOUND = "Não encontrado.";

/**
 * Bloqueios de agenda (pausas, folgas). `staffId` nulo = loja inteira (feriado, reforma).
 * BARBER mexe só nos próprios; FINANCE não lê nem escreve.
 */
export function createBlocksService(deps: { repo: SchedulingRepository }) {
  const { repo } = deps;

  /** Pode criar/remover um bloqueio deste staff (ou da loja, se nulo)? */
  async function assertCanWrite(actor: StaffClaims, staffId: string | null) {
    if (staffId === null) {
      if (!canManageShop(actor)) throw new AppError("FORBIDDEN", FORBIDDEN);
      return;
    }
    // Staff de outra loja ⇒ 404 antes de olhar papel.
    if (!(await repo.staffExists(actor.shopId, staffId))) {
      throw new AppError("NOT_FOUND", NOT_FOUND);
    }
    if (!canAccessStaffAgenda(actor, staffId)) throw new AppError("FORBIDDEN", FORBIDDEN);
  }

  return {
    async list(
      actor: StaffClaims,
      query: { from: Date; to: Date; staffId?: string },
      page: PageQuery,
    ) {
      if (!canReadBlocks(actor)) throw new AppError("FORBIDDEN", FORBIDDEN);
      // BARBER: sempre os próprios (+ os da loja), mesmo sem filtro.
      if (actor.role === "BARBER" && query.staffId && query.staffId !== actor.staffId) {
        throw new AppError("FORBIDDEN", FORBIDDEN);
      }
      const staffId = actor.role === "BARBER" ? actor.staffId : query.staffId;
      return toPage(await repo.listBlocks(actor.shopId, { ...query, staffId }, page), page);
    },

    async create(
      actor: StaffClaims,
      input: { staffId: string | null; startsAt: Date; endsAt: Date; reason: string | null },
    ): Promise<BlockRow> {
      await assertCanWrite(actor, input.staffId);
      return repo.createBlock(actor.shopId, input);
    },

    async remove(actor: StaffClaims, id: string): Promise<void> {
      const block = await repo.findBlock(actor.shopId, id);
      if (!block) throw new AppError("NOT_FOUND", NOT_FOUND);
      await assertCanWrite(actor, block.staffId);
      await repo.deleteBlock(actor.shopId, id);
    },
  };
}

export type BlocksService = ReturnType<typeof createBlocksService>;
