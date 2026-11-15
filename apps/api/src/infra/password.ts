import { hash, verify } from "@node-rs/argon2";
import { generateToken } from "./crypto.js";

/**
 * Senhas do staff: argon2id com o perfil mínimo recomendado pela OWASP.
 * O salt é aleatório por hash (embutido no próprio hash).
 */
export const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;
/** Teto evita DoS: argon2 com entrada gigante custa CPU/memória à toa. */
export const PASSWORD_MAX = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

/** Nunca lança: hash malformado conta como senha errada. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let decoy: Promise<string> | undefined;

/**
 * Verifica contra um hash fixo (gerado uma vez por processo) quando o usuário
 * não existe ou está inativo: o tempo de resposta fica igual ao de senha errada,
 * então não dá para descobrir quais e-mails existem cronometrando o login.
 */
export async function verifyAgainstDecoy(password: string): Promise<false> {
  decoy ??= hashPassword(generateToken(32));
  await verifyPassword(await decoy, password);
  return false;
}
