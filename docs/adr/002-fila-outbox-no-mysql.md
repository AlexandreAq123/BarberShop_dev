# ADR-002: Fila de jobs na própria base (transactional outbox)

**Status:** Aceito · **Data:** 2026-11-14

## Contexto

Envios de WhatsApp, lembretes e expurgos LGPD não podem travar a resposta HTTP
(política de arquitetura §5). Queremos começar com o mínimo de peças na VPS.

## Decisão

Tabela `outbox_jobs` no MySQL + processo `worker` no PM2. O job é inserido **na
mesma transação** do fato que o originou (ex.: agendamento criado). O worker
consome com `SELECT … FOR UPDATE SKIP LOCKED` (MySQL 8.0+ / MariaDB 10.6+).

## Opções consideradas

- **BullMQ + Redis:** mais recursos (retries, painel), mas um serviço a mais para
  operar e proteger; e o job pode se perder entre o commit e o `enqueue`.
- **Eventos em memória:** perde jobs a cada restart do PM2. Descartado.

## Consequências

- ✅ Nenhum job perdido: ou o agendamento e o job existem, ou nenhum dos dois.
- ✅ Payload guarda IDs, não telefones — se o cliente for esquecido, o job morre.
- ⚠️ Polling gera carga leve no banco (intervalo de ~1–2 s, índice `status, runAt`).
- 🔁 Migrar para BullMQ quando o volume passar de dezenas de jobs/segundo.
