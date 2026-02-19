# State: CareAgent

## Project Reference

**Core Value:** A provider installs CareAgent into OpenClaw, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

**Current Focus:** Phase 4 (Clinical Skills) in progress. Credential validator complete.

## Current Position

**Phase:** 4 - Clinical Skills
**Plan:** 01 of 05
**Status:** In Progress
**Progress:** [##--------] 1/5 plans (Phase 4)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 21 |
| Plans failed | 0 |
| Total requirements | 52 |
| Requirements done | 34 |
| Requirements remaining | 18 |

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1 | 01 | 191s | 2 | 9 |
| 1 | 02 | 165s | 2 | 8 |
| 1 | 03 | 198s | 2 | 12 |
| 1 | 04 | 183s | 2 | 5 |
| 1 | 05 | 172s | 2 | 4 |
| 1 | 06 | 202s | 2 | 3 |
| 2 | 01 | 160s | 7 | 7 |
| 2 | 02 | 203s | 5 | 5 |
| 2 | 03 | 219s | 4 | 4 |
| 2 | 04 | 210s | 4 | 4 |
| 2 | 05 | 192s | 2 | 2 |
| 2 | 06 | 249s | 4 | 4 |
| 2.1 | 01 | 169s | 2 | 8 |
| 2.1 | 02 | 167s | 2 | 16 |
| 2.1 | 03 | 113s | 2 | 2 |
| 2.1 | 04 | 114s | 3 | 2 |
| 3 | 01 | 191s | 2 | 9 |
| 3 | 02 | 134s | 2 | 4 |
| 3 | 03 | 180s | 2 | 5 |
| 3 | 04 | 226s | 3 | 4 |
| 4 | 01 | 90s | 2 | 2 |

## Accumulated Context

### Key Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| 6-phase roadmap derived from requirement dependencies | Roadmap | Natural delivery boundaries: skeleton -> onboarding -> hardening -> skills -> integration -> docs |
| Phase 1 combines PLUG + CANS + AUDT | Roadmap | These three components are deeply interdependent -- audit logs CANS activation, plugin registers both |
| Phase 5 separates integration from documentation | Roadmap | Comprehensive depth; integration validates the system, docs describe the validated system |
| Hardening before skills (Phase 3 before Phase 4) | Roadmap | Research finding: clinical skills must never load into an unhardened environment |
| 6 plans in 5 waves for Phase 1 | Planning | Wave 3 parallelizes activation gate and audit pipeline (independent subsystems) |
| Vendor yaml package via tsdown bundling | Planning | Zero-dep constraint + YAML 1.2 avoids Norway problem. yaml package is ISC, zero deps itself |
| Adapter layer from day one | Planning | OpenClaw releases daily with breaking changes. Adapter insulates all CareAgent code |
| Hash chaining from first audit entry | Planning | Research + pitfall analysis: deferring hash chains is the #1 audit integrity mistake |
| tsdown outExtensions for .js/.d.ts output | 1-01 | tsdown 0.20 defaults to .mjs/.d.mts; explicit outExtensions ensures package.json exports match |
| Every OpenClaw API call wrapped in try/catch | 1-02 | Graceful degradation prevents plugin crashes when OpenClaw API changes |
| 3-level workspace path fallback | 1-02 | Different OpenClaw versions expose workspace path at different locations on the API object |
| clinical_voice Optional, all other CANS root sections required | 1-02 | Clinical voice populated during onboarding (Phase 2); other sections required for activation |
| Union of Literals for license type in TypeBox | 1-02 | String enums would allow any string at runtime; literals enforce exact match |
| Vendored yaml via src/vendor/yaml/index.ts | 1-03 | Centralized and replaceable YAML parsing; bundled by tsdown, not external |
| First-load trust model for integrity checking | 1-03 | First verifyIntegrity call stores hash; subsequent calls compare against stored value |
| AuditCallback injection decouples gate from pipeline | 1-03 | ActivationGate accepts callback at construction, avoiding circular dependency with audit |
| Zero runtime dependencies for audit subsystem | 1-04 | Uses only node:fs and node:crypto built-ins, honoring the zero-dep constraint |
| Hash chaining from genesis entry (prev_hash: null) | 1-04 | Research finding: deferring hash chains is the #1 audit integrity mistake |
| Spread-conditional pattern for optional fields | 1-04 | Prevents undefined values from appearing in JSON serialization |
| Audit log stored in .careagent/AUDIT.log | 1-04 | Standard workspace subdirectory, created automatically with recursive mkdir |
| CLI registered before activation check | 1-05 | Commands must work without CANS.md (needed for careagent init in Phase 2) |
| Integrity service checks on startup + 60s interval | 1-05 | Background chain verification catches tampering between explicit verifyChain calls |
| Hook canary with 30s delayed warning | 1-05 | Detects missing before_tool_call wiring without blocking startup |
| Real temp workspaces for integration tests | 1-06 | mkdtempSync workspaces ensure file I/O paths are fully exercised end-to-end |
| Mock API records all method calls | 1-06 | Captures registerCli, registerService, on() calls for assertion without OpenClaw coupling |
| Separate test/integration/ directory | 1-06 | Clean separation from unit tests in test/unit/ |
| InterviewIO interface abstracts readline for testability | 2-01 | createMockIO captures output array; createTerminalIO uses node:readline/promises |
| Recursive reprompt pattern in prompt utilities | 2-01 | askText/askLicenseType/askAutonomyTier recurse on invalid input; keeps validation co-located |
| Typed literals via const tuple indexing | 2-01 | askLicenseType returns typeof LICENSE_TYPES[number]; compile-time safety over 8 license types |
| registerCLI accepts workspacePath and audit as future params | 2-01 | Parameters underscore-prefixed now; Plan 06 will use them when interview is wired |
| Stage dispatch via STAGE_HANDLERS record (not switch) | 2-02 | O(1) lookup; adding stages requires only a new handler + record entry |
| state.philosophy separate from state.data | 2-02 | Philosophy is prose, not CANS YAML; stored separately for CANS.md generation in Plan 03 |
| Mandatory re-prompt loops for welcome/consent | 2-02 | Non-negotiable acknowledgments -- cannot skip; safety requirement |
| Validate before YAML stringify in generateCANSContent | 2-03 | TypeBox errors are structured (path + message); YAML parse errors are less useful for onboarding UX |
| Philosophy in markdown body only, not YAML frontmatter | 2-03 | Philosophy is prose context for LLM, not a structured data field; keeps CANS.md schema clean |
| updateKnownGoodHash called atomically after writeFileSync | 2-03 | Integrity hash must match the file on disk; seeded immediately to prevent false tamper alerts |
| MENU_TO_STAGE record for review menu dispatch | 2-03 | O(1) lookup from menu choice to InterviewStage; adding edit sections requires only a new entry |
| toggleHardeningLoop as inner async function with onUpdate callback | 2-03 | Separate function is testable; callback pattern avoids direct mutation through shared state reference |
| HTML comment markers for workspace supplementation | 2-04 | Round-trip idempotency: BEGIN/END markers let supplementFile replace without corrupting user content |
| Atomic write via .tmp rename | 2-04 | Prevents partial-write corruption if process interrupted during SOUL/AGENTS/USER.md writes |
| Pure function generators with conditional omission | 2-04 | Optional fields (subspecialty, clinical_voice, NPI) omitted entirely -- never rendered empty |
| Status integrity check bypasses gate side effect | 2-05 | verifyIntegrity creates store on first load; status reads store directly + computes hash to avoid write |
| No-op audit callback for status command | 2-05 | Status is a read-only inspection -- logging gate checks to audit trail would pollute the log |
| checkIntegrity three-state: No CANS.md / No hash stored / Verified or MISMATCH | 2-05 | Covers all observable integrity states without triggering side-effect store creation |
| io.close() in finally block in runInitCommand | 2-06 | Ensures readline interface always closed; without this Node.js event loop stays alive indefinitely |
| supplementWorkspaceFiles after reviewLoop in init | 2-06 | Review loop may iterate multiple times; workspace files must use final approved data |
| Integration tests use fresh AuditPipeline per test | 2-06 | Prevents cross-test contamination; each mkdtempSync workspace gets its own AUDIT.log |
| Rename CareAgentPluginAPI to PlatformAdapter | PORT | Platform-neutral naming; backward-compat type alias preserved |
| src/adapters/ (plural) with platform subdirectories | PORT | Multi-platform adapter structure; old src/adapter/ kept as re-export shims |
| Workspace profiles for platform-specific file supplementation | PORT | OpenClaw: SOUL+AGENTS+USER; AGENTS.md standard: single AGENTS.md; standalone: none |
| Multiple entry points (index, openclaw, standalone, core) | PORT | Platform-specific or pure-library usage without coupling to OpenClaw |
| OpenClaw peer dependency marked optional | PORT | Enables standalone usage without OpenClaw installed |
| Duck-typing platform detection | PORT | detectPlatform checks registerCli + on presence; no dependency on platform-specific types |
| Factory stubs throw errors naming their target phase for traceability | 2.1-02 | createHardeningEngine throws "Phase 3", createCredentialValidator throws "Phase 4", neuron/protocol throw "Phase 5" |
| Async methods for network-bound stub interfaces | 2.1-02 | NeuronClient and ProtocolServer return Promises since real implementations do network I/O |
| Self-contained types for neuron and protocol | 2.1-02 | NeuronRegistration and ProtocolSession use primitives only, avoiding coupling to CANS/adapter/audit |
| All three new CANS fields Type.Optional() for backward compatibility | 2.1-03 | Existing CANS.md files and test fixtures remain valid without modification |
| Sub-schemas exported individually for downstream use | 2.1-03 | NeuronConfigSchema, SkillGatingSchema, CrossInstallationConsentSchema available as standalone imports |
| Use PlatformAdapter (canonical) over CareAgentPluginAPI (deprecated) in new code | 2.1-01 | commands.ts updated to canonical name; deprecated alias still exported for external consumers |
| tsc --noEmit pre-existing failures are not blockers | 2.1-01 | node: module resolution errors exist before and after changes; tsdown build succeeds |
| Core entry point re-exports both types and factories from stub modules | 2.1-04 | Complete API surface via @careagent/provider-core/core; downstream can import everything from one path |
| README documents all 11 actual src/ directories with stub annotations | 2.1-04 | Removed 4 non-existent directories; added adapters/, cli/, entry/, vendor/; stubs marked [stub -- Phase N] |
| HardeningEngine.check() accepts ToolCallEvent instead of raw (toolName, params) | 3-01 | Structured event type is safer and more extensible; no consumers exist to break |
| Prohibited trumps permitted in tool-policy layer | 3-01 | Safety-first: if a tool appears in both lists, deny always wins |
| Conservative exec allowlist (read-only utilities + git) | 3-01 | cat, ls, head, tail, wc, git, grep, find, echo, sort, uniq, diff -- safe defaults extensible later |
| EXEC_TOOL_NAMES includes both Bash and exec | 3-01 | Multi-platform compatibility: OpenClaw uses Bash, other platforms may use exec |
| extractProtocolRules produces markdown under 2000 chars with provider/scope/autonomy | 3-02 | Concise format for system prompt injection; keeps token budget manageable |
| Layer 3 per-check is non-blocking pass-through | 3-02 | Injection happens at bootstrap; per-call check only reports status |
| Layer 4 checks three Docker signals with graceful /proc fallback | 3-02 | /.dockerenv, /proc/1/cgroup, CONTAINER env var; try/catch for non-Linux |
| Layer 4 is report-only: never returns allowed: false | 3-02 | Sandbox detection informs audit trail, does not gate tool execution |
| Engine iterates LAYERS array in fixed order; short-circuits on first deny | 3-03 | Predictable evaluation order; deny-fast reduces unnecessary computation |
| Every layer result audit-logged (not just denies) | 3-03 | Full traceability for compliance; allows forensic review of what was allowed and why |
| Canary timer unref'd | 3-03 | Prevents background timer from keeping Node.js process alive after plugin cleanup |
| before_tool_call handler marks canary verified before running check() | 3-03 | Canary tracks hook liveness, not check outcomes; verification happens regardless of allow/deny |
| Engine replaces inline canary entirely in openclaw.ts | 3-04 | Canary was internal implementation; engine owns the complete hook lifecycle now |
| Standalone exposes engine as optional on ActivateResult | 3-04 | Programmatic consumers can call engine.check() directly for layer evaluation |
| Integration tests use real AuditPipeline not mocks | 3-04 | True end-to-end verification of audit entries written to disk with hash chaining |
| Three-dimension credential check: license, specialty, privilege evaluated independently | 4-01 | Failures in multiple dimensions all reported; no short-circuit on first failure |
| Subspecialty match counts as specialty pass | 4-01 | Provider's subspecialty checked alongside primary specialty for flexible credential matching |
| Empty/undefined credential requirements pass automatically | 4-01 | Enables SKIL-02: regular OpenClaw skills (no credential requirements) always pass validation |

### Roadmap Evolution

- Phase 2.1 inserted after Phase 2: Architectural Alignment — Restructure codebase to match README target architecture, expand CANS schema for ecosystem readiness, update README to document proven abstractions, prepare module interfaces for neuron/protocol/credentials/hardening (URGENT)

### Research Findings Applied

- Five-phase structure from research expanded to six (split integration/docs for comprehensive depth)
- Hash chaining from day one (AUDT-04 in Phase 1, not deferred)
- Adapter layer in Phase 1 (PLUG-04) per pitfall prevention
- before_tool_call canary test (HARD-07) as explicit requirement
- Template-constrained generation for chart-skill (SKIL-05) per hallucination prevention
- YAML 1.2 default avoids implicit type coercion (Pitfall 2)
- Session-scoped audit chains allow concurrent sessions

### TODOs

- None yet

### Blockers

- None yet

## Session Continuity

### Last Session
- **Date:** 2026-02-19
- **Activity:** Phase 4 Plan 01 - Credential Validator Implementation
- **Completed:** 04-01 -- Real credential validator replacing stub, 21 comprehensive tests, 504 tests total
- **Next:** Phase 4 Plan 02 (skill framework core: types, manifest schema, integrity, version pinning)

### Context for Next Session
- Phase 4 (Clinical Skills) IN PROGRESS: 1/5 plans complete
- Credential validator checks license type, specialty/subspecialty, and privileges
- Empty/undefined requirements pass automatically (SKIL-02 foundation)
- Spread-conditional pattern for optional missingCredentials/reason fields
- 504 tests passing across 36 test files (21 credential tests replacing 3 stubs)
- Build succeeds with all 4 entry points (index, openclaw, standalone, core)
- VPS-only development -- never install on local OpenClaw
- Zero runtime npm dependencies constraint
- TypeBox for all schemas (not Zod)

---
*State initialized: 2026-02-17*
*Last updated: 2026-02-19 (Phase 4 Plan 01 complete -- 504 tests total, credential validator implemented)*
