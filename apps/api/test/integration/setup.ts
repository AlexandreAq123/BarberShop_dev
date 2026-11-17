import { afterAll, beforeAll } from "vitest";
import { closeTestDb, resetDb } from "./db.js";

// Roda em cada arquivo de teste: começa sempre com o banco vazio.
beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeTestDb();
});
