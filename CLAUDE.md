# Taxonomia e Planejamento de Jornadas: Sistema de Barbearia SaaS

Este documento estabelece a padronização das jornadas dos usuários (Cliente e Barbeiro/Gestor) para orientar o desenvolvimento da plataforma. O objetivo é garantir uma arquitetura moderna, fluxos sem fricção (mobile-first) e total adequação às diretrizes de segurança e LGPD.

---

## 1. JORNADA DO CLIENTE (B2C)
**Foco:** Conversão rápida, zero fricção, confiança e controle de dados.

### Fase 1.0: Descoberta e Acesso
*   **1.1. Ponto de Entrada (Touchpoint):** Link recebido via WhatsApp, Bio do Instagram ou leitura de QR Code físico.
*   **1.2. Ação:** Cliente clica no link e abre o Web App Mobile ou envia mensagem diretamente no WhatsApp.
*   **1.3. Padronização Técnica:** Carregamento ultra-rápido (Single Page Application), sem necessidade de download nas lojas de app.

### Fase 2.0: Agendamento e Consentimento
*   **2.1. Fluxo Web Mobile:**
    *   2.1.1. Seleção de Profissional (Barbeiro).
    *   2.1.2. Seleção de Serviço (Corte, Barba, Combo).
    *   2.1.3. Seleção de Data e Horário (apenas slots disponíveis).
    *   2.1.4. Identificação (Nome e Telefone/WhatsApp).
*   **2.2. Fluxo via WhatsApp (Webhook):**
    *   2.2.1. Cliente envia: *"Quero cortar sexta às 15h com o João"*.
    *   2.2.2. Webhook faz o parse e interage para confirmar o serviço.
*   **2.3. Termos e LGPD (Fricção Positiva):** Checkbox obrigatório no primeiro acesso (Opt-in) para aceite de uso de dados e lembretes de agenda.

### Fase 3.0: Autenticação e Confirmação
*   **3.1. Autenticação:** Passwordless (Sem senha). O sistema envia um Magic Link ou OTP (One Time Password) via WhatsApp para validar a identidade do cliente caso ele precise alterar o agendamento.
*   **3.2. Confirmação:** Envio automático de mensagem no WhatsApp confirmando a reserva.

### Fase 4.0: Pós-Atendimento e Gestão de Privacidade (Self-Service)
*   **4.1. Lembrete:** Mensagem de lembrete x horas antes do serviço.
*   **4.2. Portal da Privacidade:** Link único onde o cliente acessa seu perfil.
    *   4.2.1. Histórico de agendamentos.
    *   4.2.2. **Botão de Direito ao Esquecimento:** Opção para deletar permanentemente seus dados do banco MySQL da Hostinger com um único clique.

---

## 2. JORNADA DO BARBEIRO / GESTOR (B2B)
**Foco:** Visão comercial clara, controle de agenda, análise financeira e facilidade de operação.

### Fase 1.0: Setup e Configuração (Onboarding)
*   **1.1. Configuração do Salão:** Definição de nome, endereço, horário de funcionamento e dias de folga.
*   **1.2. Gestão de Profissionais:** Cadastro de barbeiros, vinculação de serviços e tempos médios de atendimento.
*   **1.3. Segurança:** Autenticação forte para administradores, gestão de permissões (Dono vs. Barbeiro Funcionário).

### Fase 2.0: Gestão Diária (Painel de Controle)
*   **2.1. Visão de Agenda:** Interface em calendário (Diário/Semanal) com cores padronizadas (Agendado, Confirmado, Concluído, Cancelado, No-show).
*   **2.2. Ações Rápidas:** Bloqueio de horários (para pausas/almoço), reagendamento via "arrastar e soltar" (drag-and-drop).
*   **2.3. Sincronização:** Atualização em tempo real quando o Webhook do WhatsApp insere um novo agendamento.

### Fase 3.0: Execução e Checkout
*   **3.1. Status do Serviço:** Barbeiro marca o cliente como "Em atendimento".
*   **3.2. Fechamento:** Marcação de "Concluído" que dispara a contabilização financeira.

### Fase 4.0: Visão Comercial e Financeira (Budget)
*   **4.1. Dashboard Individual (Para o Barbeiro):** Faturamento do dia/mês, comissões acumuladas, total de clientes atendidos.
*   **4.2. Dashboard Global (Para o Gestor):** Faturamento total do salão, ranking de serviços mais vendidos, taxa de ociosidade, controle de repasses (budget) de cada profissional.

---

## 3. PADRÕES DE NOMENCLATURA E ARQUITETURA
Para garantir que o código reflita a jornada do usuário e seja facilmente mantido na Hostinger:

*   **Entidades do Banco de Dados (MySQL):**
    *   `users` (Clientes finais - foco em minimização de dados).
    *   `staff` (Barbeiros e administradores).
    *   `services` (Catálogo de cortes e valores).
    *   `appointments` (Agendamentos com relação a `users`, `staff` e `services`).
    *   `privacy_logs` (Registro de consentimento LGPD e exclusões).
*   **Módulos do Frontend:**
    *   `/booking` (Interface do cliente).
    *   `/admin` (Interface de gestão, protegida).
    *   `/privacy` (Portal de transparência do cliente).