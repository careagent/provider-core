# Requirements: CareAgent

**Defined:** 2026-02-23
**Core Value:** A provider installs CareAgent, onboards via questionnaire, and interacts with a personalized clinical agent that knows their specialty, respects scope boundaries, and logs every action.

## v2.0 Requirements

Requirements for Axon-integrated questionnaire onboarding. Each maps to roadmap phases.

### Onboarding Flow

- [ ] **ONBD-01**: Onboarding asks provider name as first question
- [ ] **ONBD-02**: Onboarding asks provider type (from Axon's 49 categories) as second question
- [ ] **ONBD-03**: Provider type selection fetches the matching questionnaire from Axon at runtime
- [ ] **ONBD-04**: Questionnaire runs dynamically — boolean and single_select question types
- [ ] **ONBD-05**: Conditional questions display based on show_when rules referencing prior answers
- [ ] **ONBD-06**: Action assignments grant taxonomy actions based on questionnaire answers
- [ ] **ONBD-07**: Stub questionnaires (empty questions) block onboarding with message and suggest available types

### CANS Generation

- [ ] **CANS-01**: Questionnaire answers map to CANS.md fields via cans_field paths
- [ ] **CANS-02**: scope.permitted_actions populated from granted taxonomy actions (no free-text)
- [ ] **CANS-03**: Generated CANS.md uses version 2.0 schema
- [ ] **CANS-04**: Integrity hash computed and stored for generated CANS.md
- [ ] **CANS-05**: Generated CANS.md passes full TypeBox schema validation

### Axon Integration

- [ ] **AXON-01**: Provider-core fetches provider type list from Axon at runtime
- [ ] **AXON-02**: Provider-core fetches questionnaire for selected type from Axon at runtime
- [ ] **AXON-03**: Questionnaire answers validated against Axon's schema before CANS generation
- [ ] **AXON-04**: Graceful error handling when Axon is unreachable

## Future Requirements

### Clinical Skills

- **SKILL-01**: order-skill drafts clinical orders for provider pre-execution approval
- **SKILL-02**: charge-skill captures CPT/ICD coding with provider audit

### Patient Layer

- **PAT-01**: Patient CANS.md declares patient identity, health record access rules, and consent preferences
- **PAT-02**: Agent-to-agent communication between provider and patient CareAgents

### Security

- **SEC-01**: Cryptographic integrity for AUDIT.log (digital signatures, Merkle trees)
- **SEC-02**: HIPAA compliance implementation (encryption at rest, access controls)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authoring new questionnaires for non-Physician types | Clinical domain expert work, done in Axon repo |
| Axon platform layer (protocols, credentialing) | Separate repository and effort |
| Real patient data or PHI | Synthetic data only in dev platform |
| Direct EHR integration | Requires vendor certification, institutional IT approval |
| Full questionnaires for all 49 types | v2.0 ships with Physician fully authored; stubs block gracefully |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONBD-01 | Phase 10 | Pending |
| ONBD-02 | Phase 10 | Pending |
| ONBD-03 | Phase 10 | Pending |
| ONBD-04 | Phase 10 | Pending |
| ONBD-05 | Phase 10 | Pending |
| ONBD-06 | Phase 10 | Pending |
| ONBD-07 | Phase 10 | Pending |
| CANS-01 | Phase 11 | Pending |
| CANS-02 | Phase 11 | Pending |
| CANS-03 | Phase 11 | Pending |
| CANS-04 | Phase 11 | Pending |
| CANS-05 | Phase 11 | Pending |
| AXON-01 | Phase 9 | Pending |
| AXON-02 | Phase 9 | Pending |
| AXON-03 | Phase 11 | Pending |
| AXON-04 | Phase 9 | Pending |

**Coverage:**
- v2.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap phase mapping*
