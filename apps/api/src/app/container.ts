import { createDb, dbHealth, type Db, type DbHealth } from "../infra/db.js";
import type { Env } from "../infra/env.js";

/**
 * Composition root: o ÚNICO lugar onde dependências concretas são criadas e
 * ligadas (db → repositories → services). Rotas recebem só o que precisam.
 * Cada tarefa da Fase 2 acrescenta seus services aqui.
 */
export interface Container {
  env: Env;
  db: Db;
  health: DbHealth;
  close(): Promise<void>;
}

export function createContainer(env: Env, db: Db = createDb(env)): Container {
  return {
    env,
    db,
    health: dbHealth(db),
    close: () => db.$disconnect(),
  };
}

/** Dependências que a camada HTTP enxerga (sem o Prisma Client bruto). */
export type AppDeps = Pick<Container, "env" | "health">;
