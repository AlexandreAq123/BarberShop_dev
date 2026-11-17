import { jwtVerify, SignJWT } from "jose";
import type { StaffRole } from "../../generated/prisma/client.ts";

/**
 * Access token do staff: JWT HS256 de vida curta (15 min).
 * `iss`/`aud` próprios — o token de privacidade (2.5) terá outro `aud`
 * e um não serve no lugar do outro.
 */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const JWT_ISSUER = "barber-api";
export const STAFF_AUDIENCE = "barber-admin";

const ROLES = ["OWNER", "MANAGER", "BARBER", "FINANCE"] as const satisfies readonly StaffRole[];

export interface StaffClaims {
  staffId: string;
  shopId: string;
  role: StaffRole;
  /** mustChangePassword: só a troca de senha é permitida. */
  mustChangePassword: boolean;
}

export class InvalidTokenError extends Error {
  constructor() {
    super("token inválido");
    this.name = "InvalidTokenError";
  }
}

export function createStaffTokens(secret: string, now: () => Date = () => new Date()) {
  const key = new TextEncoder().encode(secret);

  async function sign(claims: StaffClaims): Promise<string> {
    const iat = Math.floor(now().getTime() / 1000);
    return new SignJWT({ shopId: claims.shopId, role: claims.role, mcp: claims.mustChangePassword })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.staffId)
      .setIssuer(JWT_ISSUER)
      .setAudience(STAFF_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TOKEN_TTL_SEC)
      .sign(key);
  }

  async function verify(token: string): Promise<StaffClaims> {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"], // nunca "none" nem algoritmo escolhido pelo token
        issuer: JWT_ISSUER,
        audience: STAFF_AUDIENCE,
        currentDate: now(),
        requiredClaims: ["sub", "exp", "iat"],
      });
      const { sub, shopId, role, mcp } = payload;
      if (
        typeof sub !== "string" ||
        typeof shopId !== "string" ||
        !ROLES.includes(role as StaffRole) ||
        typeof mcp !== "boolean"
      ) {
        throw new InvalidTokenError();
      }
      return { staffId: sub, shopId, role: role as StaffRole, mustChangePassword: mcp };
    } catch {
      throw new InvalidTokenError();
    }
  }

  return { sign, verify };
}

export type StaffTokens = ReturnType<typeof createStaffTokens>;
