# CareAgent

## What This Is

CareAgent is an open-source clinical activation layer for AI agents, distributed as `@careagent/provider-core` — a platform-portable npm package that transforms any AI agent workspace into a credentialed, auditable, hardened clinical agent. CANS.md (Care Agent Nervous System) is the universal clinical activation gate that works alongside whatever workspace format the host platform uses (AGENTS.md standard, CLAUDE.md, OpenClaw's SOUL.md/AGENTS.md/USER.md, etc.). Built by a neurosurgeon for daily clinical use, it operates under the provider's license and authority, governed by the Irreducible Risk Hypothesis: risk stays with the provider, and the AI acts as an extension of their clinical practice.

## Core Value

A provider installs CareAgent into their AI agent platform, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Plugin installs cleanly into host platforms and registers all extension points (CLI commands, hooks, tools, background services)
- [ ] CANS.md (Care Agent Nervous System) activates the clinical layer when present in the workspace
- [ ] AUDIT.log captures every action, tool invocation, and blocked action as append-only record
- [ ] Six-layer runtime hardening prevents actions outside credentialed scope
- [ ] Onboarding interview discovers provider identity, credentials, scope, specialty, clinical philosophy, documentation voice, and autonomy preferences
- [ ] Onboarding generates personalized CANS.md and supplements existing workspace files (SOUL.md, AGENTS.md, USER.md)
- [ ] Clinical skills gate on CANS.md credentials — require specific license type, specialty, and institutional privileges to load
- [ ] Regular OpenClaw skills continue to load normally alongside clinical skills
- [ ] Clinical skill integrity verification — checksumming at install, verification at load
- [ ] Clinical skill version-pinning — no auto-update, provider approval required
- [ ] chart-skill produces template-constrained clinical documentation in the provider's voice
- [ ] CANS continuous improvement — agent proposes updates based on observed patterns, provider approves/rejects
- [ ] End-to-end flow: fresh OpenClaw → plugin install → onboarding → personalized CareAgent → clinical skill loading → documentation generation → audit trail verification
- [ ] Open-source ready repository with contributor docs, user docs, and architecture guides

### Out of Scope

- Axon platform layer (agent-to-agent protocols, credentialing infrastructure) — separate effort
- Patient CareAgents — future milestone, architecture supports it but not built now
- HIPAA compliance implementation — architected for but not hardened in dev platform
- Real patient data or PHI — synthetic data only
- Production audit hardening (cryptographic integrity, hash chaining, digital signatures) — future requirement
- order-skill and charge-skill implementation — framework supports them, chart-skill is the first
- Mobile or web front-end — CLI interaction through OpenClaw
- Commercial products built on top — independent business decisions

## Context

- **Theoretical foundation:** The Irreducible Risk Hypothesis — provider liability is non-delegable; AI operates under provider authority through existing legal frameworks (state licensing, institutional credentialing, malpractice/tort system)
- **Four Atomic Actions:** All clinical practice reduces to Chart, Order, Charge, Perform — three are delegable to AI today with varying autonomy tiers
- **Architecture:** "Extend, don't fork" — CareAgent is a plugin/library, host platforms (OpenClaw, AGENTS.md standard, etc.) are optional peer dependencies, no host platform source code in the repo
- **Platform portability:** CANS.md is the universal clinical activation gate; workspace file supplementation is configurable per platform via workspace profiles
- **OpenClaw:** Open-source personal AI assistant with workspace architecture (SOUL.md, AGENTS.md, etc.), plugin system, skills framework, multi-channel communication, and exec approval infrastructure
- **Previous experience:** Prior attempt to install on local Mac broke the OpenClaw installation — all development happens on VPS with fresh OpenClaw install
- **First specialty:** Neurosurgery — the developer is the provider, building for their own daily clinical use
- **License:** Apache 2.0 — transparency is a structural requirement when providers bear personal liability

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
| Plugin architecture over fork | Sustainability — track upstream, don't carry a divergent codebase | — Pending |
| CANS.md as single activation file | Simplicity — presence/absence is the gate, same mechanism for provider and patient | — Pending |
| VPS-only development | Previous local install broke OpenClaw — isolate development environment | — Pending |
| All 5 phases in first milestone | Build the complete dev platform — the goal is daily clinical use, not just a proof of concept | — Pending |
| Match OpenClaw tooling | Reduce friction, maintain compatibility, potential upstream contribution | — Pending |
| chart-skill as first clinical skill | Documentation is the most delegable action (high autonomy tier, post-hoc review) | — Pending |

---
*Last updated: 2026-02-17 after initialization*
