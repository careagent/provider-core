# @careagent/provider-core

**The provider-side CareAgent plugin for OpenClaw.**

@careagent/provider-core transforms a standard OpenClaw personal AI agent into a credentialed, auditable, hardened clinical agent governed by the Irreducible Risk Hypothesis. It is the clinical activation layer for any healthcare provider — physician, nurse, therapist, pharmacist, technician, or any professional who documents in a patient's chart, interacts with patients, or performs clinical orders and actions.

---

## What This Package Does

@careagent/provider-core is a pnpm plugin package that installs into an existing OpenClaw installation. It does not replace OpenClaw or modify its core. It activates a clinical layer on top of it.

When the plugin detects a `CANS.md` file in an agent's workspace, it:

- Activates credential validation against the provider's declared scope
- Begins append-only audit logging of every agent action to `AUDIT.log`
- Enforces multi-layer runtime hardening preventing actions outside credentialed scope
- Injects clinical protocols and hard rules into the agent's system prompt
- Gates clinical skill loading against provider credentials
- Registers the provider's Care Agent with the configured Neuron endpoint
- Activates the cross-installation communication channel for patient CareAgent sessions

When no `CANS.md` is present, the plugin takes no action. The agent runs as standard OpenClaw.

---

## The Four Atomic Actions

All provider practice reduces to four irreducible actions:

| Action | Delegable to AI | Oversight Model |
|--------|----------------|-----------------|
| **Chart** | Yes | Post-hoc review |
| **Order** | Yes | Pre-execution approval |
| **Charge** | Yes | Periodic audit |
| **Perform** | Not yet | Physician-present |

@careagent/provider-core enables AI delegation of chart, order, and charge within defined autonomy tiers. The risk associated with every delegated action remains with the provider.

---

## Architecture

### CareAgent Is Not a Fork

This package is a plugin into OpenClaw — not a fork of it. OpenClaw is a peer dependency. There is no divergent codebase. When OpenClaw updates, you update OpenClaw. This package tracks OpenClaw's plugin API surface and adapts when that surface changes.

### The Plugin Is the Deterministic Layer

OpenClaw workspace files (SOUL.md, AGENTS.md, etc.) are the instructional layer — they tell the LLM who it is and how to behave. LLM behavior is probabilistic. The plugin is what makes the critical pieces deterministic.

Audit logging, credential validation, hardening enforcement, and the safety guard all run as code in-process with the Gateway — regardless of LLM behavior. The LLM handles clinical intelligence. The plugin handles governance. Governance cannot be probabilistic when a provider's liability is attached to every action the agent takes.

### Single-Agent vs. Multi-Agent Mode

@careagent/provider-core works in both OpenClaw deployment modes.

**Single-agent mode** — the entire OpenClaw installation is dedicated to the provider Care Agent. This is the simplest setup and appropriate for a provider who wants a clinical-only installation with no other agents. No additional isolation configuration is required.

**Multi-agent mode** — the Care Agent runs alongside other agents on the same installation (a general personal assistant, a scheduling agent, etc.). This requires explicit isolation to ensure the clinical workspace, session history, and audit log are completely walled off from non-clinical agents.

When running in multi-agent mode, the following isolation configuration is required:

- `agentToAgent` is disabled on the CareAgent's configuration
- `sessions_send` and `sessions_spawn` are denied in the per-agent tool policy
- Docker sandboxing provides process-level isolation for the clinical runtime
- No other agent on the installation can reach the CareAgent
- The CareAgent communicates only through its bound clinical channels and the cross-installation protocol with patient CareAgents

The `careagent init` onboarding process will ask which mode you are running and configure isolation automatically if multi-agent mode is selected.

### CANS: The Clinical Activation Kernel

`CANS.md` is a single file added to the agent's workspace that activates the entire clinical layer. It contains:

- Provider identity — name, NPI, license type and number, specialty, institutional affiliation
- Scope declaration — what this agent is authorized to do
- Autonomy tiers — the specific autonomy configuration for this provider's role
- Hardening activation flags
- Audit activation flags
- Clinical skill gating rules
- Neuron registration — the Neuron endpoint this CareAgent registers with
- Consent configuration — cross-installation communication permissions

The existing OpenClaw workspace files remain untouched. `CANS.md` is purely additive.

---

## Installation

Requires an existing OpenClaw installation.

```bash
openclaw plugins install @careagent/provider-core
```

This places the plugin into `~/.openclaw/extensions/careagent-core/`, enables it in the plugin configuration, and makes the `careagent` CLI commands available.

```bash
openclaw gateway restart
careagent status
```

---

## Local Development

This project uses [pnpm](https://pnpm.io) as its package manager.

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Clone and install dependencies
git clone https://github.com/careagent/provider-core
cd provider-core
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

---

## Onboarding

Run the onboarding interview to create your personalized Care Agent:

```bash
careagent init
```

The onboarding interview discovers your clinical role, specialty, scope of practice, licensure, clinical philosophy, documentation voice, autonomy preferences, and workflow patterns. It generates a personalized `CANS.md` and supplements your workspace files with clinical content.

The interview works for any provider type — physician, nurse, therapist, pharmacist, technician, social worker, or any professional who performs atomic clinical actions.

After onboarding, your Care Agent activates with your clinical identity on the next agent run.

---

## CLI Commands

```bash
careagent init          # Run the provider onboarding interview
careagent status        # Show active CANS, credential status, audit stats, Neuron connection
```

---

## Workspace After Onboarding

| File | Source | Purpose |
|------|--------|---------|
| `SOUL.md` | OpenClaw + onboarding | Clinical identity and persona |
| `AGENTS.md` | OpenClaw + onboarding | Clinical protocols and hard rules |
| `USER.md` | OpenClaw + onboarding | Provider preferences |
| `TOOLS.md` | OpenClaw | Tool usage instructions |
| `IDENTITY.md` | OpenClaw | Agent presentation |
| `MEMORY.md` | OpenClaw | Long-term memory |
| `HEARTBEAT.md` | OpenClaw | Monitoring loop |
| `BOOT.md` | OpenClaw | Startup checklist |
| `CANS.md` | CareAgent (generated by onboarding) | Clinical activation kernel |
| `AUDIT.log` | CareAgent (generated at runtime) | Immutable action log |

---

## Runtime Hardening

Hardening is core liability architecture. The provider bears personal liability for every action their Care Agent takes. The hardening model ensures the agent cannot take actions outside its credentialed scope, even if prompted to.

### Six Hardening Layers

**Layer 1 — Tool Policy Lockdown**
When `CANS.md` activates, OpenClaw's tool allow/deny lists are configured restrictively. Only tools required for the provider's clinical functions are permitted.

**Layer 2 — Exec Approvals**
All shell execution routes through OpenClaw's exec approval system in allowlist mode. Only pre-approved binary paths are permitted.

**Layer 3 — CANS Protocol Injection**
Clinical hard rules are injected into the system prompt via the `agent:bootstrap` hook: no modifying audit logs, no bypassing credentialing gates, no unauthorized data access, no actions outside the declared scope.

**Layer 4 — Docker Sandboxing**
When available, OpenClaw's Docker sandbox is activated for the agent, providing process-level isolation.

**Layer 5 — Safety Guard (before_tool_call)**
The `before_tool_call` hook intercepts every tool invocation before execution and validates it against `CANS.md` scope boundaries. Activates automatically once wired in OpenClaw's execution flow.

**Layer 6 — Audit Trail Integration**
Every hardening layer feeds into `AUDIT.log`. Every blocked action is recorded with full fidelity — what was attempted, when, why it was blocked, and which layer caught it.

---

## Audit Logging

Every action the Care Agent takes is recorded in `AUDIT.log` from the first interaction:

- The action taken
- Timestamp
- Clinical context
- Autonomy tier (autonomous, draft-for-review, or provider-directed)
- Provider review status
- Outcome

Every blocked action is also recorded. `AUDIT.log` is append-only. Entries can never be modified or deleted.

---

## Clinical Skills

Clinical skills are credentialed capability packages that teach the Care Agent how to perform specific clinical functions. They load only when `CANS.md` credentials authorize them.

Skills are installed from the `careagent/provider-skills` registry:

```bash
openclaw skills install @careagent/provider-skills/chart-skill
openclaw skills install @careagent/provider-skills/order-skill
openclaw skills install @careagent/provider-skills/charge-skill
```

Skills that exceed the provider's declared credentials do not load. A family medicine Care Agent does not load `spine-postop-skill`. A nurse's Care Agent loads a different autonomy tier for `order-skill` than a physician's.

### Skill Categories

- **Core clinical skills** — chart, order, charge. Bundled with every provider Care Agent.
- **Specialty skills** — installed based on provider specialty and scope.
- **Institutional skills** — installed per facility, managed by institutional administrators.
- **Communication skills** — cross-installation protocol with patient CareAgents, care coordination, referral, handoff.
- **Termination-of-care skill** — state-protocol-compliant care relationship termination.

---

## Neuron Integration

The provider's Care Agent registers with a Neuron — the organization-level node that serves as the public-facing endpoint for the practice. The Neuron manages inbound patient CareAgent connections and routes them to the correct provider Care Agent.

The Neuron connection is configured during onboarding and stored in `CANS.md`. The plugin registers with the Neuron at each Gateway startup.

See [careagent/neuron](https://github.com/careagent/neuron) for Neuron installation and configuration.

---

## Cross-Installation Protocol

Provider CareAgents communicate with patient CareAgents through the cross-installation protocol defined in [careagent/axon](https://github.com/careagent/axon). This plugin implements the server role — the inbound channel endpoint that patient CareAgents connect to through the Neuron.

Clinical content flows directly between installations, peer to peer, after the Axon-facilitated handshake. Axon is not in the path of clinical communication.

Every cross-installation session is logged to `AUDIT.log` with full bilateral accountability.

---

## Continuous Improvement

`CANS.md` is not static. The Care Agent can propose updates based on patterns it observes through use. If the agent detects that the provider consistently prefers a documentation style different from what was captured in onboarding, it proposes an update.

The provider approves or rejects proposed changes. Every `CANS.md` modification is recorded in `AUDIT.log`.

---

## Relationship to the Ecosystem

```
National Axon Network
        │
        ▼
  Organization Neuron          ← careagent/neuron
        │
        ▼
Provider OpenClaw Gateway
        │
        ├── main agent (standard OpenClaw)
        ├── other personal agents (standard OpenClaw)
        └── Provider Care Agent  ← @careagent/provider-core
                │
                ├── CANS.md (clinical activation kernel)
                ├── AUDIT.log (immutable liability trail)
                ├── Clinical Skills  ← careagent/provider-skills
                └── Cross-installation protocol  ← careagent/axon
```

---

## Repository Structure

```
careagent/provider-core/
├── src/
│   ├── index.ts              # Plugin entry point — register(api)
│   ├── activation/           # CANS.md parsing, validation, activation logic
│   ├── audit/                # AUDIT.log append-only logging
│   ├── hardening/            # Six-layer hardening implementation
│   ├── credentials/          # Credential validation against CANS.md
│   ├── onboarding/           # careagent init interview and CANS generation
│   ├── neuron/               # Neuron registration and communication
│   └── protocol/             # Cross-installation channel (server role)
├── skills/                   # Bundled core clinical skills
├── templates/                # CANS.md templates for provider types
├── test/                     # Test suites
├── docs/                     # Architecture and contribution guides
├── openclaw.plugin.json      # Plugin manifest
└── package.json              # pnpm package — OpenClaw as peer dependency
```

---

## Contributing

CareAgent is released under Apache 2.0. Contributions are welcome from clinicians, developers, and anyone committed to building trustworthy clinical AI infrastructure.

Before contributing, read the architecture guide in `docs/architecture.md` and the contribution guidelines in `CONTRIBUTING.md`.

Clinical skill contributions belong in [careagent/provider-skills](https://github.com/careagent/provider-skills).

---

## Related Repositories

| Repository | Purpose |
|-----------|---------|
| [careagent/patient-core](https://github.com/careagent/patient-core) | Patient-side CareAgent plugin |
| [careagent/patient-chart](https://github.com/careagent/patient-chart) | Patient Chart vault |
| [careagent/neuron](https://github.com/careagent/neuron) | Organization-level Axon node |
| [careagent/axon](https://github.com/careagent/axon) | Open foundation network layer and protocol |
| [careagent/provider-skills](https://github.com/careagent/provider-skills) | Provider clinical skills registry |
| [careagent/patient-skills](https://github.com/careagent/patient-skills) | Patient clinical skills registry |

---

## License

Apache 2.0. See [LICENSE](LICENSE).

Transparency is a structural requirement when providers bear personal liability for their agent's actions. Every line of code in this repository is open, auditable, and improvable by the community it serves.
