---
description: Revisão de segurança e arquitetura do diff atual contra as políticas do projeto
---

Revise `git diff` (e arquivos novos não rastreados) contra o `CLAUDE.md` e
`docs/policies/`. Não altere código; apenas relate.

Verifique, nesta ordem:

1. SQL cru não parametrizado, `$queryRawUnsafe`, filtro de `shopId` ausente.
2. Dados pessoais em log, em payload de job, em resposta sem schema ou para perfil FINANCE.
3. Segredos hardcoded ou variável nova fora de `infra/env.ts` / `.env.example`.
4. Preço, duração, comissão ou status vindos do cliente.
5. Condições de corrida, transações faltando, outbox fora da transação.
6. Módulo importando repository de outro módulo; arquivo acima de ~250 linhas.
7. Testes faltando para regra nova, isolamento entre lojas e casos de erro.

Responda em tabela: `# | arquivo:linha | problema | severidade (🔴/🟠/🟡) | correção sugerida`.
Termine com o veredito: aprovar / corrigir antes do commit.
