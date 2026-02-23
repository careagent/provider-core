# CareAgent

## What This Is

CareAgent is an open-source clinical activation layer for AI agents, distributed as `@careagent/provider-core` — a platform-portable npm package that transforms any AI agent workspace into a credentialed, auditable, hardened clinical agent. CANS.md (Care Agent Nervous System) is the universal clinical activation gate that works alongside whatever workspace format the host platform uses (AGENTS.md standard, CLAUDE.md, OpenClaw's SOUL.md/AGENTS.md/USER.md, etc.). Built by a neurosurgeon for daily clinical use, it operates under the provider's license and authority, governed by the Irreducible Risk Hypothesis: risk stays with the provider, and the AI acts as an extension of their clinical practice.

## Core Value

A provider installs CareAgent into their AI agent platform, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

## Requirements

### Validated

- ✓ Plugin installs cleanly into host platforms and registers all extension points — v1.0
- ✓ CANS.md activates the clinical layer when present in the workspace — v1.0
- ✓ AUDIT.log captures every action, tool invocation, and blocked action as append-only record — v1.0
- ✓ Six-layer runtime hardening prevents actions outside credentialed scope — v1.0
- ✓ Onboarding interview discovers provider identity, credentials, scope, specialty, philosophy, voice, and autonomy preferences — v1.0
- ✓ Onboarding generates personalized CANS.md and supplements existing workspace files — v1.0
- ✓ Clinical skills gate on CANS.md credentials (license type, specialty, privileges) — v1.0
- ✓ Regular host platform skills continue to load normally alongside clinical skills — v1.0
- ✓ Clinical skill integrity verification (SHA-256 checksumming at install, verification at load) — v1.0
- ✓ Clinical skill version-pinning (no auto-update, provider approval required) — v1.0
- ✓ chart-skill produces template-constrained clinical documentation in provider's voice — v1.0
- ✓ CANS continuous improvement (agent proposes updates, provider approves/rejects) — v1.0
- ✓ End-to-end flow: install → onboard → personalized CareAgent → skill loading → documentation → audit — v1.0
- ✓ Open-source ready repository with architecture guide, installation guide, onboarding walkthrough, configuration reference — v1.0

### Active

- [ ] Onboarding asks only name + provider type, then fetches questionnaire from Axon — v2.0
- [ ] Questionnaire runs dynamically with conditional logic and action_assignments — v2.0
- [ ] Questionnaire answers deterministically populate CANS.md scope and fields — v2.0
- [ ] CANS.md generated as v2.0 schema from questionnaire results — v2.0
- [ ] Onboarding engine updated from hardcoded stages to questionnaire-driven flow — v2.0

### Future

- [ ] order-skill drafts clinical orders for provider pre-execution approval
- [ ] charge-skill captures CPT/ICD coding with provider audit
- [ ] Patient CANS.md declares patient identity, health record access rules, and consent preferences
- [ ] Agent-to-agent communication between provider and patient CareAgents
- [ ] Cryptographic integrity for AUDIT.log (digital signatures, Merkle trees)
- [ ] HIPAA compliance implementation (encryption at rest, access controls)
- [ ] agents-standard auto-detection in detectPlatform() (currently deferred — explicit call available)

## Current Milestone: v2.0 Axon-Integrated Questionnaire Onboarding

**Goal:** Replace the hardcoded 9-stage onboarding interview with a questionnaire-driven flow powered by Axon's taxonomy system — ask name and provider type, fetch the appropriate questionnaire, run it dynamically, generate v2.0 CANS.md from answers.

**Target features:**
- Two-question initial flow (name + provider type from 49 categories)
- Axon questionnaire fetch and dynamic execution with conditional logic
- Action assignments mapping answers to taxonomy-controlled permitted actions
- v2.0 CANS.md generation from questionnaire results
- Existing v1.0 tests updated for new onboarding flow

### Out of Scope

- Axon platform layer (agent-to-agent protocols, credentialing infrastructure) — separate effort
- Real patient data or PHI — synthetic data only in dev platform
- Ambient audio capture — HIPAA liability, consent complexity
- Direct EHR integration — requires vendor certification, institutional IT approval
- Autonomous clinical decision-making — violates Irreducible Risk Hypothesis
- Real-time CDS alerts — requires FDA clearance as medical device
- Mobile or web front-end — CLI interaction through host platform
- Billing optimization/upcoding — False Claims Act liability risk

## Context

- **Shipped v1.0** with 16,822 LOC TypeScript, 714 tests, 52/52 requirements satisfied
- **Tech stack:** TypeScript, tsdown (build), Vitest (testing), TypeBox (schema validation)
- **Architecture:** "Extend, don't fork" — CareAgent is a plugin/library with 4 entry points (default, openclaw, standalone, core); host platforms are optional peer dependencies
- **Platform portability:** CANS.md is the universal clinical activation gate; workspace profiles configure supplementation per platform (OpenClaw, agents-standard, standalone)
- **Theoretical foundation:** The Irreducible Risk Hypothesis — provider liability is non-delegable; AI operates under provider authority
- **Seven Atomic Actions:** Chart, Order, Charge, Perform, Interpret, Educate, Coordinate — chart-skill is the first (v1.0), order-skill and charge-skill are next
- **Axon dependency:** Provider-core v2.0 consumes Axon's taxonomy (49 provider types) and questionnaire system; Axon repo at /Users/medomatic/Documents/Projects/axon with physician questionnaire (13 questions) fully authored, 48 stubs
- **First specialty:** Neurosurgery — the developer is the provider, building for their own daily clinical use
- **License:** Apache 2.0 — transparency is a structural requirement when providers bear personal liability
- **Known tech debt:** 17 items (0 blockers) — Docker sandbox report-only, stub modules (neuron, protocol), agents-standard auto-detection deferred. See milestones/v1.0-MILESTONE-AUDIT.md

## Constraints

- **Platform:** VPS only — never install on or modify local OpenClaw installation
- **Tech stack:** Match OpenClaw's tooling exactly (TypeScript, build system, testing framework)
- **LLM provider:** Flexible — support whatever OpenClaw supports, don't hardcode a provider
- **Data:** Synthetic only — no real patient data or PHI in dev platform
- **Plugin boundary:** No OpenClaw source code in repo — peer dependency only, track plugin API surface
- **Testing:** Fresh OpenClaw install on VPS — disposable environment
- **Hook dependency:** before_tool_call exists in OpenClaw's type system but call sites not wired (issue #6535) — design for it, graceful no-op until available

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plugin architecture over fork | Sustainability — track upstream, don't carry a divergent codebase | ✓ Good — clean plugin boundary, 4 entry points |
| CANS.md as single activation file | Simplicity — presence/absence is the gate, same mechanism for provider and patient | ✓ Good — TypeBox schema validation, SHA-256 integrity |
| VPS-only development | Previous local install broke OpenClaw — isolate development environment | ✓ Good — no local breakage incidents |
| 9 phases in first milestone | Build the complete dev platform including gap closure and docs | ✓ Good — shipped in 5 days |
| Match OpenClaw tooling | Reduce friction, maintain compatibility, potential upstream contribution | ✓ Good — TypeScript, Vitest, tsdown |
| chart-skill as first clinical skill | Documentation is the most delegable action (high autonomy tier, post-hoc review) | ✓ Good — template-constrained, neurosurgery-specific |
| Six-layer hardening with graceful degradation | Defense in depth; each layer independent, audit every decision | ✓ Good — safety guard fires even without before_tool_call hook |
| Decimal phase numbering (2.1) | Clear insertion semantics for urgent architectural realignment | ✓ Good — no renumbering disruption |
| Workspace profiles over hardcoded platform files | Platform portability — OpenClaw, agents-standard, standalone all configurable | ✓ Good — agents-standard auto-detection cleanly deferrable |
| Agents-standard auto-detection deferred (Option D) | Requires distinguishing agents-standard hosts from generic standalone — extension point documented | ⚠️ Revisit in future milestone |

| Axon questionnaire-driven onboarding over hardcoded stages | Scalability — 49 provider types, one interview engine; scope determined by taxonomy not free-text | — Pending |

---
*Last updated: 2026-02-23 after v2.0 milestone start*
