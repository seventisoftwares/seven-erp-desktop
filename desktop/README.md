# Seven ERP Desktop 1.0

Cliente oficial do Seven ERP para Windows e macOS. O aplicativo usa a API Seven Cloud, mantém cache local e enfileira alterações quando a internet cai.

## Fluxo de ativação

1. No painel web do Seven ERP, abra **Dispositivos e sincronização**.
2. Clique em **Autorizar computador**.
3. Abra o aplicativo instalado e informe o nome do computador e o código de oito caracteres.
4. O token individual é protegido pelo armazenamento seguro do Windows/macOS.

## Comportamento offline

- Consultas já sincronizadas são lidas do cache local.
- Inclusões são guardadas em uma fila local atômica.
- Quando a conexão volta, a fila é reenviada com identificador idempotente.
- O servidor registra dispositivo, operação, cursor incremental e trilha de alterações.
- Um computador pode ser revogado a qualquer momento no painel web.

## Geração dos instaladores

- Windows x64: `npm run build:win`
- macOS Universal (Intel + Apple Silicon): `npm run build:mac`

O workflow `desktop-installers.yml` gera os dois pacotes em máquinas nativas. Para distribuição sem alertas do sistema, configure certificado Authenticode no Windows e Developer ID + notarização no macOS. Nenhum certificado ou senha deve ser salvo no repositório.

Ao publicar uma tag no formato `seven-erp-v*`, o GitHub cria automaticamente uma versão com o instalador `.exe`, o pacote `.dmg` e o `.zip` do macOS disponíveis para download no repositório.
