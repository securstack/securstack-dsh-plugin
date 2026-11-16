# Release and publishing

This is the release runbook for `@securstack/dsh-plugin`. The complementary infrastructure source of truth is `../securstack-infra/docs/deepseek-harness-plugin.md` in the standard SecurStack sibling-repository layout.

## Required identities

- npm releases must use a trusted publisher configured by the npm user `securstack`.
- Public GitHub pushes must be authenticated as the GitHub account `securstack`.
- Personal accounts must not publish the npm package or push public releases.
- Tokens and PATs must stay outside Git, documentation, scripts, environment examples, and persisted remote URLs.

The release workflow uses GitHub OIDC and does not require a local npm token.

The npm scope `@securstack` belongs to the npm user `securstack`; a separate npm organization is neither required nor expected for this package.

## Repository remotes

- `origin` is the private Bitbucket repository and the normal destination for local commits.
- `github` is the public repository at `https://github.com/securstack/securstack-dsh-plugin`.
- GitHub publication requires a fine-grained PAT from the `securstack` account with `Contents: Read and write` for this repository, or another approved authentication mechanism for that account.
- Never force-push merely to reconcile the Bitbucket and GitHub histories. Publish the same reviewed change on each existing history without rewriting either remote.

## Compatibility guard

`@deepseek-ai/dsh-tools` must remain in `peerDependencies` and `devDependencies`, aligned with the supported DSH runtime. It must not be placed in `dependencies`: installing a private runtime copy can shadow the DSH Desktop tool registry and cause tool calls to fail before their results are recorded.

After packing the plugin, install the tarball into a disposable DSH profile and confirm that the profile does not contain its own `node_modules/@deepseek-ai/dsh-tools` copy.

The `managedCliVersion` declared in `src/cli-manager.ts` must already exist at
`downloads.securstack.io` for every supported platform before this plugin is
published. Test a clean-machine download and checksum failure path; never
publish a plugin that points at a pending CLI release.

## Release checklist

1. Confirm the intended version in `package.json` and `package-lock.json`.
2. Validate the package:

   ```bash
   npm run typecheck
   npm test
   npm pack --dry-run
   ```

3. Commit generated `dist/` artifacts whenever source or generated declarations change. Git-based DSH installation requires `dist/index.mjs` to exist in the repository.
4. Push the reviewed commit to `origin main`.
5. Push the equivalent reviewed change to `github main`, authenticated as GitHub `securstack`. Do not use a personal account and do not force-push.
6. On npmjs.com, configure `@securstack/dsh-plugin` trusted publishing for GitHub organization `securstack`, repository `securstack-dsh-plugin`, workflow file `publish-npm.yml`, and permission to run `npm publish`. Create or refresh the connection immediately before publishing; npm requires the first successful publish within two days.
7. Run `Publish npm package` on `main` in GitHub Actions. Its OIDC token is short-lived and scoped to the workflow; the job validates the package and publishes it without `SECURSTACK_NPM_TOKEN`. Do not use `npm whoami` to validate OIDC, because it is not an OIDC publish check.
8. Verify the registry result:

   ```bash
   npm view @securstack/dsh-plugin version dist-tags --json \
     --registry https://registry.npmjs.org/
   ```

9. Reinstall the registry version in a disposable DSH profile and validate the composed profile configuration before announcing the release.

## Marketplace requirement

The DSH Desktop community market installs verified npm targets. The published package must therefore keep its `repository` backlink to `https://github.com/securstack/securstack-dsh-plugin`, and the marketplace catalog must identify `@securstack/dsh-plugin` as a verified npm install method.
