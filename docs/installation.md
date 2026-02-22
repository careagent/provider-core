# Installation Guide

This guide covers everything needed to install @careagent/provider-core from zero to a running plugin. It does not cover onboarding or clinical configuration — see [Onboarding Walkthrough](onboarding.md) for that.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | >= 22.12.0 | Required by the plugin's `engines` field |
| pnpm | Any recent version | Package manager used by the project |
| OpenClaw | >= 2026.1.0 | The host platform — this plugin installs into OpenClaw |
| Operating System | macOS or Linux | VPS or local machine |

@careagent/provider-core is an OpenClaw plugin. It requires an existing OpenClaw installation to function. It does not replace OpenClaw or run independently of it (for standalone mode without OpenClaw, see [Entry Points](#entry-points) below).

---

## VPS Setup

For production deployments on a fresh VPS:

### Install Node.js 22.x

Follow the official Node.js installation guide at [nodejs.org](https://nodejs.org/). Use the LTS release channel for Node.js 22.x. Verify the installation:

```bash
node --version
# Must be >= 22.12.0
```

### Install pnpm

```bash
npm install -g pnpm
```

### Install OpenClaw

OpenClaw has its own installation process. Follow the OpenClaw documentation to install and configure the Gateway on your VPS. Once OpenClaw is running and you can access the Gateway, proceed to plugin installation.

---

## Plugin Installation

Install the plugin into your existing OpenClaw installation:

```bash
openclaw plugins install @careagent/provider-core
```

This places the plugin into `~/.openclaw/extensions/careagent-core/`, enables it in the plugin configuration, and makes the `careagent` CLI commands available.

Restart the Gateway to load the plugin:

```bash
openclaw gateway restart
```

Verify the plugin is loaded:

```bash
careagent status
```

At this point, `careagent status` shows the plugin installed but no CANS.md active. The plugin detects that no `CANS.md` file exists in the workspace, so clinical mode is inactive. The agent runs as standard OpenClaw until onboarding is complete.

---

## First-Run Verification

Confirm the plugin installed correctly:

1. **`careagent status` shows plugin loaded** — The command runs without errors and reports the plugin version and activation state (inactive, since no CANS.md exists yet).

2. **No errors in Gateway logs** — Check the OpenClaw Gateway logs for any plugin loading errors. The log should show `[CareAgent] Clinical mode inactive: No CANS.md found` — this is expected before onboarding.

3. **`careagent init` is available** — The onboarding command is registered and ready to use. Running `careagent init --help` should display usage information.

---

## Entry Points

@careagent/provider-core exposes four package entry points for different integration scenarios:

### `@careagent/provider-core` (Default)

```typescript
import register from '@careagent/provider-core';
```

The default entry point. Re-exports the OpenClaw plugin registration function. This is what OpenClaw discovers via the `openclaw.extensions` field in `package.json` and calls with the plugin API.

### `@careagent/provider-core/openclaw`

```typescript
import register from '@careagent/provider-core/openclaw';
```

The OpenClaw platform integration entry point. Identical to the default export — the full plugin registration including adapter creation, activation gate, hardening engine, skill loading, audit pipeline, and CLI registration.

### `@careagent/provider-core/standalone`

```typescript
import { activate } from '@careagent/provider-core/standalone';
```

Standalone mode for environments without OpenClaw. Provides the clinical activation layer (CANS validation, hardening, skills, audit) without requiring the OpenClaw Gateway. Useful for testing, development, or integration with non-OpenClaw platforms.

### `@careagent/provider-core/core`

```typescript
import { CANSSchema, AuditPipeline } from '@careagent/provider-core/core';
```

Pure library types and utilities with no side effects. Exports schemas (CANS, audit entry, skill manifest), types, and utility classes for use by external tools, validators, or other CareAgent ecosystem packages.

---

## Next Step

[Onboarding Walkthrough](onboarding.md) — Set up your clinical identity.
