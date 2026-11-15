---
description: Executa uma tarefa do plano da fase atual seguindo as políticas do projeto
argument-hint: "<número da tarefa, ex.: 2.1>"
---

Execute a tarefa **$ARGUMENTS** de `docs/plans/fase-2-core-api.md`.

1. Leia SOMENTE a seção da tarefa $ARGUMENTS no plano e os arquivos que ela menciona.
   Consulte `docs/policies/` apenas se a tarefa tocar no assunto da política.
2. Confirme que as tarefas anteriores estão marcadas como concluídas. Se não estiverem, pare e avise.
3. Apresente um plano curto: arquivos a criar/alterar, migrations, dependências novas
   (com versão exata) e testes. Se a tarefa pedir aprovação, ESPERE minha resposta.
4. Implemente seguindo o `CLAUDE.md` (arquitetura, segurança, LGPD, convenções).
5. Rode `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm test:int`
   e corrija até ficar tudo verde.
6. Marque o checkbox da tarefa no plano.
7. Termine com um resumo de no máximo 8 linhas e uma sugestão de mensagem de commit.
   Não faça commit nem push.
