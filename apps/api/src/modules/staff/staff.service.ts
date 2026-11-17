import type { StaffRole } from "../../generated/prisma/client.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { generateToken } from "../../infra/crypto.js";
import { AppError } from "../../infra/http/errors.js";
import { toPage, type PageQuery } from "../../infra/http/pagination.js";
import { hashPassword } from "../../infra/password.js";
import { normalizeEmail } from "../auth/auth.service.js";
import type { StaffClaims } from "../auth/auth.tokens.js";
import {
  canAssignRole,
  canEditSelf,
  canManageStaff,
  canSeeFullStaff,
} from "./staff.permissions.js";
import type { StaffRepository, StaffRow } from "./staff.repository.js";

/** Rastro de quem fez o quê — só ids, nunca dado pessoal. */
export type StaffEvent =
  "staff.created" | "staff.password_reset" | "staff.role_changed" | "staff.deactivated";
export type Audit = (
  event: StaffEvent,
  fields: { actorId: string; targetId: string; shopId: string },
) => void;

const FORBIDDEN = "Acesso negado.";
const NOT_FOUND = "Não encontrado.";

/** 16 caracteres base64url (96 bits): forte e ainda digitável no primeiro acesso. */
const newTemporaryPassword = () => generateToken(12);

const basic = (s: StaffRow) => ({ id: s.id, name: s.name, role: s.role, active: s.active });

export function createStaffService(deps: { repo: StaffRepository }) {
  const { repo } = deps;

  async function findOr404(shopId: string, id: string) {
    const staff = await repo.find(shopId, id);
    if (!staff) throw new AppError("NOT_FOUND", NOT_FOUND);
    return staff;
  }

  function assertCanManage(actor: StaffClaims, target: StaffRow) {
    if (!canManageStaff(actor, target)) throw new AppError("FORBIDDEN", FORBIDDEN);
  }

  function assertCanAssign(actor: StaffClaims, role: StaffRole) {
    if (!canAssignRole(actor, role)) throw new AppError("FORBIDDEN", FORBIDDEN);
  }

  return {
    async list(actor: StaffClaims, page: PageQuery, filter: { active?: boolean }) {
      const result = toPage(await repo.list(actor.shopId, page, filter), page);
      if (actor.role !== "BARBER") return result;
      return { ...result, items: result.items.map(basic) };
    },

    async get(actor: StaffClaims, id: string) {
      const staff = await findOr404(actor.shopId, id);
      return canSeeFullStaff(actor, id) ? staff : basic(staff);
    },

    async create(
      actor: StaffClaims,
      input: {
        name: string;
        title: string | null;
        email: string;
        role: StaffRole;
        commissionBps: number;
      },
      audit: Audit,
    ) {
      assertCanAssign(actor, input.role);
      const temporaryPassword = newTemporaryPassword();
      try {
        const staff = await repo.create(actor.shopId, {
          ...input,
          email: normalizeEmail(input.email),
          passwordHash: await hashPassword(temporaryPassword),
        });
        audit("staff.created", {
          actorId: actor.staffId,
          targetId: staff.id,
          shopId: actor.shopId,
        });
        return { staff, temporaryPassword };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new AppError("CONFLICT", "Já existe alguém com este e-mail na equipe.", {
            code: "EMAIL_TAKEN",
          });
        }
        throw err;
      }
    },

    async update(
      actor: StaffClaims,
      id: string,
      patch: Partial<Pick<StaffRow, "name" | "title" | "role" | "commissionBps" | "active">>,
      audit: Audit,
    ) {
      const target = await findOr404(actor.shopId, id);
      const fields = Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);

      if (actor.staffId === id) {
        if (!canEditSelf(actor, fields)) {
          throw new AppError("FORBIDDEN", "Você não pode alterar o próprio papel ou status.", {
            code: "SELF_CHANGE_FORBIDDEN",
          });
        }
      } else {
        assertCanManage(actor, target);
      }

      const roleChanged = patch.role !== undefined && patch.role !== target.role;
      if (roleChanged) assertCanAssign(actor, patch.role!);
      const deactivated = patch.active === false && target.active;
      const losesOwner = target.role === "OWNER" && target.active && (roleChanged || deactivated);

      await repo.transaction(async (tx) => {
        if (losesOwner) {
          const owners = await repo.lockActiveOwners(tx, actor.shopId);
          if (!owners.some((ownerId) => ownerId !== id)) {
            throw new AppError("UNPROCESSABLE", "A loja precisa de pelo menos um dono ativo.", {
              code: "LAST_OWNER",
            });
          }
        }
        await repo.update(actor.shopId, id, patch, tx);
        // Permissão mudou ⇒ nenhuma sessão antiga continua valendo.
        if (roleChanged || deactivated) await repo.endAllSessions(id, tx);
      });

      const ids = { actorId: actor.staffId, targetId: id, shopId: actor.shopId };
      if (roleChanged) audit("staff.role_changed", ids);
      if (deactivated) audit("staff.deactivated", ids);
      return findOr404(actor.shopId, id);
    },

    /** Senha temporária devolvida UMA vez; o staff troca no primeiro acesso. */
    async resetPassword(actor: StaffClaims, id: string, audit: Audit) {
      const target = await findOr404(actor.shopId, id);
      if (actor.staffId === id) {
        throw new AppError("FORBIDDEN", "Use a troca de senha para alterar a sua.", {
          code: "SELF_CHANGE_FORBIDDEN",
        });
      }
      assertCanManage(actor, target);

      const temporaryPassword = newTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await repo.transaction(async (tx) => {
        await repo.setTemporaryPassword(actor.shopId, id, passwordHash, tx);
        await repo.endAllSessions(id, tx);
      });

      audit("staff.password_reset", { actorId: actor.staffId, targetId: id, shopId: actor.shopId });
      return { temporaryPassword };
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
