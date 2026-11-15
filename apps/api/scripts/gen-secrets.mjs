// Gera segredos aleatórios para o ambiente LOCAL. Rode: pnpm env:secrets
// Em produção, gere valores NOVOS e cadastre-os direto no PM2/servidor.
import { randomBytes } from "node:crypto";

const b64 = (n) => randomBytes(n).toString("base64");
// base64url é seguro dentro de URLs (DATABASE_URL) e de SQL entre aspas simples.
const url = (n) => randomBytes(n).toString("base64url");

const appPass = url(24);
const migratorPass = url(24);

console.log(`# ---- .env da RAIZ (docker-compose) ----
MYSQL_ROOT_PASSWORD=${url(24)}
DB_APP_PASSWORD=${appPass}
DB_MIGRATOR_PASSWORD=${migratorPass}

# ---- apps/api/.env ----
DATABASE_URL=mysql://barber_app:${appPass}@127.0.0.1:3306/barber
MIGRATION_DATABASE_URL=mysql://barber_migrator:${migratorPass}@127.0.0.1:3306/barber
TEST_DATABASE_URL=mysql://barber_app:${appPass}@127.0.0.1:3306/barber_test
TEST_MIGRATION_DATABASE_URL=mysql://barber_migrator:${migratorPass}@127.0.0.1:3306/barber_test
JWT_ACCESS_SECRET=${url(48)}
PHONE_ENC_KEY=${b64(32)}
PHONE_HASH_PEPPER=${url(32)}
WA_APP_SECRET=${url(24)}
WA_VERIFY_TOKEN=${url(24)}`);
