import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { PhoneE164 } from "@barber/contracts";

/**
 * Criptografia de dados pessoais em repouso.
 *
 * Formato do ciphertext (VARBINARY):
 *   [1 byte versão][12 bytes IV][16 bytes auth tag][N bytes dados]
 *
 * • A versão permite rotacionar a chave no futuro sem migração imediata.
 * • O shopId entra como AAD: um ciphertext copiado para outra loja não decifra.
 * • O hash (blind index) também inclui o shopId: o mesmo telefone gera hashes
 *   diferentes em lojas diferentes, então não dá para cruzar clientes entre tenants.
 */

const VERSION = 0x01;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH;

export class DecryptionError extends Error {
  constructor() {
    super("Não foi possível decifrar o dado");
    this.name = "DecryptionError";
  }
}

export interface CryptoConfig {
  /** 32 bytes em base64 (PHONE_ENC_KEY). */
  phoneEncKey: string;
  /** PHONE_HASH_PEPPER. */
  phoneHashPepper: string;
}

export function createCrypto(config: CryptoConfig) {
  const key = Buffer.from(config.phoneEncKey, "base64");
  if (key.length !== 32) throw new Error("PHONE_ENC_KEY precisa ter 32 bytes");

  function encrypt(plaintext: string, shopId: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(shopId, "utf8"));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), data]);
  }

  function decrypt(payload: Uint8Array, shopId: string): string {
    const buf = Buffer.from(payload);
    if (buf.length <= HEADER_LENGTH || buf[0] !== VERSION) throw new DecryptionError();

    const iv = buf.subarray(1, 1 + IV_LENGTH);
    const tag = buf.subarray(1 + IV_LENGTH, HEADER_LENGTH);
    const data = buf.subarray(HEADER_LENGTH);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LENGTH });
      decipher.setAAD(Buffer.from(shopId, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      throw new DecryptionError();
    }
  }

  return {
    encryptPhone: (phone: PhoneE164, shopId: string) => encrypt(phone, shopId),
    decryptPhone: (payload: Uint8Array, shopId: string) => decrypt(payload, shopId) as PhoneE164,

    /** Blind index: busca e unicidade sem guardar o telefone em claro. */
    hashPhone: (phone: PhoneE164, shopId: string) =>
      createHmac("sha256", config.phoneHashPepper).update(`${shopId}:${phone}`).digest("hex"),
  };
}

export type AppCrypto = ReturnType<typeof createCrypto>;

/** Token opaco para magic links e refresh tokens (256 bits). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Hash de token de alta entropia para guardar no banco. SHA-256 simples basta
 * porque o token tem 256 bits aleatórios (força bruta é inviável).
 * NÃO usar para OTP de 6 dígitos — esse terá HMAC + limite de tentativas (Fase 3).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
