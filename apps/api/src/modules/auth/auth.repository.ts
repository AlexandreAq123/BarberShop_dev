import type { Db, DbTx } from "../../infra/db.js";

/** Campos do staff que a autenticação precisa. Nunca devolve mfaSecretEnc. */
const STAFF_AUTH_SELECT = {
  id: true,
  shopId: true,
  name: true,
  role: true,
  active: true,
  passwordHash: true,
  mustChangePassword: true,
} as const;

export function createAuthRepository(db: Db) {
  return {
    /** Staff pelo par loja+e-mail. Loja inativa conta como inexistente. */
    findStaffForLogin(shopSlug: string, email: string) {
      return db.staff.findFirst({
        where: { email, shop: { slug: shopSlug, active: true } },
        select: STAFF_AUTH_SELECT,
      });
    },

    /** Estado atual do staff para o guard (releitura a cada requisição autenticada). */
    findStaffAccess(staffId: string, shopId: string) {
      return db.staff.findFirst({
        where: { id: staffId, shopId },
        select: { active: true, role: true, mustChangePassword: true },
      });
    },

    findStaff(staffId: string, shopId: string) {
      return db.staff.findFirst({ where: { id: staffId, shopId }, select: STAFF_AUTH_SELECT });
    },

    createSession(
      data: { staffId: string; tokenHash: string; expiresAt: Date },
      tx: Db | DbTx = db,
    ) {
      return tx.staffSession.create({ data, select: { id: true } });
    },

    findSession(tokenHash: string) {
      return db.staffSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          staffId: true,
          expiresAt: true,
          revokedAt: true,
          staff: { select: STAFF_AUTH_SELECT },
        },
      });
    },

    /**
     * Marca a sessão como ROTACIONADA (revokedAt). A linha fica como lápide até expirar:
     * reapresentar esse token = reuso ⇒ provável roubo. Devolve false se ela já estava
     * rotacionada — é isso que impede duas rotações paralelas do mesmo token.
     */
    async rotateSession(sessionId: string, now: Date, tx: Db | DbTx = db): Promise<boolean> {
      const { count } = await tx.staffSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    },

    /**
     * Encerra UMA sessão (logout, expirada). Apaga a linha em vez de marcar revokedAt:
     * um token encerrado de forma legítima dá 401 simples, sem disparar a detecção de reuso.
     */
    async endSession(sessionId: string, tx: Db | DbTx = db): Promise<void> {
      await tx.staffSession.deleteMany({ where: { id: sessionId } });
    },

    /** Encerra todas as sessões do staff (inclusive lápides), exceto (opcionalmente) uma. */
    async endAllSessions(staffId: string, exceptSessionId?: string, tx: Db | DbTx = db) {
      await tx.staffSession.deleteMany({
        where: { staffId, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
      });
    },

    updatePassword(staffId: string, passwordHash: string, tx: Db | DbTx = db) {
      return tx.staff.update({
        where: { id: staffId },
        data: { passwordHash, mustChangePassword: false },
        select: { id: true },
      });
    },

    transaction<T>(fn: (tx: DbTx) => Promise<T>) {
      return db.$transaction(fn);
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
