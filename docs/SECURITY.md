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
| Cabeçalhos | `curl -I` no site | ✅ HSTS, `nosniff`, `no-referrer`, `noindex`, COOP/COEP. ❌ Sem CSP e sem proteção contra *framing* |
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

### 3. Sem Content-Security-Policy e sem bloqueio de *framing* (média, ~1 hora com testes)

Hoje não há injeção de HTML no código, mas a CSP é a segunda barreira se aparecer uma (dependência comprometida, regressão futura). Ela impede o envio de dados para domínios fora da lista. `frame-ancestors 'none'` impede que outro site exiba o app num iframe para enganar cliques.

**Proposta** (no `vercel.json` e no `metro.config.js`):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' 'sha256-<hash do script inline de hidratação>';
style-src 'self' 'unsafe-inline';
connect-src 'self' https://sfbhqmkueejfguivltil.supabase.co;
img-src 'self' data: blob:;
worker-src 'self' blob:;
frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
```

E também `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

Pontos a testar antes de publicar: o Expo gera um `<script>` inline (`__EXPO_ROUTER_HYDRATE__`), que precisa do hash. O SQLite precisa de `'wasm-unsafe-eval'` para o WebAssembly. O React Native Web injeta estilos, daí o `'unsafe-inline'` só em `style-src`. Testar no Chrome e no Safari.

### 4. Custo do scrypt da conta abaixo do recomendado (média, meio dia)

O blob fica num servidor. Se ele vazar, um atacante pode testar senhas offline contra o `wrap_pass`. O custo atual (N=2¹⁵, r=8) está abaixo do mínimo da OWASP para scrypt (N=2¹⁷). Além disso, o sal vem do e-mail, então um atacante que conheça o e-mail pode **pré-calcular** palpites antes de um vazamento.

**Correção:**
- Subir para N=2¹⁷ e guardar os parâmetros do KDF na linha, para poder subir de novo no futuro.
- Migração transparente: no próximo login, a DEK é recifrada com a KEK nova e a senha de login é atualizada. Os dados não mudam.
- Custo: o login fica cerca de 4 vezes mais lento. Medir no iPhone antes.

A senha mínima de 12 caracteres já ajuda. Um medidor de força no cadastro também ajudaria.

### 5. Uma única versão no servidor (média, meio dia)

O servidor guarda só a versão mais recente. Um erro seu (excluir a compra errada, restaurar por cima) ou um bug que grave dados ruins vai para todos os aparelhos, sem volta. E o plano gratuito do Supabase não tem cópias de segurança.

**Correção:** tabela `vault_history` com as últimas N versões cifradas (por exemplo, 30 ou uma por dia), com RLS e opção "Voltar para uma versão anterior". Continua tudo cifrado. Enquanto isso não existir: **backup em arquivo uma vez por mês**.

### 6. Servidor pode devolver uma versão antiga (baixa, 1 hora)

O número da versão não faz parte da autenticação do blob. Um servidor malicioso poderia servir um estado antigo, válido e cifrado com a sua chave, e você não perceberia. Só importa se o próprio Supabase for o atacante.

**Correção:** incluir `user_id` e `version` no AAD do blob `data` e recusar versão menor que a última vista neste aparelho.

### 7. Chaves continuam em memória durante o rebloqueio (baixa)

Depois de 1 minuto fora, o app pede a senha, mas a chave continua na memória da aba. Sem ferramentas de desenvolvedor, como no iPhone, isso não é explorável. Se quiser endurecer: depois de, por exemplo, 15 minutos fora, descartar as chaves e o banco da memória e exigir o login completo.

### 8. Site público (baixa, opcional)

Qualquer um com a URL baixa o app e vê a tela de login. O código não tem segredos e o login é limitado pelo Supabase, então o risco é baixo. A Vercel Authentication esconderia o site, mas exige login na Vercel em cada aparelho.

### 9. Processo (baixa)

- **CI fora do ar:** o workflow existe só localmente (token sem escopo `workflow`). Testes que não rodam sozinhos deixam passar regressões, inclusive de segurança.
- **Dependências:** as 5 vulnerabilidades moderadas são de ferramentas de build. Revisar ao atualizar o Expo SDK. Versões das bibliotecas de criptografia e do `supabase-js` estão fixadas.

## Boas práticas para você

- Guarde a **chave de recuperação** num gerenciador de senhas ou impressa. Evite deixá-la na área de transferência ou num print na galeria.
- Use uma senha **longa** (uma frase), diferente de qualquer outra.
- Faça um **backup em arquivo** por mês e guarde-o fora do celular.
- Use o **"Sair"** em computadores que não são seus.

## Ordem sugerida

1. Desligar o cadastro (item 1) e ativar 2FA nas contas (item 2): só configuração, hoje.
2. CSP e anti-*framing* (item 3).
3. KDF mais forte (item 4) e histórico de versões (item 5).
4. Itens 6 a 9 quando sobrar tempo.
