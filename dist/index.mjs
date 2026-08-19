import { defineTool } from "@deepseek-ai/dsh-tools";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
//#region src/cli-manager.ts
const managedCliVersion = "0.2.0";
let pendingInstall;
async function resolveCliExecutable(options = {}) {
	const env = options.env ?? process.env;
	if (env.SECURSTACK_CLI_PATH) return env.SECURSTACK_CLI_PATH;
	const platform = options.platform ?? process.platform;
	const arch = options.arch ?? process.arch;
	const pathMatch = findOnPath(platform, env);
	if (pathMatch) return pathMatch;
	const executable = managedCliPath(env.SECURSTACK_CLI_VERSION || "0.2.0", platform, options.home ?? homedir());
	if (isExecutable(executable, platform)) return executable;
	pendingInstall ??= installManagedCli({
		...options,
		env,
		platform,
		arch,
		home: options.home ?? homedir()
	}).finally(() => {
		pendingInstall = void 0;
	});
	return pendingInstall;
}
function platformArtifactKey(platform, arch) {
	const normalizedPlatform = platform === "win32" ? "windows" : platform;
	if (![
		"darwin",
		"linux",
		"windows"
	].includes(normalizedPlatform)) throw new Error(`SecurStack CLI does not support platform ${platform}`);
	if (!["x64", "arm64"].includes(arch)) throw new Error(`SecurStack CLI does not support architecture ${arch}`);
	return `${normalizedPlatform}-${arch}`;
}
async function installManagedCli(options) {
	const version = options.env.SECURSTACK_CLI_VERSION || "0.2.0";
	const manifestUrl = options.env.SECURSTACK_CLI_MANIFEST_URL || `https://downloads.securstack.io/cli/v${version}/manifest.json`;
	const fetcher = options.fetcher ?? fetch;
	const manifestResponse = await fetcher(manifestUrl);
	if (!manifestResponse.ok) throw new Error(`Unable to download SecurStack CLI manifest (${manifestResponse.status}) from ${manifestUrl}`);
	const manifest = await manifestResponse.json();
	if (manifest.version !== version) throw new Error(`SecurStack CLI manifest version mismatch: expected ${version}, received ${manifest.version}`);
	const key = platformArtifactKey(options.platform, options.arch);
	const artifact = manifest.artifacts[key];
	if (!artifact) throw new Error(`SecurStack CLI release ${version} does not contain ${key}`);
	const binaryResponse = await fetcher(artifact.url);
	if (!binaryResponse.ok) throw new Error(`Unable to download SecurStack CLI binary (${binaryResponse.status}) from ${artifact.url}`);
	const bytes = Buffer.from(await binaryResponse.arrayBuffer());
	if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256.toLowerCase()) throw new Error(`SecurStack CLI checksum verification failed for ${artifact.file}`);
	const executable = managedCliPath(version, options.platform, options.home);
	mkdirSync(join(options.home, ".securstack", "bin", version), { recursive: true });
	const temporary = `${executable}.${process.pid}.tmp`;
	writeFileSync(temporary, bytes, { mode: 493 });
	if (options.platform !== "win32") chmodSync(temporary, 493);
	rmSync(executable, { force: true });
	renameSync(temporary, executable);
	return executable;
}
function managedCliPath(version, platform, home) {
	return join(home, ".securstack", "bin", version, platform === "win32" ? "securstack.exe" : "securstack");
}
function findOnPath(platform, env) {
	const pathValue = env.PATH || env.Path || env.path;
	if (!pathValue) return void 0;
	const names = platform === "win32" ? [
		"securstack.exe",
		"securstack.cmd",
		"securstack.bat"
	] : ["securstack"];
	for (const directory of pathValue.split(delimiter).filter(Boolean)) for (const name of names) {
		const candidate = join(directory, name);
		if (isExecutable(candidate, platform)) return candidate;
	}
}
function isExecutable(path, platform) {
	if (!existsSync(path)) return false;
	try {
		accessSync(path, platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/index.ts
const name = "securstack-dsh-plugin";
const inject = ["tools"];
const defaultRunCli = async (args, options = {}) => {
	const executable = await resolveCliExecutable();
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, {
			cwd: options.cwd,
			env: process.env,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({
				code: code ?? 1,
				stdout,
				stderr
			});
		});
	});
};
function apply(ctx) {
	registerSecurStackTools(ctx, defaultRunCli);
}
function registerSecurStackTools(ctx, runCli) {
	ctx.tools.register(defineTool({
		name: "securstack_scan",
		description: "Run a SecurStack repository scan with the official SecurStack CLI and return JSON findings.",
		parameters: {
			path: {
				type: "string",
				description: "Repository path to scan. Defaults to the current workspace directory."
			},
			engines: {
				type: "array",
				items: { type: "string" },
				description: "Optional scan engines to enable, such as secrets, repo_health, or iac."
			},
			locale: {
				type: "string",
				description: "Optional locale, such as en-US or pt-BR."
			},
			uploadMode: {
				type: "string",
				description: "Optional upload mode: auto, json, or package."
			},
			noWait: {
				type: "boolean",
				description: "Queue the scan and return without waiting for completion."
			}
		},
		output: jsonOutput(),
		async execute(args) {
			const scanPath = stringArg(args, "path") || process.cwd();
			const cliArgs = [
				"scan",
				"--path",
				scanPath,
				"--format",
				"json"
			];
			for (const engine of stringArrayArg(args, "engines")) cliArgs.push("--engine", engine);
			pushOptional(cliArgs, "--locale", stringArg(args, "locale"));
			pushOptional(cliArgs, "--upload-mode", stringArg(args, "uploadMode"));
			if (booleanArg(args, "noWait")) cliArgs.push("--no-wait");
			return runJsonCommand(runCli, cliArgs, { cwd: scanPath });
		}
	}));
	ctx.tools.register(defineTool({
		name: "securstack_doctor",
		description: "Run SecurStack CLI diagnostics and return the textual diagnostic output.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				properties: {
					stdout: {
						type: "string",
						required: true
					},
					stderr: {
						type: "string",
						required: true
					}
				},
				additionalProperties: false
			},
			render: (_args, value) => renderJson(value)
		},
		async execute() {
			const result = await runCli(["doctor"], { cwd: process.cwd() });
			assertCliSuccess(result, ["doctor"]);
			return trimResult(result);
		}
	}));
	ctx.tools.register(defineTool({
		name: "securstack_policy_check",
		description: "Check a SecurStack scan JSON file against risk and severity policy limits.",
		parameters: {
			input: {
				type: "string",
				required: true,
				description: "Path to a SecurStack scan JSON file."
			},
			maxRiskScore: {
				type: "number",
				description: "Maximum allowed risk score."
			},
			maxCritical: {
				type: "number",
				description: "Maximum allowed critical findings."
			},
			maxHigh: {
				type: "number",
				description: "Maximum allowed high findings."
			},
			maxMedium: {
				type: "number",
				description: "Maximum allowed medium findings."
			},
			maxLow: {
				type: "number",
				description: "Maximum allowed low findings."
			}
		},
		output: jsonOutput(),
		async execute(args) {
			const cliArgs = [
				"policy",
				"check",
				"--input",
				requiredStringArg(args, "input")
			];
			pushOptionalNumber(cliArgs, "--max-risk-score", numberArg(args, "maxRiskScore"));
			pushOptionalNumber(cliArgs, "--max-critical", numberArg(args, "maxCritical"));
			pushOptionalNumber(cliArgs, "--max-high", numberArg(args, "maxHigh"));
			pushOptionalNumber(cliArgs, "--max-medium", numberArg(args, "maxMedium"));
			pushOptionalNumber(cliArgs, "--max-low", numberArg(args, "maxLow"));
			return runJsonCommand(runCli, cliArgs, {
				cwd: process.cwd(),
				allowExitCodeOne: true
			});
		}
	}));
}
async function runJsonCommand(runCli, args, options) {
	const result = await runCli(args, { cwd: options.cwd });
	if (options.allowExitCodeOne && result.code === 1 && result.stdout.trim()) return parseJsonOutput(result.stdout, args);
	assertCliSuccess(result, args);
	return parseJsonOutput(result.stdout, args);
}
function assertCliSuccess(result, args) {
	if (result.code === 0) return;
	const command = `securstack ${args.join(" ")}`;
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	throw new Error(`${command} failed: ${detail}`);
}
function parseJsonOutput(stdout, args) {
	try {
		const value = JSON.parse(stdout);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected a JSON object");
		return value;
	} catch (error) {
		const command = `securstack ${args.join(" ")}`;
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`${command} did not return valid JSON: ${reason}`);
	}
}
function jsonOutput() {
	return {
		schema: { type: "json" },
		render: (_args, value) => renderJson(value)
	};
}
function renderJson(value) {
	return [{
		type: "text",
		text: JSON.stringify(value, null, 2)
	}];
}
function trimResult(result) {
	return {
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim()
	};
}
function pushOptional(args, flag, value) {
	if (value) args.push(flag, value);
}
function pushOptionalNumber(args, flag, value) {
	if (value !== void 0) args.push(flag, String(value));
}
function stringArg(args, key) {
	const value = args[key];
	return typeof value === "string" && value.trim() ? value : void 0;
}
function requiredStringArg(args, key) {
	const value = stringArg(args, key);
	if (!value) throw new Error(`Missing required argument: ${key}`);
	return value;
}
function stringArrayArg(args, key) {
	const value = args[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
function numberArg(args, key) {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function booleanArg(args, key) {
	return args[key] === true;
}
//#endregion
export { apply, defaultRunCli, inject, managedCliVersion, name, platformArtifactKey, registerSecurStackTools, resolveCliExecutable };

//# sourceMappingURL=index.mjs.map