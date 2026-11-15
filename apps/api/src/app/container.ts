import { createDb, dbHealth, type Db, type DbHealth } from "../infra/db.js";
import type { Env } from "../infra/env.js";
import { createAuthRepository } from "../modules/auth/auth.repository.js";
import { createAuthService, type AuthService } from "../modules/auth/auth.service.js";
import { createStaffTokens, type StaffTokens } from "../modules/auth/auth.tokens.js";

/**
 * Composition root: o ÚNICO lugar onde dependências concretas são criadas e
 * ligadas (db → repositories → services). Rotas recebem só o que precisam.
 * Cada tarefa da Fase 2 acrescenta seus services aqui.
 */
export interface Container {
  env: Env;
  db: Db;
  health: DbHealth;
  staffTokens: StaffTokens;
  auth: AuthService;
  close(): Promise<void>;
}

export function createContainer(env: Env, db: Db = createDb(env)): Container {
  const staffTokens = createStaffTokens(env.JWT_ACCESS_SECRET);
  return {
    env,
    db,
    health: dbHealth(db),
    staffTokens,
    auth: createAuthService({ repo: createAuthRepository(db), tokens: staffTokens }),
    close: () => db.$disconnect(),
  };
}

/** Dependências que a camada HTTP enxerga (sem o Prisma Client bruto). */
export type AppDeps = Omit<Container, "db" | "close">;
