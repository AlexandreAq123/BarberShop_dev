import { randomBytes } from "node:crypto";
import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_TTL_SEC,
  createStaffTokens,
  InvalidTokenError,
  JWT_ISSUER,
  STAFF_AUDIENCE,
  type StaffClaims,
} from "../src/modules/auth/auth.tokens.js";

const SECRET = randomBytes(48).toString("base64url");
const claims: StaffClaims = {
  staffId: "staff-1",
  shopId: "shop-1",
  role: "BARBER",
  mustChangePassword: false,
};
const key = new TextEncoder().encode(SECRET);
const forge = (payload: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("staff-1")
    .setIssuer(opts.iss ?? JWT_ISSUER)
    .setAudience(opts.aud ?? STAFF_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);

describe("access token do staff", () => {
  it("assina e valida (ida e volta)", async () => {
    const tokens = createStaffTokens(SECRET);
    expect(await tokens.verify(await tokens.sign(claims))).toEqual(claims);
  });

  it("expira em 15 minutos", async () => {
    let now = new Date("2026-11-15T12:00:00Z");
    const tokens = createStaffTokens(SECRET, () => now);
    const token = await tokens.sign(claims);
    now = new Date(now.getTime() + (ACCESS_TOKEN_TTL_SEC - 1) * 1000);
    await expect(tokens.verify(token)).resolves.toEqual(claims);
    now = new Date(now.getTime() + 2_000);
    await expect(tokens.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejeita segredo diferente", async () => {
    const token = await createStaffTokens(randomBytes(48).toString("base64url")).sign(claims);
    await expect(createStaffTokens(SECRET).verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejeita alg "none"', async () => {
    const token = new UnsecuredJWT({ shopId: "shop-1", role: "OWNER", mcp: false })
      .setSubject("staff-1")
      .setIssuer(JWT_ISSUER)
      .setAudience(STAFF_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("15m")
      .encode();
    await expect(createStaffTokens(SECRET).verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejeita outro audience (ex.: token do portal de privacidade) e outro issuer", async () => {
    const payload = { shopId: "shop-1", role: "OWNER", mcp: false };
    const tokens = createStaffTokens(SECRET);
    await expect(tokens.verify(await forge(payload, { aud: "barber-privacy" }))).rejects.toThrow();
    await expect(tokens.verify(await forge(payload, { iss: "outro" }))).rejects.toThrow();
  });

  it("rejeita claims ausentes ou com papel desconhecido", async () => {
    const tokens = createStaffTokens(SECRET);
    await expect(tokens.verify(await forge({ role: "OWNER", mcp: false }))).rejects.toThrow();
    await expect(
      tokens.verify(await forge({ shopId: "s", role: "ROOT", mcp: false })),
    ).rejects.toThrow();
    await expect(tokens.verify(await forge({ shopId: "s", role: "OWNER" }))).rejects.toThrow();
  });
});
