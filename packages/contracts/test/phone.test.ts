import { describe, expect, it } from "vitest";
import { normalizePhone, phoneFromWhatsAppId, phoneSchema } from "../src/phone.js";

describe("normalizePhone", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321"],
    ["11987654321", "+5511987654321"],
    ["+55 11 98765-4321", "+5511987654321"],
    ["  011 98765 4321 ", "+5511987654321"],
    ["(21) 3333-4444", "+552133334444"], // fixo continua válido
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("adiciona o nono dígito em celular brasileiro no formato antigo", () => {
    expect(normalizePhone("+55 11 8765-4321")).toBe("+5511987654321");
  });

  it("aceita número estrangeiro com DDI", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
  });

  it.each(["", "123", "abc", "(11) 1234", "+55 00 98765-4321"])("rejeita %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("phoneFromWhatsAppId", () => {
  it("converte wa_id moderno", () => {
    expect(phoneFromWhatsAppId("5511987654321")).toBe("+5511987654321");
  });

  it("converte wa_id legado (sem o 9) para o mesmo E.164 da Web", () => {
    expect(phoneFromWhatsAppId("551187654321")).toBe(normalizePhone("(11) 98765-4321"));
  });

  it("rejeita lixo", () => {
    expect(phoneFromWhatsAppId("+5511987654321")).toBeNull();
    expect(phoneFromWhatsAppId("55abc")).toBeNull();
  });
});

describe("phoneSchema", () => {
  it("transforma e valida", () => {
    expect(phoneSchema.parse("11 98765-4321")).toBe("+5511987654321");
    expect(phoneSchema.safeParse("999").success).toBe(false);
  });
});
