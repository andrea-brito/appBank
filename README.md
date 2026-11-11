# appBank

App pessoal de finanças, **local-first** e **criptografado**. Registra lançamentos, controla orçamento por categoria, acompanha metas de economia e importa boleto, comprovante PIX e extrato OFX. Todos os dados ficam no aparelho: não há backend, conta de usuário nem sincronização.

> Status: projeto pessoal em desenvolvimento (v1.0.0, `private`). Android validado em emulador. iOS não foi testado (veja [Limitações](#limitações-conhecidas)).

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Scripts](#scripts)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Build com EAS](#build-com-eas)
- [Solução de problemas](#solução-de-problemas)
- [Limitações conhecidas](#limitações-conhecidas)
- [Documentação adicional](#documentação-adicional)

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Resumo** | Entradas, saídas e saldo do mês; lançamentos recentes; alertas de orçamento. |
| **Lançamentos** | Cadastro manual de despesa/receita com valor, descrição, categoria e data. |
| **Orçamento** | Limite mensal por categoria, com alerta em 70% (atenção) e acima de 100% (estourou). |
| **Metas** | Metas com valor-alvo e prazo opcional; depósitos e retiradas; meta mensal sugerida; alertas e marcos de progresso. |
| **Sugestão de economia** | Estimativa de quanto guardar por mês com base nos últimos 3 meses e na folga do orçamento. É heurística, não é recomendação financeira. |
| **Conquistas** | 5 selos calculados a partir do estado atual (nada é persistido). |
| **Importação** | Boleto bancário (linha digitável de 47 dígitos), texto de comprovante PIX e arquivo OFX. |
| **Segurança** | Banco SQLCipher, chave no Keychain/Keystore e bloqueio por biometria ou senha do aparelho. |

## Stack

- **Expo SDK 58**, React Native 0.88, React 19.3, TypeScript estrito
- **expo-router** (rotas por arquivo, `typedRoutes`)
- **expo-sqlite** com **SQLCipher** + **drizzle-orm** / **drizzle-kit**
- **expo-secure-store**, **expo-crypto**, **expo-local-authentication**
- **zod** (validação nas bordas), **date-fns** (períodos)

Versões exatas em [`package.json`](package.json).

## Como rodar

### Pré-requisitos

- Node.js LTS e npm
- Android Studio com um AVD criado (o `npm run emulator` espera `Medium_Phone_API_37.0`; ajuste em `package.json` se o seu tiver outro nome)
- `JAVA_HOME` e `ANDROID_HOME` configurados

### Primeira execução (Android)

```powershell
npm install
npm run emulator          # abre o emulador (aguarde o boot completo)
npx expo run:android      # gera ./android, compila e instala o app (10 a 15 min na primeira vez)
```

### Dia a dia

Com o app já instalado, só o Metro é necessário:

```powershell
npm run emulator
npm run start
```

Só rode `npx expo run:android` de novo se mudar algo nativo (plugins do `app.json`, dependências com código nativo, versão do SDK).

### Por que não funciona no Expo Go

O banco exige **SQLCipher**, que só existe em build próprio (`useSQLCipher: true` em `app.json`). No Expo Go o app recusa abrir, de propósito, para nunca gravar dados financeiros sem criptografia. Use sempre um **development build**.

### iPhone

O simulador de iOS só roda em macOS. Em um iPhone físico é preciso um development build via EAS (`eas build --profile development --platform ios`), que exige conta Apple Developer.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run start` | Metro em modo dev client. |
| `npm run android` | `expo run:android` (build nativo + instala). |
| `npm run ios` | `expo run:ios` (somente macOS). |
| `npm run emulator` | Abre o AVD `Medium_Phone_API_37.0`. |
| `npm test` | Roda todos os `src/**/*.test.ts`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint com `--max-warnings 0`. |

## Testes

Os testes são **auto-verificações executáveis**, sem framework. Cada arquivo roda sozinho, imprime `all checks passed` e sai com código diferente de zero se algo falhar.

```powershell
npm test                                  # todos os arquivos
npx tsx src/domain/money.test.ts          # um arquivo isolado
```

O CI (`.github/workflows/ci.yml`) roda `typecheck`, `lint` e `test` a cada push na `main` e em pull requests.

Cobertura atual: somente a camada `domain` (regras puras). `application`, `data`, `period`, `achievements`, `savingsSuggestion` e a UI não têm testes.

## Estrutura do projeto

```
src/
  app/            Telas e rotas (expo-router)
  components/     LockGate, ProgressBar
  application/    Casos de uso: validação (zod) + orquestração
  domain/         Regras de negócio puras (sem I/O) e seus testes
  data/           SQLite/drizzle, repositórios, auth, seed, picker de OFX
    db/           client, schema, secureKey, migrations
assets/           Ícones (atualmente placeholders)
docs/             Documentação de arquitetura
```

Detalhes e regras de dependência em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Banco de dados e migrations

As migrations são geradas a partir de `src/data/db/schema.ts` e embutidas no bundle como texto (`babel-plugin-inline-import` + `sourceExts` do Metro). São aplicadas no boot, depois do desbloqueio.

Depois de alterar o `schema.ts`:

```powershell
npx drizzle-kit generate
```

Isso cria um novo `.sql` e atualiza `migrations.js` e `meta/_journal.json` em `src/data/db/migrations/`. Faça commit dos três. Não existe script npm para isso.

## Build com EAS

Perfis em [`eas.json`](eas.json): `development` (dev client, APK), `preview` (interno, APK) e `production` (`autoIncrement`). O bundle id e o package são `com.appbank.financas`.

```powershell
eas build --profile development --platform android
```

## Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Tela branca ao abrir | Metro falhou ao montar o bundle. Olhe o terminal do Metro. | Veja as linhas abaixo. |
| `Cannot find module 'babel-preset-expo'` | Falta a devDependency (já declarada no `package.json`). | `npm install`; depois `npx expo start --dev-client -c`. |
| `ERESOLVE` ao instalar pacote | `react-dom` resolve para uma versão que exige outro `react`. | O `react-dom` está fixado em 19.3.0, igual ao `react`. Mantenha os dois na mesma versão. Evite `--legacy-peer-deps`: ele gera um lockfile que o `npm ci` rejeita. |
| `ConfigError: package.json ... does not exist` | Comando rodado fora da raiz do projeto. | Entre na pasta do projeto. |
| `Port 8081 is being used` | Metro antigo ainda rodando. | Encerre o processo que escuta na 8081 e suba de novo. |
| `Device emulator-5554 is in state offline` | Emulador ainda iniciando ou travado. | Aguarde o boot ou reinicie com `emulator -avd <nome> -no-snapshot`. |
| `You are passing an array of styles to a child of <Slot>` | `style={[...]}` dentro de `<Link asChild>`. | Use `StyleSheet.flatten([...])` no filho do Link. |
| `Erro ao preparar o banco: Failed to run the query 'CREATE TABLE ...'` | Banco criado parcialmente numa execução anterior. | Veja o aviso abaixo. |
| `Criptografia (SQLCipher) não está ativa` | Build sem SQLCipher (ex.: Expo Go). | Use um development build. |

> **Atenção:** a solução para o erro de migration em ambiente de teste é limpar os dados do app (`adb shell pm clear com.appbank.financas`). Isso **apaga o banco e a chave de criptografia, sem recuperação**. Não há backup nem exportação. Nunca faça isso com dados que você precise manter.

## Limitações conhecidas

- **Sem backup, exportação ou restauração.** Perder o aparelho, desinstalar o app ou limpar os dados perde tudo. A chave é `WHEN_UNLOCKED_THIS_DEVICE_ONLY` e não migra entre aparelhos.
- **Sem edição ou exclusão** de lançamentos pela UI, e sem CRUD de categorias (há 7 categorias fixas).
- **Boleto:** só bancário (47 dígitos). Concessionárias (iniciam em 8) são rejeitadas. Os dígitos verificadores não são validados. O fator de vencimento é ambíguo entre ciclos (reinicia em 1000 após 21/02/2025); o app escolhe a data mais próxima de hoje.
- **PIX:** heurística de texto (maior valor encontrado, primeira data, linha com "para/destinatário/favorecido"). O usuário confirma antes de salvar.
- **OFX:** importação sem categoria; deduplicação por `FITID` (ou chave sintética).
- Chaves estrangeiras: o código não executa `PRAGMA foreign_keys = ON`. Não foi verificado se o `expo-sqlite` já ativa por padrão, então o `ON DELETE CASCADE/SET NULL` não deve ser tomado como garantido.
- Não há `CHECK` no banco para `amount > 0`; a garantia é só da camada `application`.
- iOS não testado. O ícone e o splash são placeholders.
- Interface apenas em português (pt-BR) e moeda fixa em BRL.

## Documentação adicional

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): camadas, modelo de dados, fluxo de boot, segurança, regras de negócio e decisões de projeto.
