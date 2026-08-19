# Release and publishing

This is the release runbook for `@securstack/dsh-plugin`. The complementary infrastructure source of truth is `../securstack-infra/docs/deepseek-harness-plugin.md` in the standard SecurStack sibling-repository layout.

## Required identities

- npm releases must be authenticated as the npm user `securstack`.
- Public GitHub pushes must be authenticated as the GitHub account `securstack`.
- Personal accounts must not publish the npm package or push public releases.
- Tokens and PATs must stay outside Git, documentation, scripts, environment examples, and persisted remote URLs.

In the standard sibling-repository layout, the canonical local npm credential is stored in the ignored file `../securstack-infra/.env.npm-publish`, using the `SECURSTACK_NPM_TOKEN` variable. Its committed template is `../securstack-infra/.env.npm-publish.example`. The real value must never be committed.

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
2. Confirm npm authentication before doing any publish work:

   ```bash
   set -a
   source ../securstack-infra/.env.npm-publish
   set +a
   npm config set //registry.npmjs.org/:_authToken "$SECURSTACK_NPM_TOKEN"
   unset SECURSTACK_NPM_TOKEN
   npm whoami --registry https://registry.npmjs.org/
   ```

   The command must print exactly `securstack`. Stop if it prints another user or returns an authentication error.

3. Validate the package:

   ```bash
   npm run typecheck
   npm test
   npm pack --dry-run
   ```

4. Commit generated `dist/` artifacts whenever source or generated declarations change. Git-based DSH installation requires `dist/index.mjs` to exist in the repository.
5. Push the reviewed commit to `origin main`.
6. Push the equivalent reviewed change to `github main`, authenticated as GitHub `securstack`. Do not use a personal account and do not force-push.
7. Publish the public npm package:

   ```bash
   npm publish --access public --registry https://registry.npmjs.org/
   ```

   `publishConfig` also pins public access and the official npm registry, but the explicit flags make the release intent auditable.

8. Verify the registry result:

   ```bash
   npm view @securstack/dsh-plugin version dist-tags --json \
     --registry https://registry.npmjs.org/
   ```

9. Reinstall the registry version in a disposable DSH profile and validate the composed profile configuration before announcing the release.

## Marketplace requirement

The DSH Desktop community market installs verified npm targets. The published package must therefore keep its `repository` backlink to `https://github.com/securstack/securstack-dsh-plugin`, and the marketplace catalog must identify `@securstack/dsh-plugin` as a verified npm install method.
