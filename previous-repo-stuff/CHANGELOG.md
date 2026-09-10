# Changelog

## 0.3.7 - 2026-08-29

### Added

- Split timestamp completion summaries that include an extension UI prompt into total elapsed time, active agent time, and time waiting for user input; runs with no prompt retain the concise existing duration.

### Changed

- Require Pi 0.84.4 or newer; this is the development and validation baseline for every extension package.

### Security

- Write `pi-set-model` preferences through an exclusively created, owner-only, randomly named temporary file before atomically replacing the preference file.

### Compatibility

- Use Pi 0.84.4's non-triggering custom-message contract for advisor display feedback; Pi safely queues it during active tool runs, avoiding invalid provider message histories on replay.

## 0.3.6 - 2026-08-27

### Changed

- Update the development and validation baseline for every extension package to Pi SDK 0.84.3 while retaining runtime compatibility with Pi 0.84.1 and newer.
- Rename the thinking extension command from `/thinking` to `/think` because Pi 0.84.3 took over the `/thinking` name for its native selector, removing the built-in command conflict while preserving the shortcut alongside Pi's command.

### Fixed

- Keep `pi-set-model` preferences synchronized when Pi's thinking level changes for the saved model, so the project preference matches the footer.

## 0.3.5 - 2026-08-23

### Changed

- Add the copyright holder and EUPL licensing notice to the bundle and package license files, and add copyright/SPDX headers to every canonical TypeScript source.
- Identify KAPPER NETWORK-COMMUNICATIONS GmbH and kapper.net in the root and workspace npm author metadata.
- Keep Dependabot major updates for TypeScript and Node declarations aligned with the versions validated by the pinned Pi SDK.

## 0.3.4 - 2026-08-23

### Changed

- Mark Pi's host-provided SDK packages as optional wildcard peers across the bundle so npm installations do not pull in a redundant Pi runtime dependency tree.
- Require Node.js 22.19.0 or newer for development and package installation, and verify compatibility against Pi SDK 0.84.2 while retaining Pi 0.84.1 runtime compatibility.
- Derive `/thinking` validation and autocomplete choices from the active model's supported thinking levels, refresh them when the model changes, fall back safely when malformed custom metadata exposes no levels, and avoid intercepting mid-line completion.
- Validate `pi-set-model` preferences more strictly and clamp restored thinking levels with Pi's model-capability helper.
- Refine advisor guidance so non-trivial tasks require review at an evidence-backed checkpoint before the final answer without encouraging an immediate first-action call.
- Make advisor reviews checkpoint-aware, evidence-grounded, and limited to a verdict plus three prioritized actions.
- Run advisor `onDone` review and timestamp completion only after Pi fully settles automatic retries, compaction recovery, and queued continuations.
- Write advisor configuration atomically with owner-only file permissions where supported.
- Warn against installing the GitHub bundle alongside individual npm packages because duplicate extension loading can repeat commands, tools, handlers, and UI output.

### Security

- Prevent `/advisor` from offering or writing project-scoped configuration until Pi trusts the project, complementing the existing protection that ignores untrusted project configuration.
- Make the root GitHub bundle private on npm to prevent accidental root publication.

### Development

- Add package-metadata regression tests for engines, optional Pi peers, publication safety, changelog inclusion, and immutable CI action pins.
- Add event-level regression tests for advisor lifecycle/config writes, timestamp retry timing, thinking-model refresh, and set-model clamping.
- Add continuous integration on Node.js 22.19.0 and 24 for typechecking and tests, plus audit and root/workspace package dry-runs.
- Add manual CI dispatch, concurrency cancellation, job timeouts, a README status badge, and weekly Dependabot checks for npm and GitHub Actions.
- Pin GitHub Actions dependencies to immutable commit SHAs.
- Document staged npm publishing, human review and 2FA approval, named-workspace publishing, and the current Node.js requirement.
