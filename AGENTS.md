# AGENTS.md

Instrucoes para agentes trabalhando no `securstack-dsh-plugin`.

## Papel do repositorio

`securstack-dsh-plugin` e um adaptador publico para DeepSeek Harness. Ele registra tools que chamam o SecurStack CLI oficial.

## Regras de escopo

- Nao implemente logica de produto neste repositorio.
- Nao copie codigo de `securstack-cli`, `securstack-core`, `securstack-api`, `securstack-workers` ou plugins de IDE.
- Execute o SecurStack CLI por subprocesso; nao importe modulos internos do SecurStack.
- Nao aceite API keys como argumentos de tools. Use `securstack login` ou variaveis de ambiente.
- No v1, nao registre tools destrutivas como instalacao de hooks ou comandos Shielding write.

## Padroes esperados

- Tools devem retornar erros acionaveis quando o CLI falhar.
- Saidas JSON do CLI devem ser parseadas antes de retornar ao Harness.
- Testes devem mockar o subprocesso do CLI.
- O pacote deve continuar instalavel via `dsh plugin add`.

## Release e publicacao

- Consulte `docs/release.md` antes de preparar ou publicar uma versao.
- A fonte operacional complementar e `../securstack-infra/docs/deepseek-harness-plugin.md`.
- Publicacoes npm de `@securstack/dsh-plugin` devem autenticar exclusivamente como o usuario npm `securstack`. Execute `npm whoami --registry https://registry.npmjs.org/` e interrompa se a saida nao for exatamente `securstack`.
- Pushes para o remote publico `github` devem autenticar como a conta GitHub `securstack`. Nao use uma conta pessoal e nunca persista PAT em arquivos, docs, scripts ou URLs de remote.
- O remote `origin` (Bitbucket) continua sendo o caminho normal de commit e push local; o remote `github` e a distribuicao publica.
- Antes de publicar, rode `npm run typecheck`, `npm test` e `npm pack --dry-run`.
- `@deepseek-ai/dsh-tools` e dependencia peer do runtime do Harness. Nao a mova para `dependencies`, pois uma copia privada pode quebrar o scheduler de tools do DSH Desktop.
