# ADR-001: Stack da plataforma

**Status:** Aceito · **Data:** 2026-11-14

## Contexto

Sistema SaaS de agendamento com webhook do WhatsApp exposto, interface mobile-first,
hospedagem na Hostinger e banco MySQL/MariaDB obrigatório. O projeto anterior
(Firebase + GitHub Pages) não consegue hospedar webhook nem worker e permitia
overbooking e adulteração de preço pelo cliente.

## Decisão

- **Node.js 22 + TypeScript + Fastify 5** na API.
- **Prisma 7** (generator `prisma-client` + adapter MariaDB) sobre **MySQL 8**.
- **React + Vite** (SPA/PWA estática) para os frontends, em dois builds: cliente e admin.
- **pnpm workspaces** com pacote `@barber/contracts` (zod) compartilhado.
- **VPS Hostinger** (Nginx + PM2), não hospedagem compartilhada.

## Opções consideradas

|                                   | Fastify        | Express           | NestJS     |
| --------------------------------- | -------------- | ----------------- | ---------- |
| Raw body p/ assinatura do webhook | nativo (hooks) | middleware manual | manual     |
| Validação por schema              | nativa         | não               | decorators |
| Complexidade                      | baixa          | baixa             | alta       |

Prisma vs Drizzle: Prisma pela maturidade das migrations; Drizzle segue como alternativa.

## Consequências

- ✅ Um só tipo de dado da borda ao banco; erros pegos em build.
- ✅ Frontend sem servidor Node (só Nginx servindo arquivos).
- ⚠️ Prisma 7 exige driver adapter e o binário `schema-engine` só para o CLI de migrations.
- 🔁 Revisitar se precisarmos de SSR para SEO das páginas públicas das barbearias.
