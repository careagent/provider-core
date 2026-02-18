# State: CareAgent

## Project Reference

**Core Value:** A provider installs CareAgent into OpenClaw, completes an onboarding interview, and interacts with a personalized clinical agent that knows their specialty, speaks in their clinical voice, respects their scope boundaries, and logs every action to an immutable audit trail.

**Current Focus:** Phase 1 executing. Plans 01-02 complete, Plan 03 next.

## Current Position

**Phase:** 1 - Plugin Foundation, Clinical Activation, and Audit Pipeline
**Plan:** 03 (next to execute)
**Status:** Executing
**Progress:** [##........] 2/6 plans

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 2 |
| Plans failed | 0 |
| Total requirements | 48 |
| Requirements done | 8 |
| Requirements remaining | 40 |

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1 | 01 | 191s | 2 | 9 |
| 1 | 02 | 165s | 2 | 8 |

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
- **Activity:** Phase 1 Plan 02 execution
- **Completed:** 1-02-SUMMARY.md -- adapter layer, shared types, CANS.md TypeBox schema, 40 new tests
- **Next:** Execute Phase 1 Plan 03 (CANS parser, activation gate, integrity check)

### Context for Next Session
- Plans 01-02 complete: project scaffold + adapter + types + CANS schema all in place
- CareAgentPluginAPI interface available at src/adapter/types.ts
- createAdapter() available at src/adapter/openclaw-adapter.ts
- CANSSchema available at src/activation/cans-schema.ts
- Valid CANS fixture available at test/fixtures/valid-cans-data.ts
- Plan 03 (Wave 3): CANS parser, activation gate, integrity check (CANS-01, CANS-06, CANS-07)
- Plan 04 (Wave 3): Audit pipeline subsystem (parallel with Plan 03)
- Plan 05 (Wave 4): Wire register() + integrity service
- Plan 06 (Wave 5): Integration tests + verification
- VPS-only development -- never install on local OpenClaw
- Zero runtime npm dependencies constraint
- TypeBox for all schemas (not Zod)

---
*State initialized: 2026-02-17*
*Last updated: 2026-02-18*
