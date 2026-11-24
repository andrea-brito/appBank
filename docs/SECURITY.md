# Segurança do appBank (versão web)

Análise feita em 12/11/2026 sobre a branch `feature/web-pwa` e o ambiente publicado (<https://appbank-omega.vercel.app>, projeto Supabase `sfbhqmkueejfguivltil`). O desenho está em [`ARCHITECTURE.md`](ARCHITECTURE.md#5-segurança).

## Modelo de ameaça

Uma usuária, dados financeiros pessoais. O que proteger, em ordem:

1. **Confidencialidade** dos valores, descrições e categorias, inclusive contra o próprio servidor.
2. **Disponibilidade:** não perder dados (erro, aparelho perdido, senha esquecida).
3. **Integridade:** ninguém altera os dados sem ser detectado.

Quem pode atacar:
- **Vazamento ou acesso indevido ao Supabase:** o banco do servidor é copiado.
- **Código malicioso servido pelo site:** a conta do GitHub ou da Vercel é invadida, ou uma dependência é comprometida. É o ataque mais perigoso, porque o código roda onde a chave existe.
- **Alguém com o celular desbloqueado.**
- **Alguém na internet** que descobre a URL.

## O que foi verificado

| Item | Como | Resultado |
| --- | --- | --- |
| Visitante sem login lê a tabela | `GET /rest/v1/vaults` com a chave pública | ✅ `permission denied` |
| RLS por usuário | `supabase/schema.sql` | ✅ `using` + `with check` em `auth.uid()`; `delete` revogado |
| Servidor não vê texto em claro | Teste de navegador inspecionando tudo o que foi enviado | ✅ Só blobs cifrados e a senha de login derivada; nada de valores, descrições, senha ou chave de recuperação |
| Senha errada, adulteração, troca de blob | `vault.test.ts` | ✅ Rejeitados |
| Segredos no repositório | `git grep` por `service_role`, `sb_secret`, JWT | ✅ Nenhum; `.env` fora do Git |
| HTML injetado / `eval` | `git grep` por `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` | ✅ Nenhum uso; texto de OFX/PIX é exibido como texto pelo React |
| Source maps públicos | Bundle publicado | ✅ Não publicados |
| Cabeçalhos | `curl -I` no site | ✅ HSTS, `nosniff`, `no-referrer`, `noindex`, COOP/COEP, **CSP**, `X-Frame-Options`, `Permissions-Policy` (ver item 3) |
| Cadastro aberto | `GET /auth/v1/settings` | ❌ `disable_signup = false` |
| Dependências | `npm audit --omit=dev` | ⚠️ 5 moderadas (`glob`/`minimatch` no `@expo/cli`), só em ferramentas de build, não chegam ao navegador |

## Riscos e melhorias, por prioridade

### 1. Cadastro de novas contas está aberto (alta, 1 minuto)

Qualquer pessoa com a URL pode criar uma conta no seu projeto. Ela **não** consegue ler os seus dados (RLS e criptografia), mas pode gravar até 20 MB por conta e esgotar o plano gratuito (500 MB de banco), derrubando o app para você.

**Correção:** Supabase → Authentication → Sign In / Providers → desligar **"Allow new users to sign up"**.

### 2. Contas que publicam o site sem 2 fatores (alta, 10 minutos)

O maior risco real não é o Supabase vazar, é **alguém publicar código alterado**. Um push na `feature/web-pwa` vai ao ar sozinho. Um código malicioso rodaria no seu navegador depois da sua senha e poderia enviar a chave para fora. A criptografia de ponta a ponta não protege contra isso.

**Correção:**
- Ativar 2FA no **GitHub**, na **Vercel**, no **Supabase** e no **e-mail**. O e-mail é metade da recuperação de senha.
- Revisar o token pessoal do GitHub guardado no Windows: escopo mínimo e com validade.

### 3. ✅ Content-Security-Policy e bloqueio de *framing* (feito em 12/11/2026)

A CSP é a segunda barreira se algum dia aparecer código injetado (dependência comprometida, regressão futura): ele não roda e não consegue mandar dados para fora. `frame-ancestors 'none'` + `X-Frame-Options: DENY` impedem que outro site exiba o app num iframe para enganar cliques.

Política em produção (`vercel.json`):

| Diretiva | Valor | Por quê |
| --- | --- | --- |
| `default-src` | `'self'` | Base: só a própria origem. |
| `script-src` | `'self' 'wasm-unsafe-eval' 'sha256-…'` | Só scripts do próprio site. `wasm-unsafe-eval` é o mínimo para o SQLite em WebAssembly. O hash libera o **único** script inline que o Expo gera (`__EXPO_ROUTER_HYDRATE__`). Sem `unsafe-inline` e sem `unsafe-eval`. |
| `style-src` | `'self' 'unsafe-inline'` | O React Native Web injeta estilos em tempo de execução. Estilo inline não executa código. |
| `connect-src` | `'self'` + URL do Supabase | Únicos destinos de rede: bloqueia o envio de dados para outro lugar. |
| `worker-src` | `'self' blob:` | O banco cria o worker a partir de um `blob:`. Só um script já aprovado consegue criar esse blob. |
| `img-src` / `font-src` | `'self' data:` (+ `blob:` em img) | Ícones e emojis. |
| `frame-ancestors` | `'none'` | Ninguém embute o app. |
| `base-uri`, `form-action`, `object-src` | `'none'` | Fecha vetores clássicos de injeção. |
| `upgrade-insecure-requests` | | Qualquer `http://` vira `https://`. |

Junto: `Permissions-Policy` desliga câmera, microfone, geolocalização, pagamento e USB.

**Como foi verificado:**
- A CSP lida do próprio `vercel.json` foi testada no Chrome e no motor do Safari (WebKit). Os testes passaram por todas as telas e pelos fluxos principais: criar conta, lançar, parcelar, editar, histórico, backup, categorias, metas, conquistas, importar, recarregar e entrar, abrir `/month/...` direto e sair. **Zero violações** nos dois navegadores.
- Simulação de ataque: script inline injetado, `fetch` e imagem para outro domínio e `eval` foram **todos bloqueados**. O iframe também foi bloqueado.
- O zod roda em modo `jitless` na web, para não testar `new Function` e não gerar avisos falsos de violação.

**Manutenção:** o hash depende do que o Expo gera. `scripts/check-csp.mjs` roda no build da Vercel (`buildCommand`) e **falha o deploy** se algum script inline não estiver liberado na CSP, já mostrando o hash certo para colar. A CSP não vale no `npm run web` (desenvolvimento usa `eval` para recarregar o código), só no build de produção.

### 4. ✅ Custo do scrypt da conta (feito em 17/11/2026)

`ACCOUNT_KDF` passou para **N=2¹⁵, r=8, p=3**, uma das configurações da lista da OWASP para scrypt. Ela usa a **mesma memória** de antes (32 MB) e custa cerca de 3 vezes mais (333 ms → 711 ms num PC). As opções com N maior pedem 64 a 128 MB, o que arrisca o Safari do iPhone matar a aba.

**Migração transparente** (`unlockVault` + `migrateAccount`): o login tenta a configuração nova e, se o Supabase recusar, tenta a antiga (`LEGACY_ACCOUNT_KDF`). Na entrada com a antiga, a DEK é reembrulhada com a nova KEK (sem mudar os dados nem a versão) e depois a senha de login é trocada. Cada etapa é conferida a cada login, então uma migração interrompida termina na próxima entrada. Depois de migrar, o aparelho guarda um marcador sem segredo (`appbank_kdf_v2`) e deixa de tentar a configuração antiga, então uma senha errada custa uma derivação só.

Verificado com o build antigo e o novo contra o mesmo Supabase simulado: conta antiga entra e migra; os logins seguintes fazem uma tentativa só; senha errada é recusada; outro aparelho entra direto; migração interrompida (atualização do wrap recusada) entra mesmo assim e completa no login seguinte.

Ainda vale: o sal vem do e-mail, o que permite pré-cálculo por e-mail. A senha mínima de 12 caracteres e o custo maior reduzem esse risco.

<details><summary>Análise original</summary>

### 4. Custo do scrypt da conta abaixo do recomendado (média, meio dia)

O blob fica num servidor. Se ele vazar, um atacante pode testar senhas offline contra o `wrap_pass`. O custo atual (N=2¹⁵, r=8) está abaixo do mínimo da OWASP para scrypt (N=2¹⁷). Além disso, o sal vem do e-mail, então um atacante que conheça o e-mail pode **pré-calcular** palpites antes de um vazamento.

**Correção:**
- Subir para N=2¹⁷ e guardar os parâmetros do KDF na linha, para poder subir de novo no futuro.
- Migração transparente: no próximo login, a DEK é recifrada com a KEK nova e a senha de login é atualizada. Os dados não mudam.
- Custo: o login fica cerca de 4 vezes mais lento. Medir no iPhone antes.

A senha mínima de 12 caracteres já ajuda. Um medidor de força no cadastro também ajudaria.

</details>

### 5. Uma única versão no servidor (média, meio dia)

O servidor guarda só a versão mais recente. Um erro seu (excluir a compra errada, restaurar por cima) ou um bug que grave dados ruins vai para todos os aparelhos, sem volta. E o plano gratuito do Supabase não tem cópias de segurança.

**Correção:** tabela `vault_history` com as últimas N versões cifradas (por exemplo, 30 ou uma por dia), com RLS e opção "Voltar para uma versão anterior". Continua tudo cifrado. Enquanto isso não existir: **backup em arquivo uma vez por mês**.

### 6. Servidor pode devolver uma versão antiga (baixa, 1 hora)

O número da versão não faz parte da autenticação do blob. Um servidor malicioso poderia servir um estado antigo, válido e cifrado com a sua chave, e você não perceberia. Só importa se o próprio Supabase for o atacante.

**Correção:** incluir `user_id` e `version` no AAD do blob `data` e recusar versão menor que a última vista neste aparelho.

### 7. ✅ Chaves apagadas da memória após 15 minutos fora (feito em 17/11/2026)

Entre 1 e 15 minutos fora do app, o rebloqueio continua sendo só uma camada sobre a tela, pedindo a senha. A partir de **15 minutos** (`FORGET_AFTER_MS`), a página é recarregada (`forgetSession`): chaves, sessão do Supabase e banco descriptografado só existem em memória, então somem. A volta exige o login completo. Antes, o que estiver pendente é salvo. Se não der (sem internet), nada é apagado e vale o rebloqueio comum, porque uma mudança local nunca é descartada. Na tela de entrar, antes do primeiro login, nada acontece, para não apagar o que está sendo digitado nem um link de recuperação.

Verificado no navegador simulando o tempo fora: 30 s mantém aberto; 5 min pede senha com a memória mantida; 16 min apaga e volta ao login; 16 min com mudança feita offline não apaga e a mudança sobe depois; antes do login nada muda.

<details><summary>Análise original</summary>

### 7. Chaves continuam em memória durante o rebloqueio (baixa)

Depois de 1 minuto fora, o app pede a senha, mas a chave continua na memória da aba. Sem ferramentas de desenvolvedor, como no iPhone, isso não é explorável. Se quiser endurecer: depois de, por exemplo, 15 minutos fora, descartar as chaves e o banco da memória e exigir o login completo.

</details>

### 8. Site público (baixa, opcional)

Qualquer um com a URL baixa o app e vê a tela de login. O código não tem segredos e o login é limitado pelo Supabase, então o risco é baixo. A Vercel Authentication esconderia o site, mas exige login na Vercel em cada aparelho.

### 9. Processo (baixa)

- **CI fora do ar:** o workflow existe só localmente (token sem escopo `workflow`). Testes que não rodam sozinhos deixam passar regressões, inclusive de segurança.
- **Dependências:** as 5 vulnerabilidades moderadas são de ferramentas de build. Revisar ao atualizar o Expo SDK. Versões das bibliotecas de criptografia e do `supabase-js` estão fixadas.

### 10. Alerta de câmbio (adicionado em 13/11/2026)

O que foi decidido e verificado (função testada localmente no Deno contra um Supabase e um Resend simulados, com a cotação real):

- **`rate_alerts` fora da criptografia de ponta a ponta.** Guarda só a cotação escolhida, o alvo e os controles. A função precisa ler isso no servidor. O e-mail de destino vem do Auth, não da tabela.
- **Permissões por coluna:** o app não consegue forjar `last_notified_at`, `last_rate` nem `last_checked_at`.
- **Função pública sem JWT, protegida por segredo:** sem o `x-cron-secret` correto, responde **401** antes de ler qualquer dado (verificado). O segredo fica no Vault, não no `cron.job`.
- **Service role** só existe dentro da função (variável da plataforma). Nunca vai para o app nem para o repositório.
- **Sem dados pessoais nos logs:** verificado que o endereço de e-mail não aparece.
- **Abuso de e-mail limitado:** no máximo 1 e-mail a cada 20 horas por usuária. Com o cadastro desligado (item 1), só a sua conta existe.
- **CSP:** `connect-src` liberado só para `https://economia.awesomeapi.com.br`, além do site e do Supabase.

Risco residual: a AwesomeAPI é um serviço de terceiros. Uma cotação errada vinda dela geraria um aviso errado, e o e-mail lembra de conferir o valor antes de comprar. Ela não recebe nenhum dado seu.

### 11. Relatório exportado (CSV / PDF)
O arquivo gerado fica em claro no aparelho: é uma escolha sua, ao contrário do backup (cifrado). O CSV prefixa com apóstrofo células que começam com `=`, `+`, `-`, `@` (injeção de fórmula). O PDF vem de uma página HTML com texto escapado, impressa num `iframe` `srcdoc` que herda a CSP (sem scripts). Verificado no Chrome com os cabeçalhos reais do `vercel.json`: sem violações.

## Boas práticas para você

- Guarde a **chave de recuperação** num gerenciador de senhas ou impressa. Evite deixá-la na área de transferência ou num print na galeria.
- Use uma senha **longa** (uma frase), diferente de qualquer outra.
- Faça um **backup em arquivo** por mês e guarde-o fora do celular.
- Use o **"Sair"** em computadores que não são seus.

## Ordem sugerida

1. Desligar o cadastro (item 1) e ativar 2FA nas contas (item 2): só configuração, hoje.
2. ~~CSP e anti-*framing* (item 3)~~ feito.
3. ~~KDF mais forte (item 4)~~ e ~~chaves apagadas da memória (item 7)~~ feitos. Falta o histórico de versões (item 5).
4. Rodar supabase/hardening.sql e conferir o diagnóstico (seção abaixo).
5. Itens 6, 8 e 9 quando sobrar tempo.

## Falhas conhecidas do Supabase: situação neste projeto

Auditoria feita com a chave pública (anon) contra o projeto real. Fontes: [checklist de produção](https://supabase.com/docs/guides/security/production-checklist) e [segurança de npm](https://supabase.com/docs/guides/security/npm-security) do Supabase.

| Risco conhecido | Situação | Ação |
|---|---|---|
| RLS desligado / tabelas expostas | Bloqueado (leitura, escrita e delete negados com 42501) | `supabase/hardening.sql` tem o diagnóstico |
| Cadastro aberto (achado mais comum) | **Aberto** | Dashboard: Authentication > Sign In / Providers > desligar "Allow new users to sign up" |
| Schemas `auth`/`vault`, GraphQL, login anônimo, endpoint admin | Bloqueados | Nada |
| Função de e-mail sem autenticação | Exige `x-cron-secret` (401 sem) | Nada |
| Segredo no bundle publicado | Nenhum (`sb_secret_` achado é só o prefixo checado pelo supabase-js) | Nada |
| Funções novas executáveis por anon | Padrão do Postgres | `hardening.sql` revoga o padrão |
| Blobs gigantes em `wrap_*` | Sem limite | `hardening.sql` limita a 512 caracteres |
| Cadeia de suprimentos npm | Assinaturas verificadas (`npm audit signatures`); versão do supabase-js fixa | Instalação com `--ignore-scripts` (`.npmrc` e `vercel.json`) |
| Conta Supabase/GitHub/Vercel sem 2FA | Depende de você | Ativar 2FA |

### Auditoria com a chave pública (17/11/2026)
Testes feitos como um atacante com só a URL e a chave `anon`, contra o projeto real:

| Teste | Resultado |
|---|---|
| Listar a API (OpenAPI) | Bloqueado ("Secret API key required") |
| Ler, inserir e apagar em `vaults` e `rate_alerts` | Bloqueado (42501) |
| Schemas `auth` e `vault` | Não expostos |
| Endpoint admin do Auth | 401 |
| GraphQL | Extensão desligada |
| Login anônimo | Desligado |
| Buckets do Storage | Nenhum |
| Função `rate-alert` sem segredo | 401 |
| Segredos no bundle publicado | Nenhum (o `sb_secret_` achado é só o prefixo checado pelo supabase-js) |
| **Cadastro de novas contas** | **Aberto: único achado, depende de você (item 1)** |

### O que foi alterado por causa disso
- **`supabase/hardening.sql`** (idempotente, rodar no SQL Editor): limita `wrap_pass` e `wrap_recovery` a 512 caracteres, remove o `EXECUTE` padrão de funções novas em `public` e traz consultas de diagnóstico (tabelas sem RLS, permissões do `anon`, funções executáveis pelo `anon`, políticas `using (true)`, tabelas no Realtime, extensões). O esperado é vazio em todas, exceto nas extensões.
- **Instalação sem scripts de pacotes:** `.npmrc` com `ignore-scripts=true` e `installCommand: npm ci --ignore-scripts` no `vercel.json`. Um pacote comprometido não executa código no build. Só o `esbuild` tem script de instalação, e o build web foi testado sem ele. `npm audit signatures`: 794 pacotes com assinatura verificada.
- **Tela padrão é o login**, não o cadastro, já que o cadastro será desligado.
- **Já existiam:** CSP e anti-*framing* (item 3), KDF reforçado com migração (item 4), chaves apagadas após 15 minutos (item 7), função de e-mail protegida por segredo (item 10), RLS e permissões por coluna.

### Configurações que só o painel resolve
- Desligar o cadastro (item 1) e ativar 2FA no GitHub, Vercel, Supabase e e-mail (item 2).
- Rodar o **Security Advisor** (Advisors) e ativar **Secure email change**.
- Ativar o **Dependabot** no GitHub.
- As chaves antigas `anon`/`service_role` (JWT) serão descontinuadas até o fim de 2026. O app já usa a chave nova (`sb_publishable_`). Antes de desativar as antigas, confirmar se a função `rate-alert` continua recebendo a chave de serviço.
- Opcional: limites de taxa e CAPTCHA no Auth, e SSL obrigatório.
