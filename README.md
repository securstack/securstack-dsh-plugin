<p align="center">
  <img src="https://repository-images.githubusercontent.com/1333500201/8b9a7555-20b6-4863-acc9-0d7c6de1c1ed" alt="SecurStack DeepSeek Harness Plugin" width="100%">
</p>

# SecurStack DeepSeek Harness Plugin

<p align="center">
  <a href="https://github.com/topics/sast"><img src="https://img.shields.io/badge/SAST-static%20analysis-35D8FF?style=flat-square" alt="SAST"></a>
  <a href="https://github.com/topics/sca"><img src="https://img.shields.io/badge/SCA-dependencies-7CFF9B?style=flat-square" alt="SCA"></a>
  <a href="https://github.com/topics/dast"><img src="https://img.shields.io/badge/DAST-dynamic%20testing-FFD166?style=flat-square" alt="DAST"></a>
  <a href="https://github.com/topics/secrets"><img src="https://img.shields.io/badge/Secrets-detection-FF7468?style=flat-square" alt="Secrets detection"></a>
  <a href="https://github.com/topics/iac"><img src="https://img.shields.io/badge/IaC-security-1AA7FF?style=flat-square" alt="IaC security"></a>
  <a href="https://github.com/topics/policy-as-code"><img src="https://img.shields.io/badge/Policy-as--code-15C778?style=flat-square" alt="Policy as code"></a>
</p>

DeepSeek Harness plugin for running SecurStack security checks directly from an AI-agent workflow.

The plugin registers safe, non-destructive Harness tools that call the official `securstack` CLI to scan repositories, return structured JSON results, run environment diagnostics, and evaluate scan output against repository policy gates. It lets DeepSeek Harness ask SecurStack what is risky, what is misconfigured, and whether a codebase passes policy without reimplementing SecurStack product logic inside the plugin.

This package is intentionally a thin adapter. It does not implement scan engines, encryption, upload logic, API contracts, or Shielding operations. Those responsibilities stay in `@securstack/cli` and the SecurStack SaaS.

## Capabilities

- Repository security scans via `securstack scan --format json`.
- Policy gates for CI-like pass/fail decisions with `securstack policy check`.
- Local setup and credential diagnostics through `securstack doctor`.
- Harness-friendly tool responses with parsed JSON where the CLI promises JSON output.
- Existing SecurStack authentication through `securstack login`, `SECURSTACK_API_KEY`, and `SECURSTACK_API_URL`.
- Adapter-only design that avoids destructive hooks, Shielding writes, or duplicated product contracts in v1.

## Security Coverage

SecurStack coverage is represented through the CLI contract exposed to Harness, including SAST-style code analysis, SCA dependency checks, secrets detection, IaC/security configuration review, policy-as-code gates, and CLI diagnostics. DAST-oriented workflows can be surfaced through SecurStack scan output and policy checks when supported by the configured SecurStack project.

## Requirements

- Node.js 20 or newer.
- DeepSeek Harness developer preview.
- SecurStack credentials configured with either:
  - `securstack login --api-key <key>`
  - `SECURSTACK_API_KEY` and optional `SECURSTACK_API_URL`

## Install

```bash
dsh plugin --profile securstack add @securstack/dsh-plugin
dsh --profile securstack
```

## Tools

- `securstack_scan`: runs `securstack scan --format json` for a repository path.
- `securstack_doctor`: runs `securstack doctor`.
- `securstack_policy_check`: runs `securstack policy check --input <scan.json>` with optional risk and severity limits.

## Examples

Ask DeepSeek Harness:

```text
Run a SecurStack scan on this repository and summarize critical findings.
```

```text
Check whether the last SecurStack scan passes the repository policy.
```

```text
Run SecurStack doctor and tell me what is misconfigured.
```

## Development

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

## License

MIT
