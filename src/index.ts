import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { spawn } from 'node:child_process'
import { resolveCliExecutable } from './cli-manager.js'

export { managedCliVersion, platformArtifactKey, resolveCliExecutable } from './cli-manager.js'

export const name = 'securstack-dsh-plugin'
export const inject = ['tools']

type CliResult = {
  code: number
  stdout: string
  stderr: string
}

type RunCli = (args: string[], options?: { cwd?: string }) => Promise<CliResult>

export const defaultRunCli: RunCli = async (args, options = {}) => {
  const executable = await resolveCliExecutable()
  return new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.on('error', reject)
  child.on('close', (code) => {
    resolve({ code: code ?? 1, stdout, stderr })
  })
  })
}

export function apply(ctx: Context) {
  registerSecurStackTools(ctx, defaultRunCli)
}

export function registerSecurStackTools(ctx: Context, runCli: RunCli) {
  ctx.tools.register(defineTool({
    name: 'securstack_scan',
    description: 'Run a SecurStack repository scan with the official SecurStack CLI and return JSON findings.',
    parameters: {
      path: { type: 'string', description: 'Repository path to scan. Defaults to the current workspace directory.' },
      engines: { type: 'array', items: { type: 'string' }, description: 'Optional scan engines to enable, such as secrets, repo_health, or iac.' },
      locale: { type: 'string', description: 'Optional locale, such as en-US or pt-BR.' },
      uploadMode: { type: 'string', description: 'Optional upload mode: auto, json, or package.' },
      noWait: { type: 'boolean', description: 'Queue the scan and return without waiting for completion.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const scanPath = stringArg(args, 'path') || process.cwd()
      const cliArgs = ['scan', '--path', scanPath, '--format', 'json']
      for (const engine of stringArrayArg(args, 'engines')) cliArgs.push('--engine', engine)
      pushOptional(cliArgs, '--locale', stringArg(args, 'locale'))
      pushOptional(cliArgs, '--upload-mode', stringArg(args, 'uploadMode'))
      if (booleanArg(args, 'noWait')) cliArgs.push('--no-wait')
      return runJsonCommand(runCli, cliArgs, { cwd: scanPath })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'securstack_doctor',
    description: 'Run SecurStack CLI diagnostics and return the textual diagnostic output.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => renderJson(value),
    },
    async execute() {
      const result = await runCli(['doctor'], { cwd: process.cwd() })
      assertCliSuccess(result, ['doctor'])
      return trimResult(result)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'securstack_policy_check',
    description: 'Check a SecurStack scan JSON file against risk and severity policy limits.',
    parameters: {
      input: { type: 'string', required: true, description: 'Path to a SecurStack scan JSON file.' },
      maxRiskScore: { type: 'number', description: 'Maximum allowed risk score.' },
      maxCritical: { type: 'number', description: 'Maximum allowed critical findings.' },
      maxHigh: { type: 'number', description: 'Maximum allowed high findings.' },
      maxMedium: { type: 'number', description: 'Maximum allowed medium findings.' },
      maxLow: { type: 'number', description: 'Maximum allowed low findings.' },
    },
    output: jsonOutput(),
    async execute(args) {
      const input = requiredStringArg(args, 'input')
      const cliArgs = ['policy', 'check', '--input', input]
      pushOptionalNumber(cliArgs, '--max-risk-score', numberArg(args, 'maxRiskScore'))
      pushOptionalNumber(cliArgs, '--max-critical', numberArg(args, 'maxCritical'))
      pushOptionalNumber(cliArgs, '--max-high', numberArg(args, 'maxHigh'))
      pushOptionalNumber(cliArgs, '--max-medium', numberArg(args, 'maxMedium'))
      pushOptionalNumber(cliArgs, '--max-low', numberArg(args, 'maxLow'))
      return runJsonCommand(runCli, cliArgs, { cwd: process.cwd(), allowExitCodeOne: true })
    },
  }))
}

async function runJsonCommand(
  runCli: RunCli,
  args: string[],
  options: { cwd: string, allowExitCodeOne?: boolean },
): Promise<JsonValue> {
  const result = await runCli(args, { cwd: options.cwd })
  if (options.allowExitCodeOne && result.code === 1 && result.stdout.trim()) {
    return parseJsonOutput(result.stdout, args)
  }
  assertCliSuccess(result, args)
  return parseJsonOutput(result.stdout, args)
}

function assertCliSuccess(result: CliResult, args: string[]) {
  if (result.code === 0) return
  const command = `securstack ${args.join(' ')}`
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`
  throw new Error(`${command} failed: ${detail}`)
}

function parseJsonOutput(stdout: string, args: string[]): JsonValue {
  try {
    const value = JSON.parse(stdout)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('expected a JSON object')
    }
    return value as JsonValue
  } catch (error) {
    const command = `securstack ${args.join(' ')}`
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${command} did not return valid JSON: ${reason}`)
  }
}

function jsonOutput() {
  return {
    schema: { type: 'json' as const },
    render: (_args: unknown, value: unknown) => renderJson(value),
  }
}

function renderJson(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

function trimResult(result: CliResult) {
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

function pushOptional(args: string[], flag: string, value: string | undefined) {
  if (value) args.push(flag, value)
}

function pushOptionalNumber(args: string[], flag: string, value: number | undefined) {
  if (value !== undefined) args.push(flag, String(value))
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function requiredStringArg(args: Record<string, unknown>, key: string): string {
  const value = stringArg(args, key)
  if (!value) throw new Error(`Missing required argument: ${key}`)
  return value
}

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanArg(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true
}
