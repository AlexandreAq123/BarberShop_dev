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
     * Revoga UMA sessão de forma atômica. Devolve false se ela já estava
     * revogada — é isso que impede duas rotações paralelas do mesmo token.
     */
    async revokeSession(sessionId: string, now: Date, tx: Db | DbTx = db): Promise<boolean> {
      const { count } = await tx.staffSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    },

    /** Revoga todas as sessões ativas do staff, exceto (opcionalmente) uma. */
    revokeAllSessions(staffId: string, now: Date, exceptSessionId?: string, tx: Db | DbTx = db) {
      return tx.staffSession.updateMany({
        where: {
          staffId,
          revokedAt: null,
          ...(exceptSessionId && { id: { not: exceptSessionId } }),
        },
        data: { revokedAt: now },
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
