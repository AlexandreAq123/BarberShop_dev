import { createContainer } from "./app/container.js";
import { EnvValidationError, loadEnv, type Env } from "./infra/env.js";
import { buildApp } from "./infra/http/app.js";

let env: Env;
try {
  env = loadEnv();
} catch (err) {
  if (err instanceof EnvValidationError) {
    console.error(`[boot] ${err.message}\n[boot] A API não foi iniciada.`);
    process.exit(1);
  }
  throw err;
}

const container = createContainer(env);
const app = await buildApp(container);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "encerrando com segurança");
  // Para de aceitar conexões, termina as requisições em andamento e fecha o pool.
  await app.close();
  await container.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.fatal({ err }, "falha ao iniciar o servidor");
  await container.close();
  process.exit(1);
}
