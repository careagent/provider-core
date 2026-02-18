# State: CareAgent

## Project Reference

**Core Value:** A provider installs CareAgent into OpenClaw, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

**Current Focus:** Phase 2 in progress. Plan 04 (Workspace Supplementation) complete.

## Current Position

**Phase:** 2 - Onboarding and CLI
**Plan:** 04 (complete)
**Status:** In Progress
**Progress:** [####------] 4/? plans

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 10 |
| Plans failed | 0 |
| Total requirements | 48 |
| Requirements done | 18 |
| Requirements remaining | 30 |

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
| 2 | 03 | - | - | - |
| 2 | 04 | 210s | 4 | 4 |

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
| HTML comment markers for workspace supplementation | 2-04 | Round-trip idempotency: BEGIN/END markers let supplementFile replace without corrupting user content |
| Atomic write via .tmp rename | 2-04 | Prevents partial-write corruption if process interrupted during SOUL/AGENTS/USER.md writes |
| Pure function generators with conditional omission | 2-04 | Optional fields (subspecialty, clinical_voice, NPI) omitted entirely -- never rendered empty |

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
- **Date:** 2026-02-18
- **Activity:** Phase 2 Plan 04 execution (Workspace File Supplementation)
- **Completed:** 2-04-SUMMARY.md -- workspace-content.ts, workspace-writer.ts, 47 new tests (279 total)
- **Next:** Phase 2 Plan 05 (careagent status command)

### Context for Next Session
- Phase 2 Plan 04 COMPLETE: Workspace supplementation system established
- 279 tests passing (211 Phase 1+2-01+2-02+2-03 + 68 new), build succeeds, no TypeScript errors
- src/onboarding/workspace-content.ts: pure generators for SOUL.md, AGENTS.md, USER.md sections
- src/onboarding/workspace-writer.ts: supplementFile() pure function + supplementWorkspaceFiles() I/O
- HTML comment markers <!-- CareAgent: BEGIN/END --> enable idempotent round-trips
- Atomic writes via .tmp rename for all three workspace files
- supplementFile handles: empty, append (with correct separator), replace-in-place
- validCANSData fixture has clinical_voice undefined -- tests cover both presence and absence
- VPS-only development -- never install on local OpenClaw
- Zero runtime npm dependencies constraint
- TypeBox for all schemas (not Zod)
- Phase 2 requirements: ONBD-01..05 (careagent init, CANS.md generation, SOUL/AGENTS/USER.md, careagent status, iterative refinement)

---
*State initialized: 2026-02-17*
*Last updated: 2026-02-18 (Phase 2 Plan 04 complete -- workspace supplementation system)*
