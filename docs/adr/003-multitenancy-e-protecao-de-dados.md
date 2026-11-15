# ADR-003: Multi-tenancy e proteção de dados pessoais

**Status:** Aceito · **Data:** 2026-11-14

## Contexto

Cada barbearia é _controladora_ dos dados dos seus clientes; o SaaS é _operador_.
A LGPD exige minimização, consentimento registrado e direito ao esquecimento.

## Decisão

1. **Tenant por coluna** (`shopId`) em todas as tabelas de negócio; todo repository
   filtra por ele. Cliente é por loja: o mesmo telefone em duas lojas são dois titulares.
2. **Telefone:** `phoneEnc` (AES-256-GCM, AAD = `shopId`) + `phoneHash`
   (HMAC-SHA256 com pepper e `shopId`). Busca pelo hash; exibição pelo ciphertext.
3. **Normalização E.164 única** (`@barber/contracts`), incluindo o nono dígito de
   celulares brasileiros que o WhatsApp ainda envia no formato antigo.
4. **Esquecimento = hard delete** do cliente; agendamentos ficam com `clientId = NULL`
   e o `privacy_logs` guarda só o hash como prova.
5. **Menor privilégio no banco:** `barber_app` (DML) para a API; `barber_migrator`
   (DDL) só para migrations.

## Consequências

- ✅ Vazamento do banco não expõe telefones; ciphertext copiado entre lojas não decifra.
- ✅ Uma falha de SQL injection na API não consegue apagar tabelas.
- ⚠️ Não dá para buscar cliente por "parte" do telefone — só pelo número completo.
- ⚠️ Perder `PHONE_ENC_KEY` = perder os telefones. A chave precisa de backup fora da VPS.
- 🔁 Rotação de chave: o byte de versão no ciphertext já permite convivência de chaves.
- 🔁 Backups mantêm dados apagados até expirarem — o termo de privacidade informa o prazo.
