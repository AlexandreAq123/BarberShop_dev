import { Prisma } from "../../src/generated/prisma/client.ts";
import { createDb, type Db } from "../../src/infra/db.js";

/**
 * Banco dos testes de integração. Só aceita um banco cujo nome termine em
 * `_test` — resetDb() apaga TUDO e não pode, nem por engano, mirar o `barber`.
 */
function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Adicione em apps/api/.env, ex.:\n" +
        "  TEST_DATABASE_URL=mysql://barber_app:SENHA_APP@127.0.0.1:3306/barber_test\n" +
        "e aplique as migrations com `pnpm db:deploy:test` (ver README).",
    );
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL precisa apontar para um banco *_test (recebido: "${name}").`,
    );
  }
  return url;
}

let instance: Db | undefined;

export function testDb(): Db {
  instance ??= createDb({ DATABASE_URL: testDatabaseUrl(), DB_CONNECTION_LIMIT: 10 });
  return instance;
}

export async function closeTestDb() {
  await instance?.$disconnect();
  instance = undefined;
}

type ModelKey = Uncapitalize<Prisma.ModelName>;

/** Filhos antes dos pais (appointments tem RESTRICT para staff e services). */
const DELETE_ORDER: readonly ModelKey[] = [
  "appointment",
  "authToken",
  "privacyLog",
  "staffSession",
  "staffService",
  "staffSchedule",
  "scheduleBlock",
  "businessHour",
  "client",
  "service",
  "staff",
  "whatsAppSession",
  "whatsAppInbound",
  "whatsAppChannel",
  "outboxJob",
  "shop",
];

const uncapitalize = (s: string) => (s[0]?.toLowerCase() ?? "") + s.slice(1);

/**
 * Apaga os dados de todas as tabelas. Usa DELETE via Prisma (o usuário
 * barber_app só tem DML, então TRUNCATE não é opção — e assim não há SQL cru).
 */
export async function resetDb() {
  const missing = Object.values(Prisma.ModelName)
    .map(uncapitalize)
    .filter((m) => !DELETE_ORDER.includes(m as ModelKey));
  if (missing.length > 0) {
    throw new Error(`resetDb(): inclua os novos models em DELETE_ORDER: ${missing.join(", ")}`);
  }

  const db = testDb();
  for (const model of DELETE_ORDER) {
    await (db[model] as unknown as { deleteMany(): Promise<unknown> }).deleteMany();
  }
}
