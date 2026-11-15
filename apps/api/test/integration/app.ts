import { createContainer } from "../../src/app/container.js";
import { buildApp } from "../../src/infra/http/app.js";
import { testEnv } from "../helpers.js";
import { testDb } from "./db.js";

/** App completo ligado ao banco de teste. Cada chamada = rate limit zerado. */
export async function buildTestApp() {
  const container = createContainer(testEnv(), testDb());
  return { app: await buildApp(container), container };
}
