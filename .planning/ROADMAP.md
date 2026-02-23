# Roadmap: CareAgent

**Created:** 2026-02-17

---

## Milestones

- ✅ **v1.0 CareAgent Provider Core MVP** — Phases 1-8 (shipped 2026-02-22)
- 🚧 **v2.0 Axon-Integrated Questionnaire Onboarding** — Phases 9-11 (in progress)

## Phases

<details>
<summary>✅ v1.0 CareAgent Provider Core MVP (Phases 1-8) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline (6/6 plans) — completed 2026-02-18
- [x] Phase 2: Onboarding and CLI (6/6 plans) — completed 2026-02-18
- [x] Phase 2.1: Architectural Alignment (4/4 plans) — completed 2026-02-19
- [x] Phase 3: Runtime Hardening (4/4 plans) — completed 2026-02-19
- [x] Phase 4: Clinical Skills (5/5 plans) — completed 2026-02-19
- [x] Phase 5: CANS Continuous Improvement and Integration (3/3 plans) — completed 2026-02-19
- [x] Phase 6: Documentation and Release (3/3 plans) — completed 2026-02-22
- [x] Phase 7: Production Wiring Gap Closure (2/2 plans) — completed 2026-02-21
- [x] Phase 8: Workspace Profile Selection Wiring (2/2 plans) — completed 2026-02-22

Full details: milestones/v1.0-ROADMAP.md

</details>

### v2.0 Axon-Integrated Questionnaire Onboarding

- [ ] **Phase 9: Axon Client Layer** - Provider-core fetches taxonomy and questionnaires from Axon at runtime with graceful error handling
- [ ] **Phase 10: Questionnaire Execution Engine** - Onboarding runs Axon questionnaires dynamically with conditional logic, action assignments, and stub blocking
- [ ] **Phase 11: CANS v2.0 Generation** - Questionnaire answers deterministically produce a validated v2.0 CANS.md

## Phase Details

### Phase 9: Axon Client Layer
**Goal**: Provider-core can retrieve Axon's provider type taxonomy and fetch questionnaires for any selected type at runtime
**Depends on**: Nothing (first v2.0 phase; builds on v1.0 foundation)
**Requirements**: AXON-01, AXON-02, AXON-04
**Success Criteria** (what must be TRUE):
  1. Provider-core retrieves the full list of 49 provider types (id, display_name, category) from Axon without bundling Axon data
  2. Provider-core fetches the questionnaire JSON for a given provider type ID from Axon and receives validated question data
  3. When Axon is unreachable or returns invalid data, provider-core surfaces a clear error message and does not crash or proceed with stale data
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md — Axon client interface, HTTP implementation, and core.ts wiring
- [ ] 09-02-PLAN.md — Unit and integration tests proving AXON-01, AXON-02, AXON-04

### Phase 10: Questionnaire Execution Engine
**Goal**: Onboarding asks only name and provider type, then dynamically runs the fetched questionnaire with conditional logic and scope determination
**Depends on**: Phase 9
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05, ONBD-06, ONBD-07
**Success Criteria** (what must be TRUE):
  1. Onboarding asks provider name as the first question and provider type (selected from Axon's 49 categories) as the second question — no other hardcoded stages
  2. After type selection, the matching questionnaire is fetched from Axon and its questions are presented dynamically (boolean prompts and single-select menus)
  3. Questions with show_when conditions only appear when the referenced prior answer matches the specified value
  4. Action assignments accumulate granted taxonomy actions based on the provider's answers to each question
  5. When a stub questionnaire is fetched (empty questions array), onboarding blocks with a message explaining the type is not yet available and suggests types that have full questionnaires
**Plans**: TBD

### Phase 11: CANS v2.0 Generation
**Goal**: Questionnaire answers are deterministically mapped to CANS.md fields, producing a schema-validated v2.0 CANS document with integrity hash
**Depends on**: Phase 10
**Requirements**: CANS-01, CANS-02, CANS-03, CANS-04, CANS-05, AXON-03
**Success Criteria** (what must be TRUE):
  1. Each questionnaire answer populates the correct CANS.md field via the cans_field path from the question definition — no free-text scope entry
  2. scope.permitted_actions contains exactly the taxonomy action IDs granted by action_assignments, not user-typed strings
  3. The generated CANS.md has version "2.0" and passes full TypeBox CANSSchema validation with no errors
  4. An integrity hash (SHA-256) is computed and stored for the generated CANS.md, consistent with v1.0 integrity verification
  5. Questionnaire answers are validated against Axon's schema constraints before CANS generation begins — invalid answers are rejected with actionable error messages
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Plugin Foundation | v1.0 | 6/6 | Complete | 2026-02-18 |
| 2. Onboarding and CLI | v1.0 | 6/6 | Complete | 2026-02-18 |
| 2.1. Architectural Alignment | v1.0 | 4/4 | Complete | 2026-02-19 |
| 3. Runtime Hardening | v1.0 | 4/4 | Complete | 2026-02-19 |
| 4. Clinical Skills | v1.0 | 5/5 | Complete | 2026-02-19 |
| 5. CANS Continuous Improvement | v1.0 | 3/3 | Complete | 2026-02-19 |
| 6. Documentation and Release | v1.0 | 3/3 | Complete | 2026-02-22 |
| 7. Production Wiring Gap Closure | v1.0 | 2/2 | Complete | 2026-02-21 |
| 8. Workspace Profile Selection | v1.0 | 2/2 | Complete | 2026-02-22 |
| 9. Axon Client Layer | v2.0 | 0/2 | Planning complete | - |
| 10. Questionnaire Execution Engine | v2.0 | 0/0 | Not started | - |
| 11. CANS v2.0 Generation | v2.0 | 0/0 | Not started | - |

---
*Roadmap created: 2026-02-17*
*Last updated: 2026-02-23 after Phase 9 planning*
