# State: CareAgent

## Project Reference

**Core Value:** A provider installs CareAgent into OpenClaw, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

**Current Focus:** Phase 1 executing. Plans 01-05 complete, Plan 06 next.

## Current Position

**Phase:** 1 - Plugin Foundation, Clinical Activation, and Audit Pipeline
**Plan:** 06 (next to execute)
**Status:** Executing
**Progress:** [#####.....] 5/6 plans

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 5 |
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
- **Activity:** Phase 1 Plan 05 execution (plugin wiring + integrity service)
- **Completed:** 1-05-SUMMARY.md -- register() entry point wired, audit integrity service, 7 new tests (94 total)
- **Next:** Execute Phase 1 Plan 06 (comprehensive test suite + phase verification)

### Context for Next Session
- Plans 01-05 complete: full plugin foundation wired end-to-end
- register(api) in src/index.ts connects adapter, activation gate, audit pipeline, integrity service
- 8-step initialization: adapter -> audit -> CLI -> gate -> log -> canary -> integrity -> canary-check
- Inactive mode returns early; active mode wires all subsystems
- Audit integrity service at src/audit/integrity-service.ts (60s periodic chain verification)
- Hook canary pattern detects missing before_tool_call wiring after 30s
- All subsystems from Plans 01-04 unchanged and fully tested
- Plan 06 (Wave 5): Integration tests + verification (final plan in Phase 1)
- 94 tests passing, build succeeds
- VPS-only development -- never install on local OpenClaw
- Zero runtime npm dependencies constraint
- TypeBox for all schemas (not Zod)

---
*State initialized: 2026-02-17*
*Last updated: 2026-02-18 (Plan 05 complete)*
