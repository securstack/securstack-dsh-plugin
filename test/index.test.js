import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { platformArtifactKey, registerSecurStackTools, resolveCliExecutable } from '../dist/index.mjs'

test('managed CLI maps supported operating systems and architectures', () => {
  assert.equal(platformArtifactKey('darwin', 'arm64'), 'darwin-arm64')
  assert.equal(platformArtifactKey('win32', 'x64'), 'windows-x64')
  assert.throws(() => platformArtifactKey('aix', 'x64'), /does not support platform/)
})

test('managed CLI downloads and verifies a missing binary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'securstack-dsh-cli-'))
  const binary = Buffer.from('standalone-cli')
  const sha256 = createHash('sha256').update(binary).digest('hex')
  const responses = [
    new Response(JSON.stringify({
      version: '0.2.0',
      artifacts: {
        'darwin-arm64': { file: 'securstack-darwin-arm64', url: 'https://downloads.example/cli', sha256, size: binary.length },
      },
    })),
    new Response(binary),
  ]

  try {
    const executable = await resolveCliExecutable({
      env: { PATH: '', SECURSTACK_CLI_MANIFEST_URL: 'https://downloads.example/manifest.json' },
      platform: 'darwin',
      arch: 'arm64',
      home: root,
      fetcher: async () => responses.shift(),
    })
    assert.equal(readFileSync(executable, 'utf8'), 'standalone-cli')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('securstack_scan runs the CLI with JSON output and parses findings', async () => {
  const calls = []
  const tools = toolRegistry()
  registerSecurStackTools({ tools }, async (args, options) => {
    calls.push({ args, options })
    return { code: 0, stdout: JSON.stringify({ status: 'completed', findings: [] }), stderr: '' }
  })

  const result = await tools.named.securstack_scan.execute({
    path: '/repo',
    engines: ['secrets', 'iac'],
    locale: 'pt-BR',
    uploadMode: 'json',
  })

  assert.deepEqual(result, { status: 'completed', findings: [] })
  assert.deepEqual(calls[0].args, [
    'scan',
    '--path',
    '/repo',
    '--format',
    'json',
    '--engine',
    'secrets',
    '--engine',
    'iac',
    '--locale',
    'pt-BR',
    '--upload-mode',
    'json',
  ])
  assert.equal(calls[0].options.cwd, '/repo')
})

test('securstack_doctor returns trimmed stdout and stderr', async () => {
  const tools = toolRegistry()
  registerSecurStackTools({ tools }, async () => ({
    code: 0,
    stdout: ' SecurStack CLI ready \n',
    stderr: ' warning \n',
  }))

  const result = await tools.named.securstack_doctor.execute({})

  assert.deepEqual(result, {
    stdout: 'SecurStack CLI ready',
    stderr: 'warning',
  })
})

test('securstack_policy_check parses JSON even when policy fails with exit code 1', async () => {
  const calls = []
  const tools = toolRegistry()
  registerSecurStackTools({ tools }, async (args) => {
    calls.push(args)
    return { code: 1, stdout: JSON.stringify({ allowed: false, violations: ['risk'] }), stderr: '' }
  })

  const result = await tools.named.securstack_policy_check.execute({
    input: '/repo/scan.json',
    maxRiskScore: 7.5,
    maxCritical: 0,
  })

  assert.equal(result.allowed, false)
  assert.deepEqual(calls[0], [
    'policy',
    'check',
    '--input',
    '/repo/scan.json',
    '--max-risk-score',
    '7.5',
    '--max-critical',
    '0',
  ])
})

test('non-zero CLI exit raises an actionable tool error', async () => {
  const tools = toolRegistry()
  registerSecurStackTools({ tools }, async () => ({ code: 127, stdout: '', stderr: 'securstack not found' }))

  await assert.rejects(
    tools.named.securstack_scan.execute({ path: '/repo' }),
    /securstack scan --path \/repo --format json failed: securstack not found/,
  )
})

test('invalid JSON raises an actionable parser error', async () => {
  const tools = toolRegistry()
  registerSecurStackTools({ tools }, async () => ({ code: 0, stdout: 'not json', stderr: '' }))

  await assert.rejects(
    tools.named.securstack_scan.execute({ path: '/repo' }),
    /did not return valid JSON/,
  )
})

function toolRegistry() {
  const registry = {
    named: {},
    register(tool) {
      this.named[tool.name] = tool
    },
  }
  return registry
}
