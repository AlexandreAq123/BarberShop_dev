# barber-saas

SaaS de agendamento e gestão para barbearias e salões — reconstrução multi-tenant
do antigo _Jodi's Barbershop_ (Firebase), com foco em conversão mobile, WhatsApp
e LGPD (_privacy by design_). Nome comercial ainda em definição.

> **Status:** Fase 1 — Fundação. API com health check, schema do banco, criptografia
> de dados pessoais e CI. Agendamento, WhatsApp e telas entram nas próximas fases.

## Quick start (≈ 5 min)

Pré-requisitos: **Node 22** (`.nvmrc`), **pnpm 10** (`corepack enable`) e **Docker**.

```bash
pnpm install                      # instala e já gera o Prisma Client

cp .env.example .env              # variáveis do docker-compose
cp apps/api/.env.example apps/api/.env
pnpm env:secrets                  # imprime segredos novos: cole cada bloco no arquivo indicado

pnpm db:up                        # MySQL 8.4 local (só em 127.0.0.1)
pnpm db:migrate --name init       # 1ª vez: cria a migration inicial → faça commit dela
pnpm db:seed                      # "Barbearia Demo" + login do dono (senha mostrada uma vez)

pnpm dev                          # API em http://127.0.0.1:3333
curl http://127.0.0.1:3333/health/ready   # {"status":"ok"}
```

Se alguma variável obrigatória faltar, a API **não sobe** e lista o que está errado
(sem nunca imprimir valores).

## Estrutura

```
apps/
  api/                 Fastify + Prisma (MySQL) — monólito modular
    prisma/            schema.prisma, migrations, seed
    src/infra/         env, db, crypto, logger, http
    src/modules/       um domínio por pasta (controller · service · repository)
    test/              Vitest
packages/
  contracts/           schemas zod compartilhados (ex.: telefone E.164)
docker/mysql/init/     criação dos usuários do banco (menor privilégio)
docs/
  adr/                 decisões de arquitetura
  plans/               plano de cada fase (checklist de tarefas)
  policies/            política de segurança, privacidade e LGPD
.claude/
  commands/            /tarefa <n> (executa uma tarefa do plano) · /revisar (revisão do diff)
  settings.json        permissões do Claude Code no projeto
```

## Scripts

| Comando                                       | O que faz                                     |
| --------------------------------------------- | --------------------------------------------- |
| `pnpm dev`                                    | API com reload                                |
| `pnpm test` / `typecheck` / `lint` / `format` | Qualidade (o CI roda todos)                   |
| `pnpm build`                                  | Bundle da API em `apps/api/dist`              |
| `pnpm db:up` / `db:down`                      | Sobe/derruba o MySQL local                    |
| `pnpm db:migrate`                             | Nova migration (somente dev)                  |
| `pnpm db:deploy`                              | Aplica migrations (produção/CI)               |
| `pnpm db:seed`                                | Dados de demonstração (bloqueado em produção) |
| `pnpm env:secrets`                            | Gera segredos locais                          |

## Regras inegociáveis

- **Segredos** só em `.env` (fora do Git) ou no PM2 em produção. Nunca no código.
- **SQL** só via Prisma. `$queryRaw` apenas com _template tag_ (parametrizado);
  `$queryRawUnsafe` é proibido.
- **Dois usuários de banco:** a API usa `barber_app` (só DML); migrations usam
  `barber_migrator`. Ver [ADR-003](docs/adr/003-multitenancy-e-protecao-de-dados.md).
- **Telefone do cliente** nunca em claro no banco nem em log.
- **Dependências** só com 14+ dias de publicadas (`minimumReleaseAge` no pnpm).

## Roadmap

| Fase                | Entrega                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| **1 — Fundação** ✅ | Monorepo, env, schema, crypto, health, CI                                 |
| 2 — Core da API     | Auth staff, catálogo, disponibilidade, agendamento com lock, LGPD, worker |
| 3 — WhatsApp        | Webhook assinado, sessão, parser, templates, OTP, lembretes               |
| 4 — Front Admin     | Agenda, drag-and-drop, checkout, dashboards                               |
| 5 — Front Cliente   | Fluxo mobile-first, opt-in, portal `/privacy`                             |
| 6 — Deploy          | VPS Hostinger, Nginx, PM2, backups, migração do Jodi's                    |
