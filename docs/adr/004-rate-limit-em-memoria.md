# ADR-004: Rate limit com store em memória

**Status:** Aceito · **Data:** 2026-11-16

## Contexto

O `@fastify/rate-limit` protege login, troca de senha e (em breve) OTP contra força
bruta. Os contadores precisam ser vistos por **todas** as requisições que chegam à API;
se cada processo tiver os seus, o limite efetivo se multiplica pelo número de processos.

## Decisão

Usar o store padrão **em memória** e rodar a API no PM2 em modo **`fork` com 1
instância**. Atrás do Nginx, `TRUST_PROXY=1` para que a chave seja o IP real do cliente.

## Opções consideradas

- **Redis:** contadores compartilhados entre processos, mas um serviço a mais para
  operar e proteger na VPS — sem necessidade com o volume atual.
- **Tabela no MySQL:** compartilhada, mas soma escrita no banco a cada requisição.
- **PM2 `cluster`:** com store em memória, cada worker conta sozinho e o limite de
  login (5/min) vira 5 × N. Descartado enquanto o store for local.

## Consequências

- ✅ Zero dependência extra; limites exatos com um único processo.
- ⚠️ Contadores zeram a cada restart/deploy (aceitável: janelas de 1–15 min).
- ⚠️ Um único processo Node atende a API; escala vertical apenas.
- ⚠️ `TRUST_PROXY` só confia no `X-Forwarded-For` se o peer imediato for loopback
  (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`), o que pressupõe Nginx e API na mesma VPS. Se a
  API for para Docker, o peer vira o IP da bridge (ex.: `172.17.0.1`) e `trustProxyFn`
  (`infra/http/app.ts`) precisa aceitar esse endereço; caso contrário o IP volta a ser o
  do proxy, sem erro, e o rate limit vira global.
- 🔁 **Antes** de mudar o PM2 para `cluster` ou subir mais de uma instância, migrar o
  store do rate limit para Redis (ou equivalente compartilhado).
