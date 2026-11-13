# ASC DESK

Player IPTV para Windows (M3U e servidor com login), irmão do ASC Play. Feito com Electron.

## Instalar

Baixe `ASC-DESK-Setup-x.y.z.exe` em **Releases** (lado direito da página do repositório) e execute. O instalador não pede administrador.

Sem certificado de assinatura, o Windows pode mostrar "O Windows protegeu seu PC": clique em **Mais informações → Executar assim mesmo**.

## Atualizações

- Ao abrir (e a cada 4 horas) o app consulta a Release mais recente. Se houver versão nova, mostra **Nova versão disponível** com o botão **Atualizar agora**.
- Também dá para conferir em **Ajustes → Verificar atualização**.
- Ele baixa, valida o arquivo (SHA-512) e reinicia já na versão nova. Listas e favoritos são mantidos.

## Gerar uma nova versão

Qualquer commit na branch `main` roda **Actions → Gerar instalador (Windows)**, que testa, compila e publica a Release `v1.0.N` com `latest.yml` (usado pela atualização). Também dá para rodar à mão em **Run workflow**.

### Assinar o programa (opcional, evita o aviso do SmartScreen)

Em **Settings → Secrets and variables → Actions** crie:

- `WIN_CSC_LINK`: certificado `.pfx` codificado em Base64 (ou link https para ele)
- `WIN_CSC_PASSWORD`: senha do certificado

O workflow assina sozinho quando os dois existem. Nunca envie o `.pfx` ao repositório.

## Atalhos

| Tecla | Ação |
|---|---|
| `/` ou `Ctrl+F` | Buscar |
| `Espaço` | Pausar / continuar |
| `F` ou duplo clique | Tela cheia |
| `M` | Mudo |
| `↑` `↓` ou roda do mouse | Volume |
| `←` `→` | -10 s / +10 s (filmes e séries) |
| `PageUp` `PageDown` | Próximo / anterior canal |
| `P` | Janela flutuante (imagem sobre imagem) |
| `Esc` | Voltar |

## Recursos

Listas M3U e Xtream (login), EPG, favoritos, continuar assistindo, controle parental, bloqueio por PIN, cofre criptografado (Windows DPAPI), vencimento com aviso, canais `.m3u8` e `.ts`, 4 cores de destaque discretas (azul-gelo por padrão).

## Segurança

- Dados sensíveis criptografados em AES-GCM; a chave fica protegida pelo Windows (DPAPI via `safeStorage`).
- A interface não acessa a rede sozinha: tudo passa por um proxy interno que só aceita `http/https` por GET e bloqueia o próprio computador e a rede local (checado na conexão, contra DNS rebinding).
- `contextIsolation`, `sandbox`, sem Node na interface, CSP restritiva, navegação externa bloqueada, uma única instância.
- HTTP puro é permitido porque muitos servidores IPTV só funcionam assim. Prefira HTTPS.

## Desenvolvimento

```
npm install
npm start        # abre o app
npm test         # testes do proxy
npm run test:ui  # teste de interface (precisa do Playwright)
npm run dist     # gera o instalador localmente em dist/
```
