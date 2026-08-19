import { createHash } from 'node:crypto'
import { accessSync, chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export const managedCliVersion = '0.2.0'

type Artifact = {
  file: string
  url: string
  sha256: string
  size: number
}

type ReleaseManifest = {
  version: string
  artifacts: Record<string, Artifact>
}

type ResolverOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  arch?: string
  home?: string
  fetcher?: typeof fetch
}

let pendingInstall: Promise<string> | undefined

export async function resolveCliExecutable(options: ResolverOptions = {}): Promise<string> {
  const env = options.env ?? process.env
  if (env.SECURSTACK_CLI_PATH) return env.SECURSTACK_CLI_PATH

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const pathMatch = findOnPath(platform, env)
  if (pathMatch) return pathMatch

  const version = env.SECURSTACK_CLI_VERSION || managedCliVersion
  const executable = managedCliPath(version, platform, options.home ?? homedir())
  if (isExecutable(executable, platform)) return executable

  pendingInstall ??= installManagedCli({ ...options, env, platform, arch, home: options.home ?? homedir() })
    .finally(() => { pendingInstall = undefined })
  return pendingInstall
}

export function platformArtifactKey(platform: NodeJS.Platform, arch: string): string {
  const normalizedPlatform = platform === 'win32' ? 'windows' : platform
  if (!['darwin', 'linux', 'windows'].includes(normalizedPlatform)) {
    throw new Error(`SecurStack CLI does not support platform ${platform}`)
  }
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`SecurStack CLI does not support architecture ${arch}`)
  }
  return `${normalizedPlatform}-${arch}`
}

async function installManagedCli(options: Required<Pick<ResolverOptions, 'env' | 'platform' | 'arch' | 'home'>> & ResolverOptions): Promise<string> {
  const version = options.env.SECURSTACK_CLI_VERSION || managedCliVersion
  const manifestUrl = options.env.SECURSTACK_CLI_MANIFEST_URL || `https://downloads.securstack.io/cli/v${version}/manifest.json`
  const fetcher = options.fetcher ?? fetch
  const manifestResponse = await fetcher(manifestUrl)
  if (!manifestResponse.ok) throw new Error(`Unable to download SecurStack CLI manifest (${manifestResponse.status}) from ${manifestUrl}`)
  const manifest = await manifestResponse.json() as ReleaseManifest
  if (manifest.version !== version) throw new Error(`SecurStack CLI manifest version mismatch: expected ${version}, received ${manifest.version}`)

  const key = platformArtifactKey(options.platform, options.arch)
  const artifact = manifest.artifacts[key]
  if (!artifact) throw new Error(`SecurStack CLI release ${version} does not contain ${key}`)
  const binaryResponse = await fetcher(artifact.url)
  if (!binaryResponse.ok) throw new Error(`Unable to download SecurStack CLI binary (${binaryResponse.status}) from ${artifact.url}`)
  const bytes = Buffer.from(await binaryResponse.arrayBuffer())
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== artifact.sha256.toLowerCase()) throw new Error(`SecurStack CLI checksum verification failed for ${artifact.file}`)

  const executable = managedCliPath(version, options.platform, options.home)
  mkdirSync(join(options.home, '.securstack', 'bin', version), { recursive: true })
  const temporary = `${executable}.${process.pid}.tmp`
  writeFileSync(temporary, bytes, { mode: 0o755 })
  if (options.platform !== 'win32') chmodSync(temporary, 0o755)
  rmSync(executable, { force: true })
  renameSync(temporary, executable)
  return executable
}

function managedCliPath(version: string, platform: NodeJS.Platform, home: string): string {
  return join(home, '.securstack', 'bin', version, platform === 'win32' ? 'securstack.exe' : 'securstack')
}

function findOnPath(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = env.PATH || env.Path || env.path
  if (!pathValue) return undefined
  const names = platform === 'win32' ? ['securstack.exe', 'securstack.cmd', 'securstack.bat'] : ['securstack']
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (isExecutable(candidate, platform)) return candidate
    }
  }
  return undefined
}

function isExecutable(path: string, platform: NodeJS.Platform): boolean {
  if (!existsSync(path)) return false
  try {
    accessSync(path, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}
