# Roadmap: CareAgent

**Created:** 2026-02-17
**Depth:** Comprehensive
**Phases:** 6
**Coverage:** 48/48 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline** - A working OpenClaw plugin that installs, detects CANS.md, validates its schema, and logs every action to a hash-chained audit trail
- [ ] **Phase 2: Onboarding and CLI** - Provider completes an interactive interview and receives a personalized CANS.md that activates their clinical agent
- [ ] **Phase 3: Runtime Hardening** - Six defense layers prevent any action outside the provider's credentialed scope
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
  1. Provider runs `openclaw plugins install @careagent/core` and the plugin installs without errors, registers its extension points, and shows up in OpenClaw's plugin list
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
- [ ] Plan 06 — Comprehensive test suite and phase verification (all 18 requirements)

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
**Plans:** TBD

### Phase 3: Runtime Hardening
**Goal:** Six defense layers prevent any agent action outside the provider's credentialed scope, with graceful degradation when individual layers are unavailable
**Depends on:** Phase 2 (requires valid CANS.md from onboarding to test against)
**Requirements:** HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, HARD-07
**Success Criteria** (what must be TRUE):
  1. When CANS.md is active, only tools required for the provider's clinical functions are permitted; all other tools are denied
  2. All shell execution routes through allowlist mode with only pre-approved binary paths permitted
  3. CANS.md clinical hard rules appear in the agent's system prompt via the bootstrap hook, and the agent references them in its reasoning
  4. The before_tool_call safety guard intercepts tool invocations and validates against CANS.md scope; if the hook is not wired, a canary test detects this at startup and warns the provider
  5. Every hardening layer decision (allow, deny, ask) is recorded in AUDIT.log with the specific layer that made the decision
**Plans:** TBD

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
**Plans:** TBD

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
| 1. Plugin Foundation, Clinical Activation, and Audit Pipeline | 5/6 | Executing | - |
| 2. Onboarding and CLI | 0/? | Not started | - |
| 3. Runtime Hardening | 0/? | Not started | - |
| 4. Clinical Skills | 0/? | Not started | - |
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

**Mapped:** 48/48
**Orphaned:** 0

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-18*
