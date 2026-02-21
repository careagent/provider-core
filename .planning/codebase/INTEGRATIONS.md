# External Integrations

**Analysis Date:** 2026-02-21

## APIs & External Services

**Host Platform — OpenClaw (optional peer dependency):**
- OpenClaw >=2026.1.0 — AI agent host platform that discovers and loads `provider-core` as a plugin
  - SDK/Client: no SDK; accessed entirely via the adapter pattern — `src/adapters/openclaw/index.ts` wraps the raw `api` object (typed `unknown`) passed to the plugin's `register()` function
  - Auth: none — OpenClaw passes its API object directly at plugin registration time
  - Key API surface consumed: `api.on('before_tool_call', ...)`, `api.on('agent:bootstrap', ...)`, `api.registerCli(...)`, `api.registerService(...)`, `api.registerCommand(...)`, `api.log(...)`, `api.workspaceDir`
  - All calls are wrapped in try/catch for graceful degradation; adapter falls back to `console` logging and `process.cwd()` if API methods are missing
  - Plugin manifest: `openclaw.plugin.json` — declares plugin ID, name, bundled skills list (`skills/chart-skill`), commands, and hooks

**Neuron Network (stub — Phase 5):**
- Neuron — inter-agent communication and discovery network for the CareAgent ecosystem
  - Interface defined: `src/neuron/types.ts` (NeuronClient, NeuronRegistration)
  - Implementation: stub only in `src/neuron/client.ts`; all methods throw "not yet implemented"
  - Registration endpoint: stored per-organization in CANS.md frontmatter field `provider.organizations[].neuron_endpoint`
  - Registration ID: stored in CANS.md frontmatter field `provider.organizations[].neuron_registration_id`
  - Auth: not yet defined (Phase 5)

**Cross-Installation Protocol Server (stub — Phase 5):**
- Custom protocol for patient-agent to provider-agent cross-installation communication
  - Interface defined: `src/protocol/types.ts` (ProtocolServer, ProtocolSession)
  - Implementation: stub only in `src/protocol/server.ts`; all methods throw "not yet implemented"
  - Auth: not yet defined (Phase 5)

## Data Storage

**Databases:**
- None. No database of any kind.

**File Storage — Local Filesystem Only:**
All persistent state is written to the workspace directory (the directory containing CANS.md) under a `.careagent/` subdirectory:

| File | Purpose | Format | Location |
|------|---------|---------|----------|
| `CANS.md` | Provider clinical activation configuration | Markdown with YAML frontmatter | `{workspace}/CANS.md` |
| `.careagent/AUDIT.log` | Hash-chained append-only audit log | JSONL (one JSON object per line) | `{workspace}/.careagent/AUDIT.log` |
| `.careagent/cans-integrity.json` | SHA-256 hash of known-good CANS.md | JSON `{hash, timestamp}` | `{workspace}/.careagent/cans-integrity.json` |
| `.careagent/observations.jsonl` | Usage observation stream for refinement | JSONL | `{workspace}/.careagent/observations.jsonl` |
| `.careagent/proposals.json` | Pending/resolved CANS.md refinement proposals | JSON array | `{workspace}/.careagent/proposals.json` |

Writers: `src/audit/writer.ts`, `src/audit/pipeline.ts`, `src/activation/cans-integrity.ts`, `src/refinement/observation-store.ts`, `src/refinement/proposal-queue.ts`

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None — no external auth provider.

**Provider Identity:**
- Identity is established via the CANS.md document, parsed and validated by `src/activation/gate.ts`
- Identity fields: `provider.name`, `provider.npi` (National Provider Identifier, 10-digit), `provider.types`, `provider.degrees`, `provider.licenses`, `provider.certifications`, `provider.specialty`
- Schema: `src/activation/cans-schema.ts` (TypeBox-validated)
- Tamper detection: SHA-256 hash of CANS.md content compared against `.careagent/cans-integrity.json` on every activation check

**Credential Validation:**
- Implemented locally in `src/credentials/validator.ts`
- Checks provider credentials (degrees, specialty, privileges) against skill manifest requirements before loading any clinical skill
- No external credential verification service

## Monitoring & Observability

**Error Tracking:**
- None. No external error tracking service (Sentry, Datadog, etc.).

**Audit Logging:**
- Custom SHA-256 hash-chained JSONL audit log written to local filesystem
- Every security-relevant event is logged: activation checks, hardening decisions, skill load/block decisions, CANS.md proposal lifecycle
- Log file: `{workspace}/.careagent/AUDIT.log`
- Implementation: `src/audit/writer.ts` (low-level chaining), `src/audit/pipeline.ts` (high-level API)
- Background integrity verification: `src/audit/integrity-service.ts` — checks chain every 60 seconds via `setInterval`, registered as an OpenClaw background service

**Logs:**
- Structured logs emitted via the platform adapter's `log(level, message, data?)` method
- OpenClaw mode: forwarded to `api.log(...)` if available, otherwise falls back to `console.info/warn/error`
- Standalone mode: written directly to `console.info/warn/error`
- All log messages are prefixed with `[CareAgent:Adapter]` (OpenClaw) or `[CareAgent]` (standalone)

## CI/CD & Deployment

**Hosting:**
- Distributed as an npm package; no server deployment

**CI Pipeline:**
- Not detected. No `.github/`, `.gitlab-ci.yml`, or CI config files present.

**Build commands:**
```bash
pnpm build          # tsdown — produces dist/
pnpm test           # vitest run
pnpm test:coverage  # vitest run --coverage
pnpm typecheck      # tsc --noEmit
```

## Environment Configuration

**Required env vars:**
- None required for core operation

**Optional env vars:**
- `CONTAINER` — if set, Docker sandbox detection layer (`src/hardening/layers/docker-sandbox.ts`) treats the runtime as containerized and reports it in audit logs

**Secrets location:**
- No secrets stored. No `.env` files present. No credentials or API keys required for the current implementation.
- Future Phase 5 Neuron integration may require credentials (not yet defined).

**Workspace path resolution (in priority order for OpenClaw):**
1. `api.workspaceDir` (string on the plugin API object)
2. `api.config.workspaceDir`
3. `api.context.workspaceDir`
4. `process.cwd()` (fallback)

## Webhooks & Callbacks

**Incoming:**
- None in current implementation. The cross-installation protocol server (Phase 5 stub in `src/protocol/server.ts`) will eventually listen on a configured port for inbound agent connections.

**Outgoing:**
- None in current implementation. The Neuron client (Phase 5 stub in `src/neuron/client.ts`) will eventually send registration and heartbeat requests to a Neuron endpoint configured per-organization in CANS.md.

## OpenClaw Plugin Integration Details

The plugin registers itself in three ways at startup (via `src/entry/openclaw.ts`):

1. **`before_tool_call` hook** — `api.on('before_tool_call', handler)` — hardening engine intercepts every tool call to enforce CANS.md scope, exec allowlist, CANS injection detection, and Docker sandbox status
2. **`agent:bootstrap` hook** — `api.on('agent:bootstrap', handler)` — injects CANS protocol rules into agent context at bootstrap
3. **Background service** — `api.registerService(config)` — runs audit chain integrity checks every 60 seconds
4. **CLI commands** — `api.registerCli(...)` registers `careagent init`, `careagent status`, and `careagent proposals` commands

Plugin discovery: OpenClaw reads the `openclaw.extensions` field in `package.json` pointing to `./dist/index.js`, which re-exports the `register(api)` default export from `src/entry/openclaw.ts`.

---

*Integration audit: 2026-02-21*
