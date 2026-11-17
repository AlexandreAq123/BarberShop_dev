import type { StaffRole } from "../../generated/prisma/client.ts";

/**
 * Regras de permissão da equipe — funções PURAS, chamadas pelos services (nunca só pela rota).
 *
 * Hierarquia estrita: cada papel só gerencia papéis abaixo do seu.
 * - OWNER gerencia todos, inclusive outros OWNERs — menos a si mesmo.
 * - MANAGER gerencia só BARBER e FINANCE (o reset expõe a senha temporária: mexer em
 *   outro MANAGER permitiria tomar a conta dele).
 * - BARBER e FINANCE não gerenciam ninguém.
 */

export interface Actor {
  staffId: string;
  role: StaffRole;
}

export interface Target {
  id: string;
  role: StaffRole;
}

const MANAGEABLE_BY: Record<StaffRole, readonly StaffRole[]> = {
  OWNER: ["OWNER", "MANAGER", "BARBER", "FINANCE"],
  MANAGER: ["BARBER", "FINANCE"],
  BARBER: [],
  FINANCE: [],
};

/** Papéis que o ator pode atribuir (na criação ou na troca de papel). */
export function canAssignRole(actor: Actor, role: StaffRole): boolean {
  return MANAGEABLE_BY[actor.role].includes(role);
}

/** Criar, editar, desativar, resetar senha, vincular serviços de OUTRO staff. */
export function canManageStaff(actor: Actor, target: Target): boolean {
  if (actor.staffId === target.id) return false;
  return MANAGEABLE_BY[actor.role].includes(target.role);
}

/**
 * Editar o PRÓPRIO cadastro pela rota de equipe: só o OWNER, e só campos sem efeito de
 * permissão (nome, cargo, comissão). Papel e `active` do próprio nunca mudam — evita
 * autopromoção e trancar a loja do lado de fora.
 */
export const SELF_EDITABLE_FIELDS = ["name", "title", "commissionBps"] as const;

export function canEditSelf(actor: Actor, fields: readonly string[]): boolean {
  if (actor.role !== "OWNER") return false;
  return fields.every((f) => (SELF_EDITABLE_FIELDS as readonly string[]).includes(f));
}

/** Ver dados completos da equipe (e-mail, comissão). BARBER vê só o básico dos colegas. */
export function canSeeFullStaff(actor: Actor, targetId: string): boolean {
  return actor.role !== "BARBER" || actor.staffId === targetId;
}

/** Escala e bloqueios de UM staff. FINANCE nem lê. */
export function canAccessStaffAgenda(actor: Actor, staffId: string): boolean {
  switch (actor.role) {
    case "OWNER":
    case "MANAGER":
      return true;
    case "BARBER":
      return actor.staffId === staffId;
    case "FINANCE":
      return false;
  }
}

/**
 * Configuração da loja: dados, horário, catálogo de serviços e bloqueios da loja inteira
 * (`staffId` nulo). Só OWNER e MANAGER; os demais só leem.
 */
export function canManageShop(actor: Actor): boolean {
  return actor.role === "OWNER" || actor.role === "MANAGER";
}

/** Leitura de bloqueios: todos menos FINANCE. */
export function canReadBlocks(actor: Actor): boolean {
  return actor.role !== "FINANCE";
}
