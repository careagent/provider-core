# Phase 5: CANS Continuous Improvement and Integration - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

CareAgent proposes refinements to the provider's CANS.md based on observed usage patterns, and the complete end-to-end flow from fresh install to clinical documentation generation is verified. This phase does NOT create user-facing documentation (Phase 6) or add new clinical skills.

</domain>

<decisions>
## Implementation Decisions

### Refinement triggers
- Watch for ALL observable divergence patterns: voice drift, autonomy tier mismatch, unused credential sections, skill usage frequency, and any other measurable divergence between CANS.md declarations and actual behavior
- Scope of practice is NEVER proposed for change — scope fields are sacrosanct and off-limits for the refinement engine
- All other CANS.md fields (including identity fields like name/NPI if they look stale) are eligible for proposals
- Require a clear pattern (5+ observations of the same divergence) before generating a proposal — minimize false positives
- Proactive batched delivery: collect observations during usage and present a batch of proposals at session start or end

### Proposal experience
- Proposals show BOTH a natural language explanation (WHY the change is suggested) and a diff view (WHAT would change in CANS.md)
- Provider actions on a proposal: Accept, Reject, or Defer (no modify — accept as-is or reject)
- Batch presentation: show summary list of all pending proposals first, provider picks which to review in detail
- Accepted proposals write to CANS.md immediately — no additional confirmation step after acceptance

### Audit & safety rails
- Rejected proposals can resurface after a higher observation threshold (e.g., 10+ additional observations) with updated evidence
- Deferred proposals persist indefinitely in the queue until the provider explicitly acts on them
- Each proposal includes a human-readable evidence summary explaining the observations that triggered it (e.g., "5 of your last 8 progress notes used conversational tone instead of your declared formal voice")
- Every proposal lifecycle event (proposed, accepted, rejected, deferred, resurfaced) is recorded in AUDIT.log

### E2E verification scope
- Integration tests cover happy path + error paths + adversarial scenarios
  - Happy: fresh install -> onboard -> generate chart note -> verify audit trail
  - Error: missing CANS.md, malformed CANS.md, expired credentials, tampered skill files
  - Adversarial: bypass hardening attempts, scope violations, audit log tampering
- Security review is automated test scenarios exercising each of the six hardening layers with cases that should be blocked
- Phase 5 verifies the install-to-clinical-agent path works but does NOT write user-facing docs (Phase 6 territory)
- Integration tests use a realistic synthetic neurosurgeon persona (specific NPI, license, privileges) to exercise real credential paths

### Claude's Discretion
- Observation storage format and persistence mechanism
- Exact re-proposal threshold after rejection (suggested 10+ but Claude can tune)
- Session boundary detection for batched proposal delivery
- Specific adversarial test scenarios beyond the categories above
- Internal architecture of the refinement engine (pattern matcher, observation store, proposal generator)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-cans-continuous-improvement-and-integration*
*Context gathered: 2026-02-19*
