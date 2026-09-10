# Releasing

This repository uses npm staged publishing. Packages are uploaded to npm's
staging area without a two-factor challenge, then a human maintainer reviews and
approves them with 2FA before they become public.

Staged publishing requires npm CLI 11.15.0 or later, Node.js 22.19.0 or later,
and an existing package on the registry. A brand-new package must be published
directly by a human maintainer once before it can use this workflow.

## 1. Prepare the release

1. Update affected package READMEs, metadata, versions, and changelogs.
2. Bump every changed workspace version and the root GitHub-bundle version.
3. Run `npm install` to synchronize `package-lock.json`.
4. Run the release checks. The metadata tests enforce optional wildcard Pi SDK peers so clean npm installs do not pull a redundant SDK tree:

   ```bash
   npm run typecheck
   npm test
   npm audit --audit-level=low
   npm pack --dry-run --workspace @hk_net/pi-advisor
   npm pack --dry-run --workspace @hk_net/pi-thinking-command
   npm pack --dry-run --workspace @hk_net/pi-timestamp
   npm pack --dry-run --workspace pi-set-model
   ```

5. Commit and push the release changes before staging.

Never run bare `npm publish` at the repository root. The root package is the
GitHub bundle; stage or publish only the named npm workspaces.

## 2. Verify GitHub CI after push

After the workflow is first pushed, open the repository's **Actions** tab and wait for these checks to pass:

- `Test (Node 22.19.0)`
- `Test (Node 24)`
- `Package and audit`

For the initial repository setup:

1. Open **Settings → Actions → General** and allow GitHub-created actions (`actions/checkout` and `actions/setup-node`). Keep workflow permissions read-only; this CI needs no secrets.
2. After the first successful workflow run, open **Settings → Rules → Rulesets** and create an active branch ruleset targeting `main`.
3. Require the three checks listed above. Also block force pushes and branch deletion; require pull requests if that matches the maintainer's merge workflow.

Dependabot activates automatically from `.github/dependabot.yml` on the default branch. These settings are one-time repository administration; subsequent releases only need to confirm that CI passes.

## 3. Stage the packages

Confirm the active identity and run the repository's named-workspace staging
command:

```bash
npm whoami
npm run release:stage
```

`npm stage publish` does not require 2FA and does not make a package public.
Record the stage IDs printed by npm. To inspect pending releases:

```bash
npm stage list
npm stage view <stage-id>
npm stage download <stage-id>
```

The staged packages can also be reviewed in the **Staged Packages** tab on
npmjs.com.

## 4. Human approval

A human maintainer approves each reviewed stage with 2FA. Either approve it in
the npmjs.com **Staged Packages** tab or use:

```bash
npm stage approve <stage-id>
```

Reject an incorrect stage instead of approving it:

```bash
npm stage reject <stage-id>
```

Never share an OTP or npm token in chat or commit it to the repository.

## 5. Direct-publish fallback

Direct publishing is only needed for a package that does not yet exist on npm or
when staged publishing is unavailable. The human maintainer initiates the first
publish and completes npm's browser or OTP challenge:

```bash
npm publish --workspace <workspace-name> --access public
```

After a successful challenge, additional named workspaces may be published from
the same machine during npm's short authorization window. Never publish the root
package.

## 6. Verify

```bash
npm view @hk_net/pi-advisor version
npm view @hk_net/pi-thinking-command version
npm view @hk_net/pi-timestamp version
npm view pi-set-model version
git status --short
```
