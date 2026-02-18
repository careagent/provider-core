# Requirements: CareAgent

**Defined:** 2026-02-17
**Core Value:** A provider installs CareAgent into OpenClaw, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Foundation

- [x] **PLUG-01**: Plugin installs into OpenClaw via `openclaw plugins install @careagent/core` without errors
- [x] **PLUG-02**: Plugin manifest (openclaw.plugin.json) declares plugin ID, configSchema, skills directories, CLI commands, and hook registrations
- [x] **PLUG-03**: Plugin `register(api)` entry point registers CLI commands, hooks, agent tools, and background services
- [x] **PLUG-04**: Adapter layer insulates CareAgent from OpenClaw internals so upstream updates do not break the plugin
- [x] **PLUG-05**: Plugin has zero runtime npm dependencies — all runtime needs come from Node.js built-ins, OpenClaw (peer dependency), and CareAgent's own code

### Clinical Activation

- [x] **CANS-01**: CANS.md presence in workspace activates the clinical layer; absence means standard OpenClaw behavior
- [x] **CANS-02**: CANS.md schema defines provider identity (name, NPI, license type/state/number, specialty, institutional affiliation, credential status)
- [x] **CANS-03**: CANS.md schema defines scope of practice mapped to provider licensure and institutional privileges
- [x] **CANS-04**: CANS.md schema defines autonomy tiers for each of the four atomic actions (chart, order, charge, perform)
- [x] **CANS-05**: CANS.md schema defines hardening activation flags and consent configuration
- [x] **CANS-06**: CANS.md is validated against TypeBox schema at parse time; malformed files are rejected with clear error messages
- [x] **CANS-07**: CANS.md integrity is checked on every load via SHA-256 hash comparison against last known-good state

### Audit & Accountability

- [x] **AUDT-01**: AUDIT.log captures every agent action as append-only JSONL with timestamp, action type, actor, target, outcome, session ID, and trace ID
- [x] **AUDT-02**: AUDIT.log captures every blocked action with rationale (what was attempted, why blocked, which hardening layer caught it)
- [x] **AUDT-03**: AUDIT.log distinguishes action states: AI-proposed, provider-approved, provider-modified, provider-rejected, system-blocked
- [x] **AUDT-04**: AUDIT.log entries include hash chaining (each entry includes hash of previous entry) for tamper evidence
- [x] **AUDT-05**: AUDIT.log entries can never be modified or deleted — only appended
- [x] **AUDT-06**: Audit background service monitors log integrity and reports anomalies

### Platform Portability

- [x] **PORT-01**: PlatformAdapter interface abstracts host platform interactions; CareAgent subsystems never depend on a specific platform's raw API
- [x] **PORT-02**: Platform detection duck-types the API object to automatically select the correct adapter (OpenClaw, standalone)
- [x] **PORT-03**: Workspace file supplementation is configurable per platform via workspace profiles (OpenClaw: SOUL.md + AGENTS.md + USER.md; AGENTS.md standard: single AGENTS.md; standalone: no supplementation)
- [x] **PORT-04**: Multiple entry points allow platform-specific or pure-library usage (`@careagent/core`, `@careagent/core/standalone`, `@careagent/core/core`)

### Runtime Hardening

- [ ] **HARD-01**: Layer 1 — Tool policy lockdown: only tools required for provider's clinical functions are permitted when CANS.md is active
- [ ] **HARD-02**: Layer 2 — Exec approvals: all shell execution routes through allowlist mode; only pre-approved binary paths are permitted
- [ ] **HARD-03**: Layer 3 — CANS protocol injection: clinical hard rules are injected into system prompt via agent:bootstrap hook alongside existing workspace files
- [ ] **HARD-04**: Layer 4 — Docker sandboxing: when available, CareAgent activates OpenClaw's Docker sandbox for process-level isolation
- [ ] **HARD-05**: Layer 5 — Safety guard: before_tool_call hook intercepts every tool invocation and validates against CANS.md scope boundaries; graceful no-op when hook is not wired
- [ ] **HARD-06**: Layer 6 — Audit trail integration: every hardening layer feeds into AUDIT.log with full fidelity
- [ ] **HARD-07**: Canary test verifies before_tool_call hook fires at runtime; warns provider if safety guard is degraded

### Onboarding

- [x] **ONBD-01**: `careagent init` CLI command initiates an interactive conversation that discovers clinical role, specialty, scope, philosophy, documentation voice, and autonomy preferences
- [x] **ONBD-02**: Onboarding generates personalized CANS.md from interview responses with provider approval before finalizing
- [x] **ONBD-03**: Onboarding writes clinical content into SOUL.md, AGENTS.md, and USER.md — supplementing (not replacing) existing content
- [x] **ONBD-04**: `careagent status` CLI command shows activation state, CANS.md summary, hardening layer status, loaded clinical skills, and audit stats
- [x] **ONBD-05**: Onboarding supports iterative refinement — provider can review and adjust generated CANS.md before activation

### Clinical Skills

- [ ] **SKIL-01**: Clinical skills gate on CANS.md credentials (license type, specialty, privilege) — skills that require credentials the provider lacks do not load
- [ ] **SKIL-02**: Regular OpenClaw skills continue to load and function normally alongside clinical skills
- [ ] **SKIL-03**: Clinical skill integrity verification: SHA-256 checksumming at install, verification at load; modified skills do not load
- [ ] **SKIL-04**: Clinical skill version pinning: no auto-update; provider must explicitly approve version changes
- [ ] **SKIL-05**: chart-skill generates template-constrained clinical documentation (not freeform) in the provider's clinical voice
- [ ] **SKIL-06**: chart-skill includes neurosurgery-specific templates (operative note, H&P, progress note)
- [ ] **SKIL-07**: Skill installation, loading, and usage events are recorded in AUDIT.log

### CANS Continuous Improvement

- [ ] **CANS-08**: CareAgent can propose updates to CANS.md based on observed usage patterns
- [ ] **CANS-09**: Provider must approve or reject proposed CANS.md changes — no automatic modifications
- [ ] **CANS-10**: Every CANS.md modification (proposed, accepted, rejected) is recorded in AUDIT.log

### Documentation & Release

- [ ] **DOCS-01**: Architecture guide explains plugin model, CANS activation, hardening layers, and skill framework
- [ ] **DOCS-02**: Installation guide covers OpenClaw setup, plugin installation, and VPS deployment
- [ ] **DOCS-03**: Onboarding walkthrough guides a provider through `careagent init` to first clinical interaction
- [ ] **DOCS-04**: Configuration reference documents CANS.md schema, skill metadata format, and plugin settings
- [ ] **DOCS-05**: Repository is prepared for open-source release with LICENSE, README, CONTRIBUTING guide

### Integration

- [ ] **INTG-01**: End-to-end flow works: fresh OpenClaw install -> plugin install -> onboarding -> personalized CareAgent -> clinical skill loading -> documentation generation -> audit trail verification
- [ ] **INTG-02**: Security review validates all six hardening layers block unauthorized actions
- [ ] **INTG-03**: A developer can install @careagent/core, run onboarding, and interact with a functional clinical agent by following documentation alone

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Order & Charge Skills

- **SKIL-08**: order-skill drafts clinical orders for provider pre-execution approval
- **SKIL-09**: charge-skill captures CPT/ICD coding with provider audit

### Patient CareAgents

- **PCAG-01**: Patient CANS.md declares patient identity, health record access rules, and consent preferences
- **PCAG-02**: Patient clinical skills gate on identity_type: patient

### Agent-to-Agent Communication

- **COMM-01**: Provider CareAgent can communicate with Patient CareAgent on the patient's terms
- **COMM-02**: Bilateral accountability record for agent-to-agent interactions

### Production Hardening

- **PROD-01**: Cryptographic integrity for AUDIT.log (digital signatures, Merkle trees)
- **PROD-02**: HIPAA compliance implementation (encryption at rest, access controls, BAAs, breach notification)
- **PROD-03**: EHR integration via FHIR-compatible export formats

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ambient audio capture | HIPAA liability, consent complexity, competes with $600M incumbents |
| Direct EHR integration | Requires vendor certification, institutional IT approval, enterprise sales cycles |
| Autonomous clinical decision-making | Violates Irreducible Risk Hypothesis and current law (TX SB 1188, EU AI Act) |
| Patient-facing interactions | Different liability model, consent requirements, regulatory frameworks |
| Real-time CDS alerts | Requires FDA clearance as medical device (SaMD pathway) |
| Multi-provider team workflows | Axon platform layer — separate effort |
| Billing optimization/upcoding | False Claims Act liability risk |
| Hardcoded LLM provider | Must remain model-agnostic |
| Real patient data or PHI | Dev platform uses synthetic data only |
| Mobile or web front-end | CLI interaction through OpenClaw |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 1 | Complete |
| PLUG-03 | Phase 1 | Complete |
| PLUG-04 | Phase 1 | Complete |
| PLUG-05 | Phase 1 | Complete |
| CANS-01 | Phase 1 | Complete |
| CANS-02 | Phase 1 | Complete |
| CANS-03 | Phase 1 | Complete |
| CANS-04 | Phase 1 | Complete |
| CANS-05 | Phase 1 | Complete |
| CANS-06 | Phase 1 | Complete |
| CANS-07 | Phase 1 | Complete |
| AUDT-01 | Phase 1 | Complete |
| AUDT-02 | Phase 1 | Complete |
| AUDT-03 | Phase 1 | Complete |
| AUDT-04 | Phase 1 | Complete |
| AUDT-05 | Phase 1 | Complete |
| AUDT-06 | Phase 1 | Complete |
| ONBD-01 | Phase 2 | Complete |
| ONBD-02 | Phase 2 | Complete |
| ONBD-03 | Phase 2 | Complete |
| ONBD-04 | Phase 2 | Complete |
| ONBD-05 | Phase 2 | Complete |
| PORT-01 | Portability | Complete |
| PORT-02 | Portability | Complete |
| PORT-03 | Portability | Complete |
| PORT-04 | Portability | Complete |
| HARD-01 | Phase 3 | Pending |
| HARD-02 | Phase 3 | Pending |
| HARD-03 | Phase 3 | Pending |
| HARD-04 | Phase 3 | Pending |
| HARD-05 | Phase 3 | Pending |
| HARD-06 | Phase 3 | Pending |
| HARD-07 | Phase 3 | Pending |
| SKIL-01 | Phase 4 | Pending |
| SKIL-02 | Phase 4 | Pending |
| SKIL-03 | Phase 4 | Pending |
| SKIL-04 | Phase 4 | Pending |
| SKIL-05 | Phase 4 | Pending |
| SKIL-06 | Phase 4 | Pending |
| SKIL-07 | Phase 4 | Pending |
| CANS-08 | Phase 5 | Pending |
| CANS-09 | Phase 5 | Pending |
| CANS-10 | Phase 5 | Pending |
| INTG-01 | Phase 5 | Pending |
| INTG-02 | Phase 5 | Pending |
| INTG-03 | Phase 5 | Pending |
| DOCS-01 | Phase 6 | Pending |
| DOCS-02 | Phase 6 | Pending |
| DOCS-03 | Phase 6 | Pending |
| DOCS-04 | Phase 6 | Pending |
| DOCS-05 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 52 total (48 original + 4 portability)
- Mapped to phases: 52
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
