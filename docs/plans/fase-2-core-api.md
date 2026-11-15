# Fase 2 — Core da API

**Objetivo:** API completa para agendar pela Web, gerir a barbearia e exercer os direitos LGPD.
WhatsApp (envio real, webhook) é Fase 3. Telas são Fases 4 e 5.

**Regra de execução:** uma tarefa por sessão do Claude Code (`/clear` entre elas).
Cada tarefa só termina com format, lint, typecheck, `test` e `test:int` verdes.

## Mapa de rotas ao final da fase

| Prefixo          | CORS             | Auth                 | Uso                                                          |
| ---------------- | ---------------- | -------------------- | ------------------------------------------------------------ |
| `/health/*`      | —                | —                    | Monitoramento                                                |
| `/api/public/*`  | `BOOKING_ORIGIN` | —                    | Catálogo, disponibilidade, agendamento, pedido de magic link |
| `/api/privacy/*` | `BOOKING_ORIGIN` | token de privacidade | Portal do titular                                            |
| `/api/admin/*`   | `ADMIN_ORIGIN`   | JWT de staff         | Gestão                                                       |

## Bibliotecas previstas (versão exata, ≥14 dias de publicação)

`@fastify/cookie` (11.x), `jose` (6.x), `fastify-type-provider-zod` (6.x — confirme se o peer
`@fastify/swagger` é opcional antes de instalar), `date-fns` (4.x) + `@date-fns/tz` (1.x).
Qualquer outra lib: justificar no resumo da tarefa.

---

## [x] 2.0 — Fundação de testes de integração e padrões HTTP

**Pré-requisito:** migration `init` gerada e commitada (`pnpm db:migrate --name init`).

1. **Testes de integração** em `apps/api/test/integration/**/*.int.test.ts`, com config
   Vitest separada (`vitest.int.config.ts`, `fileParallelism: false`).
   - Leem `TEST_DATABASE_URL` (banco `barber_test`). Sem ela, falham com mensagem clara.
   - Helper `resetDb()` apaga dados de todas as tabelas (respeitando FKs) antes de cada arquivo.
   - Helper de fábrica (`test/integration/factories.ts`): `createShop`, `createStaff`,
     `createService`… com dados mínimos.
   - Scripts: `test` (unit) e `test:int` no `apps/api` e na raiz.
   - `docker/mysql/init/01-users.sh`: cria também o banco `barber_test`. Documente no README o
     comando manual para quem já tem o volume criado.
   - CI: criar `barber_test`, rodar `migrate deploy` nele e executar `test:int`.
2. **Erros de domínio** em `src/infra/http/errors.ts`: `AppError` com `statusCode` e `code`
   (`NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `UNAUTHORIZED`, `VALIDATION`, `UNPROCESSABLE`).
   O error handler devolve `{ error: string, code: string, issues?: {path, message}[] }`.
   `issues` só para validação e só com caminho + mensagem (nunca o valor enviado).
3. **Zod no Fastify** (`fastify-type-provider-zod`): validação de body/query/params **e**
   serialização de resposta.
4. **CORS por escopo:** remover o CORS global; cada grupo de rotas registra o seu
   (tabela acima). Teste: origem do booking **não** recebe CORS em `/api/admin/*`.
5. **Composition root** `src/app/container.ts` e registro dos grupos de rotas por prefixo.
6. Tipo `DbTx` exportado de `infra/db.ts` (cliente de transação do Prisma).

**Aceite:** um teste de integração de exemplo grava e lê uma `Shop`; testes de CORS por escopo;
CI verde com MySQL.

---

## [ ] 2.1 — Autenticação do staff

Módulo `modules/auth`. **Pedir aprovação do plano antes de implementar.**

- **Migration** `staff_must_change_password`: coluna `mustChangePassword Boolean @default(false)`.
- `POST /api/admin/auth/login` `{ shopSlug, email, password }`
  - argon2 `verify`; se o usuário não existe ou está inativo, verificar contra um hash fixo
    para igualar o tempo. Resposta única de erro: 401 "E-mail ou senha inválidos."
  - Rate limit: 5/min por IP **e** 5/15min por `shopSlug+email`.
  - Retorna `{ accessToken, staff: { id, name, role, mustChangePassword } }`.
  - **Access token:** JWT HS256 (`jose`), 15 min, claims `sub`, `shopId`, `role`, `iss`, `aud`.
  - **Refresh token:** opaco (`generateToken`), 30 dias, salvo como `hashToken` em
    `staff_sessions`; cookie `httpOnly; Secure (prod); SameSite=Strict; Path=/api/admin/auth`.
- `POST /api/admin/auth/refresh`: rotação (revoga o atual, emite novo). Exige header
  `X-Requested-With: fetch` (defesa extra de CSRF). **Reuso** de token já revogado ⇒ revoga
  todas as sessões daquele staff e responde 401.
- `POST /api/admin/auth/logout`: revoga a sessão atual e limpa o cookie.
- `POST /api/admin/auth/password`: troca a própria senha (exige a atual; mínimo 10 caracteres;
  zera `mustChangePassword`; revoga as outras sessões).
- Plugins: `authenticate` (valida JWT, carrega `request.staff = { id, shopId, role }`) e
  `requireRole(...roles)`. Staff com `mustChangePassword` só acessa a troca de senha.
- Staff desativado: refresh falha e access token deixa de valer no próximo refresh.

**Testes:** login ok/erro sem enumeração; rate limit; rotação; detecção de reuso; logout;
token de outra loja não acessa nada; `mustChangePassword` bloqueia as demais rotas.

---

## [ ] 2.2 — Gestão da loja, equipe e catálogo (admin)

Módulos `modules/catalog` (serviços), `modules/staff` (equipe, vínculos, escalas) e
`modules/scheduling` (horário da loja e bloqueios — só CRUD nesta tarefa).

**Matriz de permissão**

| Recurso                                    | OWNER    | MANAGER           | BARBER         | FINANCE |
| ------------------------------------------ | -------- | ----------------- | -------------- | ------- |
| Dados da loja, horários de funcionamento   | ✏️       | ✏️                | 👁️             | 👁️      |
| Serviços                                   | ✏️       | ✏️                | 👁️             | 👁️      |
| Equipe (criar, desativar, papel, comissão) | ✏️       | ✏️ (exceto OWNER) | 👁️ básico      | 👁️      |
| Escala e bloqueios                         | ✏️ todos | ✏️ todos          | ✏️ os próprios | —       |
| Reset de senha de staff                    | ✏️       | ✏️ (exceto OWNER) | —              | —       |

- Nada é apagado se tiver agendamento: serviços e staff são **desativados** (`active=false`).
- Reset de senha gera senha temporária exibida **uma vez** e liga `mustChangePassword`.
- Validações: `openMin < closeMin`, sem sobreposição de faixas no mesmo dia, `weekday` 0–6,
  `priceCents ≥ 0`, `durationMin` múltiplo de `slotStepMin`, `commissionBps` 0–10000,
  bloqueio com `startsAt < endsAt`. Escala do barbeiro dentro do horário da loja.
- Respostas de staff **nunca** incluem `passwordHash`, `mfaSecretEnc` ou e-mail de terceiros
  para BARBER.

**Testes:** matriz de permissão (tabela-driven), isolamento entre lojas, validações.

---

## [ ] 2.3 — Motor de disponibilidade

`modules/scheduling/availability.rules.ts` — **função pura**, sem Prisma:

```ts
computeSlots(input: {
  timezone: string; date: string /* YYYY-MM-DD local */; now: Date;
  slotStepMin: number; bookingWindowDays: number; minNoticeMin: number;
  businessHours: { openMin: number; closeMin: number }[];      // do dia
  staffSchedule: { startMin: number; endMin: number }[];        // do dia
  blocks: { startsAt: Date; endsAt: Date }[];
  busy: { startsAt: Date; endsAt: Date }[];                     // agendamentos ativos
  durationMin: number; bufferMin: number;
}): Date[] // inícios em UTC
```

Regras: slot = interseção (loja ∩ escala) − bloqueios − ocupados; o atendimento inteiro
(duração + buffer) cabe na janela; terminar exatamente no fechamento é permitido; nada no
passado nem antes de `now + minNoticeMin` (por ora a constante
`MIN_BOOKING_NOTICE_MIN = 30`; vira configuração da loja na Fase 4); nada além de `bookingWindowDays`; conversão de fuso com
`@date-fns/tz`. Ocupados = status `SCHEDULED`, `CONFIRMED`, `IN_SERVICE`.

Endpoint `GET /api/public/shops/:slug/availability?staffId&serviceId&date` →
`{ date, timezone, slots: [{ startsAt, label: "14:30" }] }`. Duração/preço usam o override de
`staff_services` quando existir. Serviço que o barbeiro não faz ⇒ 404.

Também nesta tarefa: `GET /api/public/shops/:slug` → nome, serviços ativos
(`id, name, priceCents, durationMin`) e barbeiros ativos (`id, name, title, serviceIds`).
**Sem** e-mail, comissão ou dados internos.

**Testes unitários (mínimo):** almoço, buffer, bloqueio parcial e de dia inteiro, agendamento
existente, cancelado ignorado, fim no limite do fechamento, `now` no meio do dia, janela
máxima, dia sem expediente, turnos partidos, troca de mês, fuso `America/Sao_Paulo` e um
fuso com horário de verão (ex.: `America/New_York`) para provar que a conversão é genérica.

---

## [ ] 2.4 — Agendamento (o caso de uso crítico)

`modules/booking/booking.service.ts` — **única porta de escrita** de agendamentos (a Web agora,
o WhatsApp na Fase 3 e o admin usam o mesmo service). **Pedir aprovação do plano antes.**

`create({ shopId, staffId, serviceId, startsAt, client?, channel, consent })`, numa transação:

1. `SELECT id FROM staff WHERE id = ${staffId} AND shopId = ${shopId} FOR UPDATE` (tagged).
2. Staff ativo e faz o serviço; serviço ativo. Duração/preço/comissão vêm do banco.
3. `startsAt` precisa pertencer ao conjunto de `computeSlots` do dia (reaproveita 2.3 — evita
   reserva fora do expediente ou no meio de um slot).
4. Re-checa sobreposição com ocupados e bloqueios **dentro** do lock ⇒ senão `409 SLOT_TAKEN`.
5. Cliente: `normalizePhone` → `phoneHash` → busca na loja.
   - Novo cliente sem `consent.accepted === true` ⇒ `422 CONSENT_REQUIRED`.
   - Consentimento novo ⇒ `consentAt`, `remindersOptIn` conforme escolha e `privacy_logs`
     `CONSENT_GRANTED` com `policyVersion` da loja e `subjectHash = phoneHash`.
   - Nome do cliente existente é atualizado (o titular corrige o próprio dado).
6. Insere `appointments` com snapshots (`priceCents`, `commissionCents = round(price × bps / 10000)`).
7. Outbox na mesma transação: `booking.confirmation` (agora) e, se `remindersOptIn`,
   `booking.reminder` em `startsAt − reminderLeadMin` (se ainda for futuro).
   `dedupeKey = <tipo>:<appointmentId>`. Payload só com IDs.
8. **Duplo clique:** se o conflito for com agendamento ativo do **mesmo cliente** no mesmo
   horário/barbeiro, devolve o existente (200) em vez de 409.

Endpoints:

- `POST /api/public/shops/:slug/appointments` — rate limit 10/min por IP. Body:
  `{ staffId, serviceId, startsAt, client: { name, phone }, consent: { accepted, reminders } }`.
  Resposta sem telefone.
- `POST /api/admin/appointments` — canal `ADMIN`; cliente opcional (encaixe sem cadastro).
- `PATCH /api/admin/appointments/:id/status` — máquina de estados:
  `SCHEDULED → CONFIRMED | IN_SERVICE | CANCELLED | NO_SHOW`;
  `CONFIRMED → IN_SERVICE | CANCELLED | NO_SHOW`; `IN_SERVICE → COMPLETED`;
  `COMPLETED`, `CANCELLED`, `NO_SHOW` são finais. Grava `completedAt`/`cancelledAt`.
  BARBER só altera os próprios. Cancelamento remove jobs pendentes daquele agendamento.
- `PATCH /api/admin/appointments/:id/reschedule` — mesmo fluxo de lock, ignorando o próprio
  agendamento na checagem; reprograma o lembrete.
- `GET /api/admin/appointments?from&to&staffId` — agenda (BARBER: só a própria; FINANCE:
  sem nome/telefone de cliente). Intervalo máximo de 31 dias.

**Testes de integração obrigatórios:**

- **20 reservas simultâneas** no mesmo slot ⇒ exatamente 1 sucesso e 19 × 409.
- Reservas simultâneas em barbeiros diferentes **não** se bloqueiam.
- Serviço de 60 min às 15:00 bloqueia 15:30 (o bug do Jodi's).
- Preço enviado pelo cliente é ignorado; snapshot não muda quando o preço do serviço muda.
- Consentimento obrigatório e registrado; outbox criado na mesma transação (rollback ⇒ nada).
- Telefone em formatos diferentes ⇒ mesmo cliente. Isolamento entre lojas.

---

## [ ] 2.5 — Portal do titular (LGPD)

Módulo `modules/privacy`. **Pedir aprovação do plano antes.**

- `POST /api/public/privacy/request-link` `{ shopSlug, phone }` → **sempre** 202 com a mesma
  mensagem (não revela se o telefone existe). Se existir: `auth_tokens` `MAGIC_LINK` (15 min,
  só o hash) e job `privacy.magic_link` no outbox (envio real na Fase 3). Rate limit 3/15min
  por IP e por telefone.
- `POST /api/public/privacy/session` `{ token }` → token válido, não usado e não expirado ⇒
  marca `usedAt`, registra `DATA_VIEWED` e devolve JWT de privacidade (15 min, `aud`
  diferente do admin, claims `sub=clientId`, `shopId`).
- `GET /api/privacy/me` → nome, telefone (decifrado), datas de consentimento, preferências e
  histórico (data, serviço, barbeiro, status, valor).
- `GET /api/privacy/export` → o mesmo em JSON para download; registra `DATA_EXPORTED`.
- `PATCH /api/privacy/preferences` `{ reminders }` → atualiza `remindersOptIn`; ao desligar,
  registra `CONSENT_REVOKED` e remove lembretes pendentes.
- `DELETE /api/privacy/me` (rate limit 5/min) — **esquecimento**, numa transação:
  1. `privacy_logs` `ERASURE_COMPLETED` (com `subjectHash`, sem `clientId`);
  2. agendamentos futuros ativos do cliente ⇒ `CANCELLED`;
  3. jobs pendentes ligados ao cliente ou aos agendamentos dele ⇒ apagados;
  4. `whatsapp_sessions` com o mesmo `phoneHash` ⇒ apagadas;
  5. `DELETE` do cliente (tokens em cascata; `appointments.clientId` ⇒ `NULL`).
     Depois disso o token de privacidade não funciona mais.

**Testes:** sem enumeração, token de uso único, expiração, token de admin não serve no portal
(e vice-versa), export completo, esquecimento apaga tudo e preserva o financeiro anonimizado,
`privacy_logs` sem nome/telefone em nenhum caso.

---

## [ ] 2.6 — Worker do outbox

`src/worker.ts` (novo entry no `scripts/build.mjs`) + `modules/outbox`.

- Laço: em transação, `SELECT … WHERE status='PENDING' AND runAt <= NOW(3) ORDER BY runAt
LIMIT 10 FOR UPDATE SKIP LOCKED` ⇒ marca `RUNNING` + `lockedAt`; processa fora da transação.
- Sucesso ⇒ `DONE`. Erro ⇒ `attempts+1`, backoff exponencial (1, 2, 4, 8, 16 min) e `FAILED`
  após 5 tentativas; `lastError` sem dado pessoal.
- Jobs `RUNNING` com `lockedAt` > 5 min voltam para `PENDING` (worker caiu no meio).
- Polling: 1 s com trabalho, até 5 s ocioso. Shutdown gracioso em SIGTERM.
- Registry de handlers por `type`. Nesta fase os handlers de mensagem usam um
  `MessageSender` de interface única com implementação `LogOnlySender` (loga só o tipo e IDs).
  Antes de enviar, o handler confere se cliente e agendamento ainda existem e estão ativos —
  se não, conclui o job sem enviar.
- Limpeza diária (job recorrente): `auth_tokens` expirados, `whatsapp_inbound` > 30 dias,
  `whatsapp_sessions` expiradas, `outbox_jobs` `DONE` > 7 dias.
- Script `pnpm --filter @barber/api worker` (dev) e `start:worker` (prod).

**Testes:** dois workers concorrentes nunca pegam o mesmo job; retry/backoff; recuperação de
`RUNNING` órfão; job de cliente esquecido não envia.

---

## [ ] 2.7 — Fechamento da fase

- `README.md`: rotas da API (tabela curta por grupo), como rodar worker e testes de integração.
- ADR-004 (autenticação do staff) e ADR-005 (máquina de estados do agendamento).
- `docs/api/fase-2.http` com exemplos de chamadas (sem segredos reais).
- Rodar o `code-review` do projeto sobre o diff da fase e corrigir os achados críticos.
- Atualizar `CLAUDE.md` → "Estado atual" e marcar a fase como concluída aqui.
