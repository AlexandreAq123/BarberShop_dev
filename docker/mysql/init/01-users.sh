#!/bin/bash
# Executado UMA vez, na primeira subida do container (volume vazio).
# Cria dois usuários com o princípio do menor privilégio:
#   barber_app       → só DML no banco da aplicação (é o que a API usa)
#   barber_migrator  → DDL para o Prisma Migrate
# ATENÇÃO: o GRANT global do migrator existe só no ambiente LOCAL, porque o
# `prisma migrate dev` cria um banco temporário (shadow). Em produção o
# migrator recebe privilégios apenas em `barber`.* e roda só `migrate deploy`.
set -euo pipefail

: "${MYSQL_DATABASE:?}" "${DB_APP_PASSWORD:?}" "${DB_MIGRATOR_PASSWORD:?}"

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'barber_app'@'%' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO 'barber_app'@'%';

CREATE USER IF NOT EXISTS 'barber_migrator'@'%' IDENTIFIED BY '${DB_MIGRATOR_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO 'barber_migrator'@'%';

FLUSH PRIVILEGES;
SQL
