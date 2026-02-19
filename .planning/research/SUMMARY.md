# Research Summary

**Project:** CareAgent (@careagent/provider-core)
**Synthesized:** 2026-02-17
**Overall Confidence:** MEDIUM-HIGH

---

## Executive Summary

CareAgent is an OpenClaw plugin that implements a clinical activation layer for personal AI assistants used by licensed healthcare providers. The core architectural insight is that clinical AI does not require a standalone platform -- it requires a precisely-bounded extension to a general-purpose AI agent runtime. The entire system activates or deactivates based on a single Markdown file (CANS.md) in the provider's workspace, creating a clean binary gate between personal AI and clinical AI. This activation model is both CareAgent's primary differentiator from $600M-funded incumbents (Abridge, DAX, Oracle Health) and the mechanism by which provider-owned clinical identity is established, rather than relying on vendor-controlled cloud services.

The recommended approach is a five-phase build ordered by strict dependency. The plugin scaffold, activation gate, and audit pipeline form the skeleton that all other components attach to. The onboarding engine comes second because you cannot test hardening without a valid CANS.md, and you cannot generate one without the interview. The six-layer hardening stack comes third because clinical skills must never load into an unhardened environment. The first clinical skill (chart-skill) comes fourth, proving the skill registry works within a fully hardened context. Integration, polish, and continuous improvement come last. This ordering is non-negotiable -- inverting it creates windows where clinical tools operate without safety enforcement.

The primary risks are OpenClaw's rapid release cadence (daily releases with documented breaking plugin API changes), the fragility of the `before_tool_call` hook (was unimplemented for an extended period; hook-only scope enforcement is insufficient), prompt injection attacks bypassing clinical scope boundaries (94.4% success rate in peer-reviewed clinical LLM trials), and audit log integrity failure under real-world conditions (append-only is a policy, not a mechanism, without hash chaining). All four risks have well-defined mitigations: an adapter layer that insulates CareAgent from OpenClaw internals, multi-layer defense-in-depth for scope enforcement, template-constrained output generation for chart-skill, and hash chaining from the first day audit logging is built.

---

## Key Findings

### From STACK.md

**Core technologies:**

| Technology | Version | Rationale |
|------------|---------|-----------|
| Node.js | >=22.12.0 | OpenClaw hard requirement -- not a choice |
| TypeScript | ~5.7.x | Matches OpenClaw's codebase -- required for plugin SDK compatibility |
| pnpm | >=9.x | OpenClaw's package manager -- match for monorepo compatibility |
| tsdown | ~0.20.x | OpenClaw migrated from tsup to tsdown in v2026.2.2; tsup is deprecated |
| Vitest | ~4.0.x | OpenClaw's test framework; native ESM/TS support; no transform overhead |
| TypeBox | ~0.34.x | OpenClaw's schema library -- MUST use TypeBox, not Zod, for plugin configSchema |
| @medplum/fhirtypes | ~5.0.x | Types-only FHIR R4 definitions; zero runtime cost; actively maintained |

**Critical decisions:**
- Zero runtime npm dependencies. Everything comes from Node.js built-ins, OpenClaw (peer dependency), and CareAgent's own code. Every runtime dependency is an attack vector and maintenance burden.
- `openclaw` is always a `peerDependency`, never `dependencies`. The plugin SDK's own docs explicitly warn against putting it in dependencies.
- TypeBox everywhere for schemas. Do not add Zod. OpenClaw's entire validation pipeline speaks TypeBox.
- Audit logging is a custom JSONL writer (5 lines of `fs.appendFileSync`) -- not Winston, not pino, not any logging library. Compliance artifacts must be dead simple.
- `before_tool_call` and `after_tool_call` hooks were wired via PRs #6570 and #6264 (Feb 2026) but are recent. Verify on the target VPS OpenClaw version before relying on them.

### From FEATURES.md

**Table stakes (must ship):**
- Single-file clinical activation (CANS.md) -- the activation gate
- Provider identity capture: name, NPI, license type/state, specialty, institution, privileges, DEA
- Credential storage and verification in CANS.md as structured YAML frontmatter
- Scope-of-practice enforcement: the single most legally critical feature (Texas SB 1188, CA AB 489)
- Append-only audit log: HIPAA requires 6-year retention; every action must be logged
- Action-level logging granularity: AI-proposed, provider-approved, provider-modified, provider-rejected, system-blocked
- Blocked action recording: refusals logged with rationale as proof guardrails work
- Runtime action gating (human-in-the-loop): mandatory for Chart, Order, Charge actions
- Hallucination prevention: template-constrained generation as primary defense
- Graceful degradation: plugin failure must never lock provider out of base AI

**Differentiators:**
- Provider-owned agent model (Irreducible Risk Hypothesis) -- no competitor offers this
- Single-file activation vs. enterprise deployment and vendor contracts
- Four Atomic Actions ontology (Chart, Order, Charge, Perform) -- stratified autonomy per action type
- Open-source (Apache 2.0) -- when providers bear personal liability, inspectable code is a trust differentiator
- Synthetic-first development -- build safety infrastructure before adding real data

**Anti-features (explicitly do not build):**
- Ambient audio capture (HIPAA liability, BAA requirements, two-party consent states)
- Direct EHR integration (requires vendor certification, institutional IT approval)
- Autonomous clinical decision-making (violates Irreducible Risk Hypothesis and current law)
- Patient-facing interactions (different consent, liability, and regulatory frameworks)
- Real-time CDS alerts (triggers FDA SaMD pathway -- medical device regulation)
- Multi-provider / team workflows (out of scope; requires Axon platform layer)
- Billing optimization (False Claims Act exposure)
- Auto-updating clinical skills (patient safety issue -- silent updates change clinical behavior)
- PHI storage or processing in dev platform (premature; requires full HIPAA infrastructure)

**MVP feature order:** CANS.md schema -> provider identity -> scope enforcement -> audit log -> runtime gating -> hardening -> onboarding interview -> CANS.md generation -> provider voice capture -> chart-skill -> neurosurgery templates -> skill integrity -> credential gating.

### From ARCHITECTURE.md

**Seven components, five build phases:**

| # | Component | Responsibility | Build Phase |
|---|-----------|---------------|-------------|
| 1 | Plugin Shell | Entry point; exports `register(api)`; wires all components to OpenClaw | Phase 1 |
| 2 | Activation Gate | CANS.md presence check; single source of truth for clinical mode | Phase 1 |
| 3 | Onboarding Engine | Structured interview; CANS.md generation; workspace file supplements | Phase 2 |
| 4 | Hardening Stack | Six defense layers; orchestrates tool policy, exec approval, CANS injection, sandbox, safety guard, audit | Phase 3 |
| 5 | Clinical Skill Registry | Credential-gated skill discovery, integrity verification, version pinning | Phase 4 |
| 6 | Audit Pipeline | Append-only JSONL event logger; background service | Phase 1 |
| 7 | CLI Commands | `careagent init`, `careagent status` | Phase 2 |

**Six hardening layers (outermost to innermost):**
1. Tool Policy Lockdown -- deny-by-default tool allowlist derived from CANS.md credentials
2. Exec Approval Rules -- OpenClaw native exec approval; `ask: always` for clinical sessions
3. CANS Protocol Injection -- CANS.md content into system prompt via `before_agent_start`
4. Docker Sandbox -- OpenClaw native sandboxing; `network: none` for PHI protection
5. Safety Guard -- `before_tool_call` hook; ALLOW / DENY / ASK per CANS.md scope
6. Audit Trail -- records everything from all other layers; never optional

**Critical patterns:**
- Adapter layer between CareAgent and OpenClaw APIs -- never call OpenClaw internals directly
- Binary activation (CANS.md present = active; absent = inert) -- no partial states
- Emit-and-forget audit events (buffered writes) -- audit logging must never block clinical workflow
- Schema-first CANS.md -- TypeBox validation at parse time; malformed file = inactive, not partial
- Configuration over code for OpenClaw native features -- use `openclaw.json` config for layers 1, 2, 4
- Hook liveness canary -- at startup, verify `before_tool_call` actually fires; warn loudly if it does not

**Key anti-patterns to avoid:**
- Wrapping or monkey-patching OpenClaw internals
- Storing clinical state outside CANS.md
- Synchronous audit writes that block clinical workflow
- Hardcoding clinical domain knowledge in plugin code (lives in skills, not the framework)
- Building a custom RBAC/permission system (map to OpenClaw's native tool policy system instead)

### From PITFALLS.md

**Top pitfalls with prevention strategies:**

| Pitfall | Severity | Prevention |
|---------|---------|------------|
| Prompt injection bypasses scope | CRITICAL | Structural enforcement at tool level, not LLM prompt level; template-constrained output; input sanitization; red-team suite |
| False HIPAA compliance perception | CRITICAL | Explicit "NOT HIPAA COMPLIANT" warnings everywhere; synthetic data enforcement; compliance gap document |
| OpenClaw breaking changes destroy plugin | CRITICAL | Adapter layer pattern; narrow semver pins; smoke tests against latest OpenClaw release; subscribe to releases |
| Audit log integrity failure | CRITICAL | Hash chaining from day one (cheap to implement; high value); write-ahead verification; file permissions; completeness testing |
| `before_tool_call` hook creates silent safety gap | CRITICAL | Multi-layer enforcement (system prompt + tool registration + hook + tool wrapper + output validation); canary test at startup |
| Clinical skill integrity verification gaps | MODERATE | Out-of-band checksum storage; full directory tree hashing; disable npm lifecycle scripts; version-pinned lockfile |
| Onboarding produces unusable CANS.md | MODERATE | Iterative refinement with provider approval; structured + freeform hybrid; validate against ABMS/CMS ontologies |
| Audit log performance bottleneck | MODERATE | Session-scoped hash chains; WAL pattern; never make audit writes fire-and-forget |
| CANS.md as single point of failure | MODERATE | Integrity check at every load; versioned backup; schema validation; file watcher during session |
| Chart-skill hallucination | CRITICAL | Template-constrained generation from day one; source attribution; explicit "not assessed" defaults; hallucination test suite |

**Phase-specific warnings:**

- **Phase 1 (Scaffold):** Build adapter layer and canary test immediately; do not couple to OpenClaw internals
- **Phase 2 (Onboarding/Audit):** Implement hash chaining when audit log is first written; do not defer
- **Phase 3 (Hardening):** Structural scope enforcement at multiple layers; prompt-level enforcement alone is insufficient
- **Phase 4 (Skills):** chart-skill must use template-constrained generation from first implementation
- **All phases:** Smoke test suite against latest OpenClaw release in CI; environment drift on dev VPS is a minor but persistent risk

---

## Implications for Roadmap

### Suggested Phase Structure

The dependency chain from ARCHITECTURE.md and the feature priorities from FEATURES.md converge on the same five-phase structure. This is the correct build order.

**Phase 1: Plugin Foundation**
- Rationale: Everything else depends on these three components. Cannot test hardening without a plugin shell; cannot log events without an audit pipeline; cannot gate anything without an activation gate.
- Delivers: A working OpenClaw plugin that installs, registers, detects CANS.md, and logs the detection to an audit log.
- Features: Plugin shell with `register(api)`, Activation Gate (CANS.md detection + TypeBox schema validation), Audit Pipeline (JSONL writer with hash chaining from day one), adapter layer for OpenClaw APIs, canary test for hook liveness.
- Must avoid: Coupling to OpenClaw internals (Pitfall 3), deferring hash chaining (Pitfall 4), deferring the adapter layer (Pitfall 3).
- Research flag: STANDARD PATTERNS -- plugin scaffolding is well-documented in OpenClaw docs and ClawBands reference implementation.

**Phase 2: Onboarding and CLI**
- Rationale: No CANS.md means no hardening test surface and no clinical mode to validate. The onboarding interview is the entry point for all subsequent phases.
- Delivers: `careagent init` interview that produces a valid CANS.md; `careagent status` reporting; workspace file supplementation (SOUL.md, AGENTS.md, USER.md additions).
- Features: Onboarding Engine (structured + freeform hybrid interview), CANS.md generation with iterative provider review, workspace file supplements, CLI command registration, CANS.md backup mechanism.
- Must avoid: One-shot CANS.md generation without provider review loop (Pitfall 7), CANS.md as secrets store (Pitfall 13), missing "NOT HIPAA COMPLIANT" warnings in CLI output (Pitfall 2).
- Research flag: NEEDS DEEPER RESEARCH -- the specific interview flow and CANS.md schema are novel; validate structure with at least two provider personas before committing.

**Phase 3: Runtime Hardening**
- Rationale: Clinical skills must never load into an unhardened environment. All six hardening layers must be active and tested before any clinical skill is registered.
- Delivers: All six hardening layers active; scope enforcement verified with canary test; exec approval rules configured; Docker sandbox configured; audit completeness test passing.
- Features: Hardening Stack (all 6 layers), tool policy configuration from CANS.md credentials, CANS.md protocol injection via `before_agent_start`, Safety Guard via `before_tool_call` with multi-layer fallback, hook liveness monitoring, synthetic data PHI detection guard.
- Must avoid: Relying on `before_tool_call` as the sole scope enforcement point (Pitfall 5), prompt-level scope enforcement as primary defense (Pitfall 1), HIPAA compliance language (Pitfall 2).
- Research flag: NEEDS DEEPER RESEARCH -- verify `before_tool_call` behavior on the actual VPS OpenClaw version before designing the hardening layer; the hook's runtime behavior affects the entire safety architecture.

**Phase 4: Clinical Skills**
- Rationale: Skills require the full hardening stack (Phase 3), CANS.md credentials for gating (Phase 2), and the audit pipeline for integrity logging (Phase 1). chart-skill is first because it has the highest autonomy tier (draft + post-hoc review) and is safest to build before higher-risk Order and Charge actions.
- Delivers: chart-skill with neurosurgery templates; credential-gated skill loading; integrity verification; version pinning; extensible template schema for future specialties.
- Features: Clinical Skill Registry, chart-skill with template-constrained generation, neurosurgery templates (operative note, H&P, progress note), skill integrity verification (out-of-band SHA-256, full directory Merkle), credential gating from CANS.md, version pinning with provider approval workflow, provider voice injection from CANS.md.
- Must avoid: Freeform chart-skill generation (Pitfall 10), in-band checksum storage (Pitfall 6), auto-updating skills (anti-feature), clinical domain knowledge hardcoded in plugin code (Architecture anti-pattern 4).
- Research flag: STANDARD PATTERNS -- template-constrained generation and skill integrity are well-documented; neurosurgery template content itself may need domain expert review.

**Phase 5: Integration and Polish**
- Rationale: The first phase that requires all components to exist simultaneously. Full end-to-end flow validation.
- Delivers: Complete `fresh OpenClaw install -> careagent install -> init -> onboard -> clinical work -> audit verification` flow; open-source readiness; CI pipeline; smoke tests against latest OpenClaw.
- Features: End-to-end test suite, CI pipeline with clean-install job, smoke tests against latest OpenClaw release (non-blocking), CANS continuous improvement proposal workflow (defer to here), API surface tracking document.
- Must avoid: Environment drift from dev VPS as the reference environment (Pitfall 11), tooling lock-in from matching OpenClaw internals beyond interface (Pitfall 12).
- Research flag: STANDARD PATTERNS -- integration testing and CI setup are standard; CANS continuous improvement may need a mini-research pass.

### Feature Groupings Across Phases

| Feature from FEATURES.md | Phase |
|--------------------------|-------|
| CANS.md activation file (schema + detection) | 1 |
| Append-only audit log (with hash chaining) | 1 |
| Blocked action recording | 1 |
| Provider identity capture | 2 |
| Credential storage and verification | 2 |
| Onboarding interview | 2 |
| CANS.md generation | 2 |
| Provider voice/style capture | 2 |
| Workspace file supplements | 2 |
| CLI commands (init, status) | 2 |
| Scope-of-practice enforcement | 3 |
| Runtime action gating (human-in-the-loop) | 3 |
| Six-layer runtime hardening | 3 |
| Hallucination prevention (structural) | 3+4 |
| Graceful degradation | 3 |
| Action boundary enforcement | 3 |
| Structured clinical note generation (chart-skill) | 4 |
| Specialty-specific templates | 4 |
| Credential-gated skill loading | 4 |
| Skill integrity verification | 4 |
| Skill version pinning | 4 |
| Clinical skill isolation | 4 |
| CANS continuous improvement loop | 5 |

---

## Confidence Assessment

| Area | Confidence | Basis | Gaps |
|------|------------|-------|------|
| Stack | HIGH | Official OpenClaw docs, npm registry, reference implementations (ClawBands, GatewayStack). Tooling decisions are constrained by the host platform, leaving little ambiguity. | `before_tool_call` and `after_tool_call` hook wiring is recent (Feb 2026 PRs); must verify on actual VPS version. Plugin SDK import paths have conflicting documentation (`openclaw/plugin-sdk` vs `@openclaw/plugin-sdk`). |
| Features | HIGH | Peer-reviewed research (Cell Reports Medicine, UALM governance), regulatory analysis (TX SB 1188, CA AB 489, Colorado AI Act), market research (Menlo Ventures, McKinsey). Feature set is well-grounded in clinical AI governance literature. | CANS.md format is novel -- no prior art for a single-file clinical activation mechanism at this scope. Multi-specialty template extensibility is untested. |
| Architecture | MEDIUM-HIGH | OpenClaw plugin docs, DeepWiki deep dives, ClawBands reference implementation, clinical AI architecture literature (arXiv, PMC). The component decomposition and data flows are sound. | Hook availability at runtime is uncertain (the central architectural dependency). How OpenClaw handles plugin-shipped skills needs VPS testing. Bootstrap file injection behavior needs verification. |
| Pitfalls | HIGH | JAMA Network Open peer-reviewed data (94.4% prompt injection success), ACL security research (100% guardrail evasion), npm supply chain attack documentation, HIPAA enforcement records. The pitfalls are not speculative -- they are documented failure modes. | CareAgent's specific CANS.md architecture has no direct prior art; some pitfall assumptions about OpenClaw's workspace behavior may not match reality. |

**Overall confidence: MEDIUM-HIGH**

The technology stack is well-validated. The feature set is grounded in clinical regulation and market analysis. The architecture is sound. The pitfalls are evidence-based. The primary uncertainty is runtime behavior of OpenClaw's plugin hook system, which affects the core safety architecture. This is a validated risk (not speculation) with a defined mitigation strategy (multi-layer defense, adapter pattern, canary tests).

### Gaps to Address During Planning

1. **VPS OpenClaw version:** Which exact version is deployed? Determines whether `before_tool_call` is available and which hardening layer is primary vs. fallback.
2. **Plugin SDK import path:** `openclaw/plugin-sdk` vs `@openclaw/plugin-sdk` -- conflicting documentation. Must verify against installed package before writing first import.
3. **`registerPluginHooksFromDir` behavior:** Does it work with compiled JS only, or does jiti resolution work with TypeScript source in dev? Affects development workflow.
4. **Bootstrap file injection:** Can a plugin programmatically add CANS.md to the bootstrapped workspace file set, or does it require the `agent:bootstrap` hook approach? The hook approach is recommended but needs VPS validation.
5. **Plugin-shipped skills discovery:** How does OpenClaw discover and load skills declared in `openclaw.plugin.json`? What is the precedence relative to workspace skills? Needs testing in a real plugin context.
6. **CANS.md schema validation:** The CANS.md format is novel. The schema should be reviewed with at least one practicing clinician (the developer's own specialty) before Phase 2 is built.

---

## Sources

### Aggregated from Research Files

**HIGH Confidence (Official and Peer-Reviewed):**
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin)
- [OpenClaw Hooks Docs](https://docs.openclaw.ai/automation/hooks)
- [OpenClaw Skills Docs](https://docs.openclaw.ai/tools/skills)
- [OpenClaw TypeBox Docs](https://docs.openclaw.ai/concepts/typebox)
- [OpenClaw Agent Workspace Docs](https://docs.openclaw.ai/concepts/agent-workspace)
- [Vulnerability of LLMs to Prompt Injection When Providing Medical Advice (JAMA Network Open, Dec 2025)](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2842987)
- [A Foundational Architecture for AI Agents in Healthcare (Cell Reports Medicine)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12629813/)
- [Agentic AI Governance and Lifecycle Management in Healthcare (UALM)](https://arxiv.org/html/2601.15630v1)
- [Bypassing LLM Guardrails: Empirical Analysis (ACL, 2025)](https://aclanthology.org/2025.llmsec-1.8/)
- [California AB 489](https://www.orrick.com/en/Insights/2025/10/California-Enacts-New-Restrictions-on-Deceptive-Use-of-Healthcare-Licensing-Terms-by-AI-Systems)
- [Texas SB 1188](https://www.fenwick.com/insights/publications/the-new-regulatory-reality-for-ai-in-healthcare-how-certain-states-are-reshaping-compliance)

**MEDIUM Confidence (Verified Community Sources):**
- [DeepWiki: OpenClaw Extensions and Plugins](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins)
- [DeepWiki: OpenClaw Tool Security and Sandboxing](https://deepwiki.com/openclaw/openclaw/6.2-tool-security-and-sandboxing)
- [ClawBands (Reference Implementation)](https://github.com/SeyZ/clawbands)
- [GatewayStack (Reference Implementation)](https://github.com/davidcrowe/openclaw-gatewaystack-governance)
- [OpenClaw Issue #6535](https://github.com/openclaw/openclaw/issues/6535)
- [Engineering AI Agents for Clinical Workflows (arXiv)](https://arxiv.org/html/2602.00751v1)
- [npm Supply Chain Attacks 2026 (Bastion)](https://bastion.tech/blog/npm-supply-chain-attacks-2026-saas-security-guide)
- [2026 HIPAA Rule Updates](https://www.chesshealthsolutions.com/2025/11/06/2026-hipaa-rule-updates-what-healthcare-providers-administrators-and-compliance-officers-need-to-know/)
- [Universal AI Bypass: Policy Puppetry (HiddenLayer)](https://hiddenlayer.com/innovation-hub/novel-universal-bypass-for-all-major-llms)
- [@medplum/fhirtypes on npm](https://www.npmjs.com/package/@medplum/fhirtypes)
- [openclaw on npm](https://www.npmjs.com/package/openclaw)

**LOW Confidence (Needs VPS Validation):**
- `before_tool_call` hook wiring (PR #6570) -- merged but recent
- `after_tool_call` hook wiring (PR #6264) -- merged but recent
- `bootstrap-extra-files` hook behavior
- `registerPluginHooksFromDir` TypeScript source resolution behavior
- Plugin-shipped skills discovery and precedence
