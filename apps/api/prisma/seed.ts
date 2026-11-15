/**
 * Seed de DESENVOLVIMENTO: cria a "Barbearia Demo" com equipe, serviços e horários.
 * • Idempotente: se a loja já existe, não faz nada.
 * • Não cria clientes — nenhum dado pessoal fictício no banco (minimização).
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { generateToken } from "../src/infra/crypto.js";
import { createDb } from "../src/infra/db.js";

const SLUG = "demo";
const POLICY_VERSION = "2026-11";
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const; // perfil OWASP

const hhmm = (h: number, m = 0) => h * 60 + m;
const WORK_DAYS = [2, 3, 4, 5, 6]; // terça a sábado

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed de desenvolvimento não roda em produção.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ausente.");

  const db = createDb({ DATABASE_URL: databaseUrl, DB_CONNECTION_LIMIT: 2 });
  try {
    if (await db.shop.findUnique({ where: { slug: SLUG } })) {
      console.log(`Loja "${SLUG}" já existe — seed ignorado.`);
      return;
    }

    const ownerPassword = process.env.SEED_OWNER_PASSWORD || generateToken(12);
    const ownerEmail = process.env.SEED_OWNER_EMAIL || "dono@demo.local";
    // Barbeiros recebem senha inutilizável; o acesso real virá por convite (Fase 2).
    const unusable = () => hash(generateToken(32), ARGON2);

    await db.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          slug: SLUG,
          name: "Barbearia Demo",
          policyVersion: POLICY_VERSION,
          businessHours: {
            create: WORK_DAYS.map((weekday) => ({
              weekday,
              openMin: hhmm(9),
              closeMin: hhmm(20),
            })),
          },
        },
      });

      const [corte, barba, combo] = await Promise.all([
        tx.service.create({
          data: { shopId: shop.id, name: "Corte", priceCents: 6000, durationMin: 30, sortOrder: 1 },
        }),
        tx.service.create({
          data: { shopId: shop.id, name: "Barba", priceCents: 4000, durationMin: 30, sortOrder: 2 },
        }),
        tx.service.create({
          data: {
            shopId: shop.id,
            name: "Combo Corte + Barba",
            priceCents: 9000,
            durationMin: 60,
            sortOrder: 3,
          },
        }),
      ]);

      await tx.staff.create({
        data: {
          shopId: shop.id,
          name: "Dono Demo",
          email: ownerEmail,
          role: "OWNER",
          passwordHash: await hash(ownerPassword, ARGON2),
        },
      });

      const barbers = [
        { name: "João", title: "Master Barber", commissionBps: 4000 },
        { name: "Rafa", title: "Barbeiro", commissionBps: 3500 },
      ];

      for (const [i, barber] of barbers.entries()) {
        await tx.staff.create({
          data: {
            shopId: shop.id,
            ...barber,
            email: `barbeiro${i + 1}@demo.local`,
            role: "BARBER",
            passwordHash: await unusable(),
            schedules: {
              create: WORK_DAYS.flatMap((weekday) => [
                { weekday, startMin: hhmm(9), endMin: hhmm(12) },
                { weekday, startMin: hhmm(13), endMin: hhmm(20) }, // almoço 12–13
              ]),
            },
            services: {
              create: [{ serviceId: corte.id }, { serviceId: barba.id }, { serviceId: combo.id }],
            },
          },
        });
      }
    });

    console.log(`✔ Loja "${SLUG}" criada.`);
    if (!process.env.SEED_OWNER_PASSWORD) {
      console.log(`  Login do dono: ${ownerEmail}`);
      console.log(`  Senha gerada (exibida só agora): ${ownerPassword}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
