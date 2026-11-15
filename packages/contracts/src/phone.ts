import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

/** Telefone canônico no formato E.164, ex.: "+5511987654321". */
export type PhoneE164 = string & { readonly __brand: "PhoneE164" };

/**
 * Celulares brasileiros têm 9 dígitos começando por 9. Contas antigas de WhatsApp
 * ainda chegam no webhook com o formato de 8 dígitos (ex.: wa_id "551187654321").
 * Sem esta correção, o mesmo cliente teria um hash pela Web e outro pelo WhatsApp.
 */
function addBrazilianNinthDigit(e164: string): string {
  // DDDs brasileiros nunca contêm o dígito 0.
  const match = /^\+55([1-9]{2})([6-9]\d{7})$/.exec(e164);
  return match ? `+55${match[1]}9${match[2]}` : e164;
}

/**
 * Normaliza qualquer entrada humana ("(11) 98765-4321", "11987654321",
 * "+55 11 98765-4321") para E.164. Retorna null se o número não for válido.
 * O país padrão é o Brasil, mas números estrangeiros com "+" são aceitos.
 */
export function normalizePhone(input: string, defaultCountry: "BR" = "BR"): PhoneE164 | null {
  const trimmed = input.trim();
  if (trimmed.length < 8 || trimmed.length > 25) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed) return null;

  const canonical = addBrazilianNinthDigit(parsed.number);
  const reparsed = parsePhoneNumberFromString(canonical);
  // Se a biblioteca "reinterpretar" o número (ex.: removendo um 0 de tronco),
  // a entrada era ambígua — melhor recusar do que gravar o telefone de outra pessoa.
  if (!reparsed?.isValid() || reparsed.number !== canonical) return null;

  return reparsed.number as PhoneE164;
}

/** O webhook da Meta envia o número sem "+" (campo wa_id / from). */
export function phoneFromWhatsAppId(waId: string): PhoneE164 | null {
  if (!/^\d{10,15}$/.test(waId)) return null;
  return normalizePhone(`+${waId}`);
}

/** Schema para payloads da API: aceita formato livre e entrega E.164. */
export const phoneSchema = z
  .string()
  .max(25)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido" });
      return z.NEVER;
    }
    return phone;
  });
