# pi-extensions - a fork for the pi-timestamp

[![CI](https://github.com/hknet/pi-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/hknet/pi-extensions/actions/workflows/ci.yml)

Collection of [pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extensions — small, self-contained plugins that add tools, commands, and automatic behaviors to the pi coding agent.

Requires Pi 0.84.4 or newer.

## Extensions

| Extension | Description |
|---|---|
| [**pi-advisor**](./packages/pi-advisor/) | A parameterless `advisor` tool that forwards the full conversation transcript to a stronger reviewer model for direct, actionable advice. |
| [**pi-thinking-command**](./packages/pi-thinking-command/) | Adds a `/think` shortcut alongside Pi 0.84.3's native `/thinking` command. |
| [**pi-timestamp**](./packages/pi-timestamp/) | Shows user/agent timestamps plus session-switch and full Pi-runtime summaries. |
| [**pi-set-model**](./packages/pi-set-model/) | Remembers the selected model per project folder and keeps its saved thinking level synchronized with Pi. |

## Installation

> **Choose one installation method.** Install either the GitHub bundle or individual npm packages, not both. Loading the same extension from both sources can duplicate commands, tools, event handlers, and UI output.

### Via `pi install` from GitHub (bundle)

Install the entire collection via `pi install`:

```bash
pi install git:git@github.com:hknet/pi-extensions@main
```

Or via HTTPS:

```bash
pi install https://github.com/hknet/pi-extensions
```

Or install from a local checkout:

```bash
pi install /path/to/pi-extensions
```

This adds the package source to your pi settings (`~/.pi/agent/settings.json` under `packages`). Pi loads the extension files declared in this package's `package.json` `pi.extensions` manifest. Restart pi if needed, or reload the session with:

```
/reload
```

### Via npm packages (individual extensions)

Install individual extensions from npm:

```bash
pi install npm:@hk_net/pi-advisor
pi install npm:@hk_net/pi-thinking-command
pi install npm:@hk_net/pi-timestamp
pi install npm:pi-set-model
```

### Manual install (fallback)

Copy individual `.ts` files into pi's extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp packages/pi-advisor/advisor.ts ~/.pi/agent/extensions/advisor.ts
cp packages/pi-thinking-command/thinking-shortcut.ts ~/.pi/agent/extensions/thinking-shortcut.ts
cp packages/pi-timestamp/timestamp.ts ~/.pi/agent/extensions/timestamp.ts
cp packages/pi-set-model/set-model.ts ~/.pi/agent/extensions/set-model.ts
```

## Structure

```
pi-extensions/
├── package.json               # Pi package manifest
├── README.md
├── CHANGELOG.md               # GitHub bundle release history
├── packages/
│   ├── pi-advisor/
│   │   ├── package.json       # npm package @hk_net/pi-advisor
│   │   ├── README.md
│   │   └── advisor.ts         # Canonical source
│   ├── pi-thinking-command/
│   │   ├── package.json       # npm package @hk_net/pi-thinking-command
│   │   ├── README.md
│   │   └── thinking-shortcut.ts # Canonical source
│   ├── pi-timestamp/
│   │   ├── package.json       # npm package @hk_net/pi-timestamp
│   │   ├── README.md
│   │   └── timestamp.ts       # Canonical source
│   └── pi-set-model/
│       ├── package.json       # npm package pi-set-model
│       ├── README.md
│       └── set-model.ts   # Canonical source
```

The root `package.json` declares the `pi.extensions` manifest so `pi install` can load the declared `.ts` extension files from the package. Each extension is self-contained: a single TypeScript module exporting the extension factory function and its own README for documentation.

## Privacy note

`pi-advisor` can send the active conversation transcript — including reasoning, tool calls, arguments, and tool results — to a reviewer model. It does **not** send transcripts until you explicitly configure a trusted reviewer model with `/advisor`, project/global `advisor.json`, or `PI_ADVISOR_MODEL`. Use `/advise show` for UI-only feedback; bare `/advise` is optimized for quick intervention and injects advice into the conversation (`pipe` when idle, `steer` while running).

## Developing

1. Edit the `.ts` source in the extension's package directory.
2. Run `npm test` and `npm run typecheck`.
3. Re-deploy with `pi install /path/to/pi-extensions` (or copy manually and run `/reload`).
4. See each extension's README for configuration options and usage details.

Release maintainers should follow [RELEASING.md](./RELEASING.md), including the human-first npm approval procedure.

## Issues and feedback

Found a bug or have a feature request? Please report it on
[GitHub Issues](https://github.com/hknet/pi-extensions/issues).

For security vulnerabilities, please use
[GitHub's private vulnerability reporting](https://github.com/hknet/pi-extensions/security/advisories/new)
instead of opening a public issue.
