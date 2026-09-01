# Seven ERP — Production Readiness

## Regra obrigatória: sem simulação

O Seven ERP não deve marcar uma integração como **ativa**, **autorizada**, **paga**, **liquidada**, **emitida** ou **sincronizada** quando a confirmação não tiver vindo da fonte responsável.

- Documento fiscal só é `authorized` depois de resposta do autorizador contendo protocolo/chave válidos.
- Cobrança bancária só é `registered/active` depois de confirmação do banco.
- Pagamento só é `settled` depois de retorno bancário/webhook/conciliação real.
- Integração externa só é `active` após chamada autenticada real.
- Recursos ainda não implementados retornam `implementation_required`; não existe resposta fake de sucesso.

## Estado desta branch

| Área | Estado | Comportamento real |
|---|---|---|
| Banco ERP / cadastros / OS / comercial / financeiro | Base existente | Persistência Drizzle/SQLite e sincronização existentes; sem seed obrigatório de demonstração |
| Cofre de certificado A1 | Operacional | PFX/P12 e senha armazenados localmente com `safeStorage` do Electron |
| NF-e/NFC-e — teste de autorizador | Implementado nesta branch | SOAP 4.00 real para `NFeStatusServico4` por HTTPS/mTLS usando A1 |
| NFS-e Nacional — conectividade | Implementado nesta branch | Requisição real, somente leitura, à SEFIN Nacional por HTTPS/mTLS; endpoints oficiais por ambiente |
| Banrisul OAuth2 | Existente e mantido | Solicitação real de Bearer Token ao endpoint configurado |
| Distribuição/Manifestação NF-e | Bloqueado até conclusão | Retorna `implementation_required`; não simula consulta por NSU |
| CT-e recebido | Bloqueado até conclusão | Retorna `implementation_required` |
| MDF-e recebido | Bloqueado até conclusão | Retorna `implementation_required` |
| BTG Banking | Bloqueado até conclusão | Não ativa até existir Authorization Code/consentimento/callback real |
| Parceiro de certificados | Bloqueado até credencial/API contratada | Não ativa apenas por preencher formulário |

## Próximos blocos para produção fiscal

1. Gerador fiscal canônico (NF-e 55/NFC-e 65) com regras tributárias e versão de leiaute explícita.
2. XML NF-e, assinatura XMLDSig com A1, validação XSD e envio para autorização.
3. Consulta de recibo/protocolo, rejeições, cancelamento, inutilização e contingência.
4. DPS/NFS-e Nacional: XML conforme XSD vigente, assinatura, GZip+Base64, `POST /nfse`, eventos e consulta.
5. Distribuição DFe por NSU e manifestação do destinatário, com controle de sequência e limites do autorizador.
6. CT-e/MDF-e recebidos com armazenamento do XML original, chave, NSU e auditoria.
7. Cobrança: criação real de boleto/Pix, idempotência, webhook, baixa e conciliação.
8. BTG: Authorization Code/PKCE, callback local seguro, renovação de token e consentimento.

## Requisitos para liberar produção de um cliente

- CNPJ/IE/IM e código IBGE conferidos.
- Regime tributário e parâmetros fiscais configurados por estabelecimento.
- Certificado A1 válido em cada computador emissor ou arquitetura de assinatura central definida.
- Credenciamento/habilitação na SEFAZ e no município/SEFIN aplicável.
- CSC configurado quando houver NFC-e.
- Séries, numeração e ambiente separados entre homologação e produção.
- Testes homologados com cenários de autorização e rejeição.
- Backup, auditoria, logs de integração e retenção do XML ativos.
- Nenhum segredo persistido no banco sincronizado em texto puro.

## Política de erro

Quando um provedor estiver indisponível, credenciais forem recusadas ou uma funcionalidade ainda não existir, o ERP deve exibir o erro real e preservar o documento em estado seguro/reprocessável. Nunca substituir falha externa por sucesso local.
