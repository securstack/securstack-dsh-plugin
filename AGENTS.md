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
