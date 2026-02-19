# Roadmap: CareAgent

**Created:** 2026-02-17
**Depth:** Comprehensive
**Phases:** 6
**Coverage:** 52/52 v1 requirements mapped

---

## Phases

- [x] **Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline** - A working OpenClaw plugin that installs, detects CANS.md, validates its schema, and logs every action to a hash-chained audit trail
- [x] **Phase 2: Onboarding and CLI** - Provider completes an interactive interview and receives a personalized CANS.md that activates their clinical agent
- [x] **Phase 2.1: Architectural Alignment** - Restructure codebase to match README target architecture, expand CANS schema for ecosystem readiness, prepare module interfaces (INSERTED)
- [x] **Phase 3: Runtime Hardening** - Six defense layers prevent any action outside the provider's credentialed scope
- [ ] **Phase 4: Clinical Skills** - chart-skill generates template-constrained clinical documentation gated on provider credentials
- [ ] **Phase 5: CANS Continuous Improvement and Integration** - CareAgent proposes refinements to CANS.md and the full end-to-end flow is verified
- [ ] **Phase 6: Documentation and Release** - A developer can install, onboard, and use CareAgent by following documentation alone

---

## Phase Details

### Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline
**Goal:** A working OpenClaw plugin that installs, detects CANS.md clinical activation, validates its schema, and logs every action to a hash-chained, append-only audit trail
**Depends on:** Nothing (first phase)
**Requirements:** PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, CANS-01, CANS-02, CANS-03, CANS-04, CANS-05, CANS-06, CANS-07, AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05, AUDT-06
**Success Criteria** (what must be TRUE):
  1. Provider runs `openclaw plugins install @careagent/provider-core` and the plugin installs without errors, registers its extension points, and shows up in OpenClaw's plugin list
  2. When CANS.md is present in the workspace, CareAgent activates clinical mode; when CANS.md is absent, OpenClaw behaves as if the plugin is not there
  3. A malformed CANS.md is rejected at parse time with a clear error message explaining what is wrong, and clinical mode does not activate
  4. Every agent action, blocked action, and state transition is recorded in AUDIT.log as append-only JSONL with hash chaining, and the log cannot be modified or deleted through normal operations
  5. CANS.md integrity is verified on every load via SHA-256 hash comparison; a tampered CANS.md triggers a warning and does not activate
**Plans:** 6 plans
Plans:
- [x] Plan 01 — Project scaffold, build config, and plugin manifest (PLUG-01, PLUG-02, PLUG-05)
- [x] Plan 02 — Adapter layer, shared types, and CANS.md TypeBox schema (PLUG-04, CANS-02, CANS-03, CANS-04, CANS-05)
- [x] Plan 03 — CANS parser, activation gate, and integrity check (CANS-01, CANS-06, CANS-07)
- [x] Plan 04 — Audit entry schema, writer, and pipeline (AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05)
- [x] Plan 05 — Plugin registration wiring and audit integrity service (PLUG-03, AUDT-06)
- [x] Plan 06 — Comprehensive test suite and phase verification (all 18 requirements)

### Phase 2: Onboarding and CLI
**Goal:** Provider completes an interactive interview that discovers their clinical identity, generates a personalized CANS.md, and supplements their workspace files
**Depends on:** Phase 1 (requires plugin shell, CANS.md schema, and audit pipeline)
**Requirements:** ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05
**Success Criteria** (what must be TRUE):
  1. Provider runs `careagent init` and completes a structured interview that discovers their specialty, credentials, scope, philosophy, documentation voice, and autonomy preferences
  2. Onboarding generates a CANS.md that validates against the TypeBox schema and activates clinical mode when placed in the workspace
  3. Provider can review, adjust, and re-generate CANS.md before finalizing -- onboarding is not a one-shot process
  4. Provider runs `careagent status` and sees activation state, CANS.md summary, hardening layer status, loaded skills, and audit stats
  5. Existing SOUL.md, AGENTS.md, and USER.md content is preserved and supplemented with clinical content -- never replaced
**Plans:** 6 plans
Plans:
- [x] Plan 01 — InterviewIO abstraction, prompt utilities, and CLI scaffolding (ONBD-01 partial)
- [x] Plan 02 — Interview stage machine and complete onboarding engine (ONBD-01)
- [x] Plan 03 — CANS.md generator and review-edit-regenerate loop (ONBD-02, ONBD-05)
- [x] Plan 04 — Workspace file supplementation (SOUL.md, AGENTS.md, USER.md) (ONBD-03)
- [x] Plan 05 — careagent status command (ONBD-04)
- [x] Plan 06 — CLI wiring and comprehensive integration tests (ONBD-01 through ONBD-05)

### Phase 02.1: Architectural Alignment (INSERTED)

**Goal:** Restructure codebase to match README target architecture, expand CANS schema for ecosystem readiness, update README to document proven abstractions, and prepare module interfaces for neuron/protocol/credentials/hardening
**Depends on:** Phase 2
**Plans:** 4 plans

Plans:
- [x] 02.1-01-PLAN.md — Fix stale imports and remove deprecated shim directories (adapter/, types/)
- [x] 02.1-02-PLAN.md — Create stub modules (hardening, credentials, neuron, protocol)
- [x] 02.1-03-PLAN.md — Expand CANS schema with optional neuron, skills, cross_installation fields
- [x] 02.1-04-PLAN.md — Update entry/core.ts re-exports and README Repository Structure

### Phase 3: Runtime Hardening
**Goal:** Six defense layers prevent any agent action outside the provider's credentialed scope, with graceful degradation when individual layers are unavailable
**Depends on:** Phase 2 (requires valid CANS.md from onboarding to test against)
**Requirements:** HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, HARD-07
**Success Criteria** (what must be TRUE):
  1. When CANS.md is active, only tools required for the provider's clinical functions are permitted; all other tools are denied
  2. All shell execution routes through allowlist mode with only pre-approved binary paths permitted
  3. CANS.md clinical hard rules appear in the agent's system prompt via the host platform's hook mechanism (e.g. bootstrap hook), and the agent references them in its reasoning
  4. The safety guard intercepts tool invocations via the host platform's hook mechanism and validates against CANS.md scope; if the hook is not wired, a canary test detects this at startup and warns the provider
  5. Every hardening layer decision (allow, deny, ask) is recorded in AUDIT.log with the specific layer that made the decision
**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md — Types expansion, Layer 1 (tool-policy), Layer 2 (exec-allowlist) with TDD (HARD-01, HARD-02)
- [x] 03-02-PLAN.md — Layer 3 (CANS injection), Layer 4 (Docker sandbox) with TDD (HARD-03, HARD-04)
- [x] 03-03-PLAN.md — Engine orchestrator, canary module, audit bridge with TDD (HARD-05, HARD-06, HARD-07)
- [x] 03-04-PLAN.md — Entry point wiring, integration tests, final verification (all HARD requirements)

### Phase 4: Clinical Skills
**Goal:** chart-skill generates template-constrained clinical documentation in the provider's voice, gated on credentials, with integrity verification and version pinning
**Depends on:** Phase 3 (skills must never load into an unhardened environment)
**Requirements:** SKIL-01, SKIL-02, SKIL-03, SKIL-04, SKIL-05, SKIL-06, SKIL-07
**Success Criteria** (what must be TRUE):
  1. Clinical skills that require credentials the provider lacks do not load; regular OpenClaw skills continue to function normally alongside clinical skills
  2. chart-skill generates structured clinical notes (operative note, H&P, progress note) using templates -- not freeform generation -- in the provider's documented clinical voice
  3. Clinical skill files are SHA-256 checksummed at install and verified at load; a modified skill file does not load
  4. Clinical skills do not auto-update; the provider must explicitly approve version changes before they take effect
  5. Skill installation, loading, credential gating decisions, and usage events are all recorded in AUDIT.log
**Plans:** 5 plans

Plans:
- [ ] 04-01-PLAN.md — Credential validator implementation and tests (SKIL-01, SKIL-02)
- [ ] 04-02-PLAN.md — Skill framework core: types, manifest schema, integrity, version pinning (SKIL-03, SKIL-04)
- [ ] 04-03-PLAN.md — Chart-skill templates, voice adapter, SKILL.md, and manifest (SKIL-05, SKIL-06)
- [ ] 04-04-PLAN.md — Skill loader with credential gating, integrity verification, and audit logging (SKIL-01, SKIL-03, SKIL-07)
- [ ] 04-05-PLAN.md — Entry point wiring, core re-exports, and integration tests (all SKIL requirements)

### Phase 5: CANS Continuous Improvement and Integration
**Goal:** CareAgent proposes refinements to the provider's CANS.md based on usage patterns, and the complete end-to-end flow from fresh install to clinical documentation is verified
**Depends on:** Phase 4 (requires all components to exist for integration testing)
**Requirements:** CANS-08, CANS-09, CANS-10, INTG-01, INTG-02, INTG-03
**Success Criteria** (what must be TRUE):
  1. CareAgent proposes updates to CANS.md based on observed usage patterns; proposals require explicit provider approval and no automatic modifications ever occur
  2. Every CANS.md modification proposal (proposed, accepted, rejected) is recorded in AUDIT.log
  3. The complete flow works end-to-end: fresh OpenClaw install, plugin install, onboarding, personalized clinical agent, skill loading, documentation generation, and audit trail verification
  4. A security review confirms all six hardening layers correctly block unauthorized actions in a realistic scenario
  5. A developer who has never seen CareAgent can install, onboard, and reach a functional clinical agent by following the installation steps
**Plans:** TBD

### Phase 6: Documentation and Release
**Goal:** Repository is open-source ready with comprehensive documentation that enables independent installation, understanding, and contribution
**Depends on:** Phase 5 (documentation describes the verified, integrated system)
**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05
**Success Criteria** (what must be TRUE):
  1. Architecture guide explains the plugin model, CANS activation mechanism, six hardening layers, and skill framework clearly enough that a developer can understand the system without reading source code
  2. Installation guide covers VPS setup, OpenClaw installation, plugin installation, and first-run onboarding with no undocumented steps
  3. Onboarding walkthrough guides a provider from `careagent init` through their first clinical documentation generation
  4. CANS.md schema, skill metadata format, and plugin configuration are fully documented with examples
  5. Repository has LICENSE (Apache 2.0), README, and CONTRIBUTING guide ready for public release
**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Foundation, Clinical Activation, and Audit Pipeline | 6/6 | Complete | 2026-02-18 |
| 2. Onboarding and CLI | 6/6 | Complete | 2026-02-18 |
| 2.1. Architectural Alignment | 4/4 | Complete | 2026-02-19 |
| 3. Runtime Hardening | 4/4 | Complete | 2026-02-19 |
| 4. Clinical Skills | 0/5 | Planned | - |
| 5. CANS Continuous Improvement and Integration | 0/? | Not started | - |
| 6. Documentation and Release | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase |
|-------------|-------|
| PLUG-01 | Phase 1 |
| PLUG-02 | Phase 1 |
| PLUG-03 | Phase 1 |
| PLUG-04 | Phase 1 |
| PLUG-05 | Phase 1 |
| CANS-01 | Phase 1 |
| CANS-02 | Phase 1 |
| CANS-03 | Phase 1 |
| CANS-04 | Phase 1 |
| CANS-05 | Phase 1 |
| CANS-06 | Phase 1 |
| CANS-07 | Phase 1 |
| AUDT-01 | Phase 1 |
| AUDT-02 | Phase 1 |
| AUDT-03 | Phase 1 |
| AUDT-04 | Phase 1 |
| AUDT-05 | Phase 1 |
| AUDT-06 | Phase 1 |
| ONBD-01 | Phase 2 |
| ONBD-02 | Phase 2 |
| ONBD-03 | Phase 2 |
| ONBD-04 | Phase 2 |
| ONBD-05 | Phase 2 |
| PORT-01 | Portability |
| PORT-02 | Portability |
| PORT-03 | Portability |
| PORT-04 | Portability |
| HARD-01 | Phase 3 |
| HARD-02 | Phase 3 |
| HARD-03 | Phase 3 |
| HARD-04 | Phase 3 |
| HARD-05 | Phase 3 |
| HARD-06 | Phase 3 |
| HARD-07 | Phase 3 |
| SKIL-01 | Phase 4 |
| SKIL-02 | Phase 4 |
| SKIL-03 | Phase 4 |
| SKIL-04 | Phase 4 |
| SKIL-05 | Phase 4 |
| SKIL-06 | Phase 4 |
| SKIL-07 | Phase 4 |
| CANS-08 | Phase 5 |
| CANS-09 | Phase 5 |
| CANS-10 | Phase 5 |
| INTG-01 | Phase 5 |
| INTG-02 | Phase 5 |
| INTG-03 | Phase 5 |
| DOCS-01 | Phase 6 |
| DOCS-02 | Phase 6 |
| DOCS-03 | Phase 6 |
| DOCS-04 | Phase 6 |
| DOCS-05 | Phase 6 |

**Mapped:** 52/52
**Orphaned:** 0

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-19 (Phase 4 planned -- 5 plans in 3 waves)*
