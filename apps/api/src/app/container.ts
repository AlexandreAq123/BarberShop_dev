import { createDb, dbHealth, type Db, type DbHealth } from "../infra/db.js";
import type { Env } from "../infra/env.js";
import type { StaffAccess } from "../modules/auth/auth.plugin.js";
import { createAuthRepository } from "../modules/auth/auth.repository.js";
import { createAuthService, type AuthService } from "../modules/auth/auth.service.js";
import { createStaffTokens, type StaffTokens } from "../modules/auth/auth.tokens.js";
import { createCatalogRepository } from "../modules/catalog/catalog.repository.js";
import { createCatalogService, type CatalogService } from "../modules/catalog/catalog.service.js";
import { createBlocksService, type BlocksService } from "../modules/scheduling/blocks.service.js";
import { createSchedulingRepository } from "../modules/scheduling/scheduling.repository.js";
import {
  createShopSettingsService,
  type ShopSettingsService,
} from "../modules/scheduling/shop-settings.service.js";
import {
  createStaffSetupService,
  type StaffSetupService,
} from "../modules/staff/staff-setup.service.js";
import { createStaffRepository } from "../modules/staff/staff.repository.js";
import { createStaffService, type StaffService } from "../modules/staff/staff.service.js";

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
  staffAccess: StaffAccess;
  auth: AuthService;
  staff: StaffService;
  staffSetup: StaffSetupService;
  catalog: CatalogService;
  shopSettings: ShopSettingsService;
  blocks: BlocksService;
  close(): Promise<void>;
}

export function createContainer(env: Env, db: Db = createDb(env)): Container {
  const staffTokens = createStaffTokens(env.JWT_ACCESS_SECRET);
  const authRepo = createAuthRepository(db);
  const staffRepo = createStaffRepository(db);
  const schedulingRepo = createSchedulingRepository(db);
  return {
    env,
    db,
    health: dbHealth(db),
    staffTokens,
    staffAccess: { load: (staffId, shopId) => authRepo.findStaffAccess(staffId, shopId) },
    auth: createAuthService({ repo: authRepo, tokens: staffTokens }),
    staff: createStaffService({ repo: staffRepo }),
    staffSetup: createStaffSetupService({ repo: staffRepo }),
    catalog: createCatalogService({ repo: createCatalogRepository(db) }),
    shopSettings: createShopSettingsService({ repo: schedulingRepo }),
    blocks: createBlocksService({ repo: schedulingRepo }),
    close: () => db.$disconnect(),
  };
}

/** Dependências que a camada HTTP enxerga (sem o Prisma Client bruto). */
export type AppDeps = Omit<Container, "db" | "close">;
