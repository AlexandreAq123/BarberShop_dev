import { generateToken, hashToken } from "../../infra/crypto.js";
import { AppError } from "../../infra/http/errors.js";
import { hashPassword, verifyAgainstDecoy, verifyPassword } from "../../infra/password.js";
import type { AuthRepository } from "./auth.repository.js";
import type { StaffClaims, StaffTokens } from "./auth.tokens.js";

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Mensagem ÚNICA para qualquer falha de login: não revela se o e-mail existe. */
const INVALID_LOGIN = "E-mail ou senha inválidos.";
const SESSION_EXPIRED = "Sessão expirada. Entre novamente.";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

interface StaffRow {
  id: string;
  shopId: string;
  name: string;
  role: StaffClaims["role"];
  mustChangePassword: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  staff: { id: string; name: string; role: StaffClaims["role"]; mustChangePassword: boolean };
}

export function createAuthService(deps: {
  repo: AuthRepository;
  tokens: StaffTokens;
  now?: () => Date;
}) {
  const { repo, tokens } = deps;
  const now = deps.now ?? (() => new Date());

  const accessFor = (staff: StaffRow) =>
    tokens.sign({
      staffId: staff.id,
      shopId: staff.shopId,
      role: staff.role,
      mustChangePassword: staff.mustChangePassword,
    });

  const publicStaff = (s: StaffRow) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    mustChangePassword: s.mustChangePassword,
  });

  /** Cria sessão + tokens. Se `tx` vier, a sessão nasce na mesma transação. */
  async function issue(staff: StaffRow, tx?: Parameters<AuthRepository["createSession"]>[1]) {
    const refreshToken = generateToken();
    const refreshExpiresAt = new Date(now().getTime() + REFRESH_TOKEN_TTL_MS);
    await repo.createSession(
      { staffId: staff.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
      tx,
    );
    return {
      accessToken: await accessFor(staff),
      refreshToken,
      refreshExpiresAt,
      staff: publicStaff(staff),
    };
  }

  return {
    async login(input: { shopSlug: string; email: string; password: string }): Promise<AuthResult> {
      const staff = await repo.findStaffForLogin(input.shopSlug, normalizeEmail(input.email));
      if (!staff || !staff.active) {
        await verifyAgainstDecoy(input.password); // mesmo custo de tempo
        throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
      }
      if (!(await verifyPassword(staff.passwordHash, input.password))) {
        throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
      }
      return issue(staff);
    },

    /**
     * Rotação: o refresh token atual é revogado e um novo é emitido.
     * Reuso de token já revogado = provável roubo ⇒ derruba TODAS as sessões do staff.
     */
    async refresh(refreshToken: string | undefined): Promise<AuthResult> {
      if (!refreshToken) throw new AppError("UNAUTHORIZED", SESSION_EXPIRED);
      const session = await repo.findSession(hashToken(refreshToken));
      if (!session) throw new AppError("UNAUTHORIZED", SESSION_EXPIRED);

      const at = now();
      if (session.revokedAt) {
        await repo.revokeAllSessions(session.staffId, at);
        throw new AppError("UNAUTHORIZED", SESSION_EXPIRED, { code: "SESSION_REVOKED" });
      }
      if (session.expiresAt <= at || !session.staff.active) {
        await repo.revokeSession(session.id, at);
        throw new AppError("UNAUTHORIZED", SESSION_EXPIRED);
      }

      const rotated = await repo.transaction(async (tx) => {
        // Atômico: se outra requisição rotacionou este token no meio do caminho, é reuso.
        if (!(await repo.revokeSession(session.id, at, tx))) return null;
        return issue(session.staff, tx);
      });
      if (!rotated) {
        await repo.revokeAllSessions(session.staffId, at);
        throw new AppError("UNAUTHORIZED", SESSION_EXPIRED, { code: "SESSION_REVOKED" });
      }
      return rotated;
    },

    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken) return;
      const session = await repo.findSession(hashToken(refreshToken));
      if (session) await repo.revokeSession(session.id, now());
    },

    /** Troca a própria senha; as OUTRAS sessões caem, a atual continua. */
    async changePassword(input: {
      claims: StaffClaims;
      currentPassword: string;
      newPassword: string;
      refreshToken: string | undefined;
    }): Promise<{ accessToken: string }> {
      const staff = await repo.findStaff(input.claims.staffId, input.claims.shopId);
      if (!staff || !staff.active) throw new AppError("UNAUTHORIZED", SESSION_EXPIRED);

      if (!(await verifyPassword(staff.passwordHash, input.currentPassword))) {
        throw new AppError("UNPROCESSABLE", "Senha atual incorreta.", {
          code: "INVALID_CURRENT_PASSWORD",
        });
      }
      if (input.newPassword === input.currentPassword) {
        throw new AppError("UNPROCESSABLE", "A nova senha precisa ser diferente da atual.", {
          code: "PASSWORD_UNCHANGED",
        });
      }

      const current = input.refreshToken
        ? await repo.findSession(hashToken(input.refreshToken))
        : null;
      const keepSessionId =
        current && current.staffId === staff.id && !current.revokedAt ? current.id : undefined;

      const passwordHash = await hashPassword(input.newPassword);
      await repo.transaction(async (tx) => {
        await repo.updatePassword(staff.id, passwordHash, tx);
        await repo.revokeAllSessions(staff.id, now(), keepSessionId, tx);
      });

      return { accessToken: await accessFor({ ...staff, mustChangePassword: false }) };
    },

    async me(claims: StaffClaims) {
      const staff = await repo.findStaff(claims.staffId, claims.shopId);
      if (!staff || !staff.active) throw new AppError("UNAUTHORIZED", SESSION_EXPIRED);
      return publicStaff(staff);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
