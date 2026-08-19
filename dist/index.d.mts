import { Context } from "@deepseek-ai/cordis";
//#region src/cli-manager.d.ts
declare const managedCliVersion = "0.2.0";
type ResolverOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  home?: string;
  fetcher?: typeof fetch;
};
declare function resolveCliExecutable(options?: ResolverOptions): Promise<string>;
declare function platformArtifactKey(platform: NodeJS.Platform, arch: string): string;
//#endregion
//#region src/index.d.ts
declare const name = "securstack-dsh-plugin";
declare const inject: string[];
type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};
type RunCli = (args: string[], options?: {
  cwd?: string;
}) => Promise<CliResult>;
declare const defaultRunCli: RunCli;
declare function apply(ctx: Context): void;
declare function registerSecurStackTools(ctx: Context, runCli: RunCli): void;
//#endregion
export { apply, defaultRunCli, inject, managedCliVersion, name, platformArtifactKey, registerSecurStackTools, resolveCliExecutable };
//# sourceMappingURL=index.d.mts.map