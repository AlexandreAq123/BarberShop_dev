import { randomBytes } from "node:crypto";
import { normalizePhone, type PhoneE164 } from "@barber/contracts";
import { describe, expect, it } from "vitest";
import { createCrypto, DecryptionError, generateToken, hashToken } from "../src/infra/crypto.js";

const crypto = createCrypto({
  phoneEncKey: randomBytes(32).toString("base64"),
  phoneHashPepper: randomBytes(32).toString("base64url"),
});
const phone = normalizePhone("(11) 98765-4321") as PhoneE164;
const SHOP_A = "0193a6f0-0000-7000-8000-00000000000a";
const SHOP_B = "0193a6f0-0000-7000-8000-00000000000b";

describe("telefone criptografado", () => {
  it("cifra e decifra (round trip)", () => {
    const enc = crypto.encryptPhone(phone, SHOP_A);
    expect(crypto.decryptPhone(enc, SHOP_A)).toBe(phone);
  });

  it("não guarda o telefone em claro e usa IV aleatório", () => {
    const a = crypto.encryptPhone(phone, SHOP_A);
    const b = crypto.encryptPhone(phone, SHOP_A);
    expect(a.equals(b)).toBe(false);
    expect(a.toString("latin1")).not.toContain("98765");
    expect(a.length).toBeLessThanOrEqual(255); // cabe no VARBINARY(255)
  });

  it("ciphertext de uma loja não decifra em outra (AAD)", () => {
    const enc = crypto.encryptPhone(phone, SHOP_A);
    expect(() => crypto.decryptPhone(enc, SHOP_B)).toThrow(DecryptionError);
  });

  it("detecta adulteração", () => {
    const enc = crypto.encryptPhone(phone, SHOP_A);
    enc[enc.length - 1]! ^= 0xff;
    expect(() => crypto.decryptPhone(enc, SHOP_A)).toThrow(DecryptionError);
  });

  it("rejeita lixo e versão desconhecida", () => {
    expect(() => crypto.decryptPhone(Buffer.from("abc"), SHOP_A)).toThrow(DecryptionError);
    const enc = crypto.encryptPhone(phone, SHOP_A);
    enc[0] = 0x09;
    expect(() => crypto.decryptPhone(enc, SHOP_A)).toThrow(DecryptionError);
  });

  it("chave errada não decifra", () => {
    const other = createCrypto({
      phoneEncKey: randomBytes(32).toString("base64"),
      phoneHashPepper: "x".repeat(32),
    });
    expect(() => other.decryptPhone(crypto.encryptPhone(phone, SHOP_A), SHOP_A)).toThrow(
      DecryptionError,
    );
  });

  it("recusa chave com tamanho inválido", () => {
    expect(() => createCrypto({ phoneEncKey: "abc", phoneHashPepper: "x".repeat(32) })).toThrow();
  });
});

describe("blind index", () => {
  it("é determinístico dentro da loja", () => {
    expect(crypto.hashPhone(phone, SHOP_A)).toBe(crypto.hashPhone(phone, SHOP_A));
    expect(crypto.hashPhone(phone, SHOP_A)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("difere entre lojas (sem cruzamento entre tenants)", () => {
    expect(crypto.hashPhone(phone, SHOP_A)).not.toBe(crypto.hashPhone(phone, SHOP_B));
  });

  it("Web e WhatsApp legado geram o mesmo hash", () => {
    const fromWeb = normalizePhone("11 98765-4321") as PhoneE164;
    const fromWa = normalizePhone("+551187654321") as PhoneE164;
    expect(crypto.hashPhone(fromWeb, SHOP_A)).toBe(crypto.hashPhone(fromWa, SHOP_A));
  });
});

describe("tokens", () => {
  it("gera tokens únicos e url-safe", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(t);
  });

  it("hash do token é estável e não revela o token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});
