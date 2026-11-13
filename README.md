# appBank

Aplicação **web** pessoal de finanças, com **criptografia de ponta a ponta**. Registra lançamentos (inclusive compras parceladas), controla orçamento por categoria, acompanha metas de economia, mostra o histórico mês a mês e ano a ano e importa boleto, comprovante PIX e extrato OFX.

Os dados são cifrados **no navegador** antes de ir para o servidor (Supabase). O servidor guarda só texto cifrado: nem ele consegue ler valores, descrições ou categorias. Você entra com e-mail e senha em qualquer aparelho e encontra os mesmos dados.

> **Status:** projeto pessoal (v1.0.0, `private`). Publicado em <https://appbank-omega.vercel.app> a partir da branch `feature/web-pwa`. Pensado para o celular (iPhone, via "Adicionar à Tela de Início") e também funciona no computador.
>
> **App nativo:** a versão original (Expo/React Native, local-first, SQLCipher e Face ID) continua na branch `main`. As duas versões compartilham as telas e as regras de negócio. O que muda na web fica em arquivos `*.web.ts(x)`. Veja [Web e nativo](#web-e-nativo).

## Sumário

- [Funcionalidades](#funcionalidades)
- [Como funciona a segurança](#como-funciona-a-segurança)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Configurar o Supabase](#configurar-o-supabase)
- [Publicar na Vercel](#publicar-na-vercel)
- [Usar no iPhone](#usar-no-iphone)
- [Scripts](#scripts)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Web e nativo](#web-e-nativo)
- [Backup em arquivo](#backup-em-arquivo)
- [Solução de problemas](#solução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Documentação adicional](#documentação-adicional)

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Conta** | Criar conta, entrar, sair e **recuperar a senha** com link por e-mail + chave de recuperação. Reabrir a página pede a senha de novo. |
| **Resumo** | Entradas, saídas e **disponível para gastar** do mês (entradas − gastos − o que foi para as metas). Aviso do que já está comprometido no mês que vem. Lançamentos recentes e alertas de orçamento. |
| **Lançamentos** | Despesa ou receita com valor, data, descrição e categoria. Tocar num lançamento abre a **edição**, de onde também dá para excluir. |
| **Compras parceladas** | De 2 a 48 parcelas, primeira neste mês ou no próximo. Os centavos que sobram vão para a primeira parcela, como na fatura. Numa parcela, descrição e categoria valem para a compra inteira, e excluir apaga todas as parcelas. |
| **Categorias** | 7 padrão, todas editáveis. Crie as suas com nome, emoji e cor. Excluir deixa os lançamentos como "Sem categoria". |
| **Orçamento** | Limite mensal por categoria, com alerta em 70% e acima de 100%. |
| **Metas** | Valor-alvo, início e fim (ou sem prazo), emoji e cor. Depósitos e retiradas, valor mensal sugerido, editar, arquivar e excluir. |
| **Histórico** | Visão por **mês** e por **ano**: entradas, saídas, quanto sobrou, quanto foi para metas, média de gasto, melhor e pior mês. Detalhe do mês com gastos por categoria e todos os lançamentos. Bloco **"Já comprometido"** com as parcelas futuras. |
| **Importação** | Boleto bancário (linha digitável de 47 dígitos), texto de comprovante PIX e arquivo OFX. |
| **Backup** | Arquivo cifrado com uma senha própria, no fim da aba Histórico. Serve para desfazer um erro ou como última saída se perder senha e chave de recuperação. |
| **Campos** | Valor e data com máscara enquanto digita (teclado numérico no celular). Textos limitados a 250 caracteres. |

## Como funciona a segurança

Resumo. O detalhe técnico está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#5-segurança).

- **Uma senha, duas chaves.** A senha passa por scrypt no navegador e vira duas coisas independentes: a senha de login enviada ao Supabase e a chave que abre os dados. A segunda nunca sai do aparelho.
- **Dados cifrados no navegador.** O banco inteiro (SQLite em memória) é cifrado com XChaCha20-Poly1305 a cada alteração e enviado como uma linha cifrada. O Supabase guarda só isso.
- **Chave de recuperação.** Ao criar a conta, o app mostra uma chave de 32 caracteres, **uma única vez**. Esqueceu a senha? Link por e-mail + chave de recuperação = nova senha, com os dados intactos. Perder **as duas** significa perder os dados, por desenho.
- **Isolamento no servidor.** A tabela `vaults` tem RLS: cada conta só alcança a própria linha. Visitante sem login não lê nada.
- **Nada fica salvo no aparelho**, além do último e-mail usado. Ao recarregar a página, a chave some da memória e a senha é pedida de novo.
- **Bloqueio por inatividade.** Fora do app por mais de 1 minuto, a senha é pedida de novo.

## Stack

- **Expo SDK 58** com **React Native Web** (export estático), React 19.3, TypeScript estrito
- **expo-router** (rotas por arquivo, `typedRoutes`)
- **expo-sqlite** (SQLite em WebAssembly, em memória) + **drizzle-orm** / **drizzle-kit**
- **Supabase** (`@supabase/supabase-js`, versão fixa): login e armazenamento da linha cifrada
- **@noble/ciphers** e **@noble/hashes**: XChaCha20-Poly1305, scrypt, HKDF, SHA-256 (JS puro, auditadas)
- **zod** (validação nas bordas), **date-fns** (períodos)
- Hospedagem: **Vercel** (estático)

Versões exatas em [`package.json`](package.json).

## Como rodar

Pré-requisito: Node.js LTS e npm.

```powershell
git switch feature/web-pwa
npm install
npm run web          # abre em http://localhost:8081
```

Antes, crie o `.env` na raiz (veja [Configurar o Supabase](#configurar-o-supabase)). O `.env` está no `.gitignore` e nunca deve ir para o Git.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Para ver o layout de celular no computador: F12 e depois Ctrl+Shift+M.

Para testar o build de produção localmente: `npx expo export -p web` gera a pasta `dist/`. Sirva-a com os mesmos cabeçalhos do `vercel.json` (`Cross-Origin-Embedder-Policy: require-corp` e `Cross-Origin-Opener-Policy: same-origin`). Sem eles, o banco não abre.

> Os dados no Supabase são os mesmos em `localhost` e na Vercel, porque a conta é a mesma. O `localhost` só muda o endereço para onde o link de recuperação de senha volta.

## Configurar o Supabase

Uma vez, num projeto novo (plano gratuito basta):

1. **SQL Editor:** rode [`supabase/schema.sql`](supabase/schema.sql). Ele cria a tabela `vaults`, a política RLS e as permissões.
2. **Authentication → Sign In / Providers:**
   - **Confirm email:** desligado.
   - Em **Email**, deixe **"Require current password when updating" desligado**. Na recuperação você não sabe a senha atual.
3. **Authentication → URL Configuration:**
   - **Site URL:** a URL de produção.
   - **Redirect URLs:** `https://SEU-SITE/**` e `http://localhost:8081/**`.
4. **Project Settings → API Keys:** copie a Project URL e a **publishable** (ou anon) key para o `.env` e para a Vercel.
5. **Depois de criar a sua conta:** desligue **"Allow new users to sign up"**. Assim ninguém mais cria conta no seu projeto.

> A publishable/anon key é feita para ficar no navegador. Quem protege os dados são a RLS e a criptografia. **Nunca** use a `secret`/`service_role` no app.

## Publicar na Vercel

- Projeto ligado ao repositório, com **Production Branch = `feature/web-pwa`**. Cada push nessa branch publica sozinho, em cerca de 2 a 3 minutos.
- **Environment Variables:** `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- O [`vercel.json`](vercel.json) define o build (`npx expo export -p web` + `scripts/check-csp.mjs`), a pasta (`dist`), os cabeçalhos de segurança (inclusive a CSP) e a reescrita de `/month/:key`.
- **Se o deploy falhar com "Inline scripts not allowed by the CSP"**, é porque uma atualização do Expo mudou o script inline. O erro mostra o hash novo: substitua o `sha256-...` em `script-src` no `vercel.json`.

## Usar no iPhone

1. Abra a URL no **Safari** e toque em Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia, com o ícone de cifrão.
2. Entre com e-mail e senha.
3. **Depois de uma atualização:** feche o app uma vez pela troca de apps. O iPhone mantém a página antiga em memória por dias.

O link de "Esqueci a senha" abre no Safari, não no atalho. Crie a nova senha por lá e depois entre normalmente pelo atalho.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run web` | Servidor de desenvolvimento web (Metro) com os cabeçalhos COOP/COEP. |
| `npm test` | Roda todos os `src/**/*.test.ts`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint com `--max-warnings 0`. |
| `npx expo export -p web` | Build de produção em `dist/` (o que a Vercel roda). |
| `npm run start` / `android` / `ios` / `emulator` | Fluxo do app nativo (ver branch `main`). |

## Testes

Auto-verificações executáveis, sem framework. Cada arquivo roda sozinho, imprime `all checks passed` e sai com código diferente de zero se algo falhar.

```powershell
npm test                                  # todos (12 arquivos)
npx tsx src/domain/vault.test.ts          # um arquivo isolado
```

Cobrem a camada `domain`: dinheiro e máscara de moeda, datas e máscara de data, parcelas, histórico mensal e anual, disponível, categorias, metas, orçamento, alertas, boleto, PIX, OFX, backup e a criptografia do cofre web (inclusive a recuperação). A interface foi testada à mão e com scripts de navegador (Playwright contra um Supabase simulado), que não ficam no repositório.

> **CI:** o workflow `.github/workflows/ci.yml` existe na branch local `feature/web-pwa-with-ci`, mas ainda não subiu: o token do GitHub não tem o escopo `workflow`. Rode `typecheck`, `lint` e `test` antes de cada push.

## Estrutura do projeto

```
src/
  app/            Telas e rotas (expo-router), compartilhadas com o nativo
  components/     LockGate(.web), PasswordInput, HeaderCancel (goBack), PwaHead, ProgressBar
  application/    Casos de uso: validação (zod) + orquestração
  domain/         Regras puras (sem I/O) e seus testes, incluindo vault.ts (cofre web)
  data/           drizzle, repositórios, seed, arquivos
    db/           client.ts (nativo), client.web.ts (web: Supabase + cofre), schema, migrations
  web/            memoryOnlyVFS.js (troca o armazenamento OPFS do expo-sqlite por memória)
public/           manifest.webmanifest e ícones do PWA
supabase/         schema.sql (tabela vaults + RLS)
docs/             Arquitetura
vercel.json       Build, cabeçalhos e reescritas da Vercel
```

## Web e nativo

O Metro escolhe `arquivo.web.ts` em vez de `arquivo.ts` quando o build é web:

| Responsabilidade | Nativo (`main`) | Web (`feature/web-pwa`) |
| --- | --- | --- |
| Banco | SQLite + SQLCipher no aparelho | SQLite em memória, cifrado e salvo no Supabase (`client.web.ts`) |
| Chave | Keychain/Keystore (`secureKey.ts`) | Derivada da senha, só em memória (`domain/vault.ts`) |
| Bloqueio | Face ID / senha do aparelho (`LockGate.tsx`) | E-mail + senha (`LockGate.web.tsx`) |
| Arquivos | `expo-file-system` | `<input type="file">` e folha de compartilhar (`*.web.ts`) |
| Conta | Não existe | Supabase Auth, com "Sair" (`session.web.ts`) |
| Backup | 💾 no Resumo | Fim da aba Histórico |

Telas, regras, parcelas, histórico, categorias e metas são o mesmo código nas duas versões.

## Backup em arquivo

No fim da aba **Histórico** → "Exportar ou restaurar backup". O arquivo `.appbank` é cifrado com uma senha própria (mínimo 8 caracteres). Restaurar **soma** os dados aos atuais, sem duplicar e sem apagar nada. Na web, o arquivo sai pela folha de compartilhar, de onde você pode salvar no iCloud Drive.

Por que manter, se os dados já estão no servidor:
- O servidor guarda só a **versão mais recente**: um erro seu (excluir ou editar errado) não tem volta.
- O plano gratuito do Supabase **não tem cópias de segurança**.
- Se você perder senha **e** chave de recuperação, o arquivo é a única saída.

Sugestão: exporte uma vez por mês. O formato está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#15-backup-em-arquivo).

## Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `Erro ao preparar o banco: Can't find variable: SharedArrayBuffer` (Safari) | Página sem isolamento de origem. | O servidor precisa enviar `COEP: require-corp` e `COOP: same-origin`. `credentialless` não funciona no Safari. |
| `Access Handles cannot be created...` | Build antigo, de antes do `memoryOnlyVFS.js`, aberto em mais de uma aba. | Feche todas as abas e o atalho; abra de novo. |
| Mudança feita no PC não aparece no celular | Página antiga congelada em segundo plano. | Saia do app e volte (ele busca no servidor) ou feche e abra. |
| "Seus dados foram alterados em outro aparelho" | Dois aparelhos salvaram ao mesmo tempo. | Recarregue; as mudanças desse aparelho depois do aviso não foram salvas. |
| "Sem conexão com o servidor" | Offline ou Supabase fora/pausado. | O app tenta de novo a cada 10 s. Projeto gratuito pausado: reative no painel ("Restore"). |
| Link de recuperação abre e "expirou" | Link usado ou vencido. | Peça outro em "Esqueci a senha". |
| Ícone antigo na aba | Cache do navegador. | Ctrl+F5 ou aba anônima. |
| Tela não fecha depois de salvar | Corrigido: `goBack()` cai na aba certa quando não há histórico. | Atualize o app. |
| `Failed to fetch` ao abrir uma tela | O servidor de desenvolvimento foi desligado com a aba aberta. | Rode `npm run web` de novo. |

## Limitações conhecidas

- **Recarregar pede a senha** sempre: a chave só existe em memória. Face ID (passkey com PRF) ou PIN por aparelho estão em estudo.
- **Precisa de internet** para abrir e salvar. Não há cache offline.
- **O banco inteiro é enviado a cada alteração** (centenas de KB). Suficiente para uso pessoal.
- **Uma consulta com mais de 1 MB** de resultado falha (limite do canal síncrono do `expo-sqlite` na web).
- **Sem histórico de versões no servidor:** só a mais recente. Use o backup em arquivo.
- **Dois aparelhos editando ao mesmo tempo:** o segundo a salvar recebe um aviso de conflito e não sobrescreve. Não há mesclagem automática.
- **Supabase gratuito pausa** após cerca de 7 dias sem acesso. Os dados não se perdem: reative no painel.
- **Envio de e-mail do Supabase** (plano gratuito) só entrega para membros da organização e com limite por hora. Basta para recuperar a própria conta.
- **Lançamentos futuros/recorrentes** não existem como funcionalidade própria. Hoje dá para lançar com data futura e usar parcelas.
- **Boleto:** só bancário (47 dígitos), sem validar dígitos verificadores. **PIX:** heurística com confirmação. **OFX:** importa sem categoria.
- Interface só em pt-BR e moeda fixa em BRL.

## Documentação adicional

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): camadas, boot, segurança, sincronização, modelo de dados, regras de negócio, decisões e dívida técnica.
- [`docs/SECURITY.md`](docs/SECURITY.md): análise de segurança da versão web, riscos e melhorias recomendadas.
