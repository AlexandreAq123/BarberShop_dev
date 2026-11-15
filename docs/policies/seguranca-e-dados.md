# Política de Segurança, Privacidade e Democratização de Dados

## 1. Visão Geral e Propósito

Esta política estabelece as diretrizes fundamentais para o Sistema de Agendamento de Barbearias (SaaS), garantindo que a plataforma opere sob os mais altos padrões de segurança cibernética e em total conformidade com a Lei Geral de Proteção de Dados (LGPD). 

Nosso compromisso é o "Privacy by Design" (Privacidade desde a concepção): a segurança e a transparência não são recursos adicionais, mas a base arquitetônica da aplicação.

## 2. Democratização de Dados e Transparência (LGPD)

O pilar da democratização visa dar ao usuário final (cliente da barbearia) total controle, visibilidade e autonomia sobre suas próprias informações.

*   **Minimização de Dados:** O sistema coletará estritamente os dados necessários para a prestação do serviço (Nome, Telefone/WhatsApp e Histórico de Agendamentos). Dados sensíveis não essenciais não serão solicitados ou armazenados.
*   **Consentimento Explícito (Opt-In):** No primeiro contato (via Web App ou WhatsApp), o usuário deverá fornecer consentimento claro e afirmativo para o armazenamento de seus dados e para o recebimento de notificações transacionais (lembretes de agenda).
*   **Portal de Transparência (Self-Service):** Todo cliente terá acesso a um link seguro (sem necessidade de criação de senhas complexas) onde poderá visualizar as informações que a plataforma possui sobre ele, incluindo seu histórico completo de interações.
*   **Direito ao Esquecimento:** No Portal de Transparência, haverá um botão claro e acessível para a exclusão definitiva dos dados. Ao acionar esta opção, o sistema executará um "Hard Delete" no banco de dados, removendo o vínculo entre o cliente e os agendamentos passados (anonimização para fins contábeis do salão).

## 3. Segurança Cibernética e Infraestrutura

Para garantir a integridade e confidencialidade dos dados armazenados na infraestrutura da Hostinger, as seguintes regras técnicas são mandatórias:

### 3.1. Proteção do Banco de Dados (MySQL)
*   **Prevenção a Injeção:** É terminantemente proibido o uso de queries SQL concatenadas cruas. Todas as interações com o banco de dados relacional MySQL na Hostinger devem ser feitas através de um ORM moderno (ex: Prisma, Drizzle) ou utilizando parametrização rigorosa (Prepared Statements) para neutralizar tentativas de SQL Injection.
*   **Isolamento:** As credenciais do banco de dados (usuário e senha) devem ter permissões limitadas apenas ao necessário para a execução da aplicação, isoladas via variáveis de ambiente (`.env`), sem exposição no código-fonte.

### 3.2. Proteção de Endpoints e Webhooks (WhatsApp)
*   **Validação de Origem:** O webhook responsável por receber mensagens do WhatsApp Business API verificará a assinatura digital e o token de validação de cada requisição. Requisições não autenticadas serão descartadas imediatamente (HTTP 401/403).
*   **Rate Limiting e Anti-DDoS:** Limites de requisições por IP e por número de telefone serão configurados na camada de rede/aplicação para evitar sobrecarga no servidor Hostinger (ataques de negação de serviço ou spam).

### 3.3. Autenticação e Criptografia
*   **Tráfego Seguro:** 100% da comunicação entre os clientes, barbeiros e o servidor ocorrerá sobre protocolo HTTPS, utilizando os certificados SSL/TLS fornecidos pela Hostinger.
*   **Autenticação do Cliente (Passwordless):** Para evitar o vazamento de senhas, clientes finais acessarão seus portais e confirmarão ações sensíveis via Token de Uso Único (OTP) ou Magic Links enviados exclusivamente para o WhatsApp cadastrado.
*   **Autenticação Administrativa (Barbeiros/Gestores):** Senhas de administradores e barbeiros serão armazenadas utilizando algoritmos de hash criptográfico de via única (ex: bcrypt ou Argon2) com *salt* dinâmico.

## 4. Gestão de Incidentes e Auditoria

*   **Logs de Privacidade (`privacy_logs`):** Todas as ações de consentimento, revogação de consentimento e solicitações de exclusão de dados serão auditadas e registradas com *timestamp* (data/hora), garantindo respaldo legal para o salão.
*   **Resposta a Incidentes:** Em caso de detecção de atividade anômala ou violação de dados, a plataforma bloqueará automaticamente o acesso suspeito e emitirá alertas para a administração técnica para mitigação imediata.

## 5. Papéis e Responsabilidades
*   **Controlador de Dados:** A Barbearia/Salão (define a finalidade do agendamento).
*   **Operador de Dados:** O Sistema SaaS (processa os dados com segurança na Hostinger conforme as diretrizes do Controlador).
*   **Titular dos Dados:** O Cliente Final (dono absoluto de suas informações).