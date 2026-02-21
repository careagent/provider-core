# Codebase Concerns

**Analysis Date:** 2026-02-21

## Tech Debt

**Skill manifest field naming mismatch (degrees vs license):**
- Issue: `src/skills/loader.ts` line 154 passes `manifest.requires.license` to the `degrees` field of `CredentialValidator.check()`. The manifest schema uses `requires.license`, but the validator interface uses `degrees`. These are semantically different fields: `degrees` check `provider.degrees` (MD, DO), while `licenses` check `provider.licenses` (MD-TX-A12345). The mismatch means a skill that specifies `requires.license: ["MD"]` will be validated against provider degree strings, not license strings.
- Files: `src/skills/loader.ts:154`, `src/skills/types.ts`, `src/credentials/validator.ts:30-33`
- Impact: Clinical skill credential gating may pass or fail incorrectly. A provider with a license string "MD-TX-12345" and no degrees entry of "MD" would be blocked from a skill requiring `license: ["MD"]`, even though they hold an MD degree. Conversely, a provider with degree "MD" could pass a license check that was intended to match against license identifier strings.
- Fix approach: Either (1) rename `manifest.requires.license` to `manifest.requires.degrees` in `SkillManifest` and update the schema, or (2) change the loader call on line 154 to pass to `licenses` instead of `degrees`.

**`skill_usage` observation category has empty field path list:**
- Issue: `CATEGORY_FIELDS` in `src/refinement/types.ts` declares `skill_usage: []` with a comment "Dynamic: populated from skills.authorized entries at runtime." No runtime population code exists anywhere in the codebase. Observations submitted with `category: 'skill_usage'` will never map to any field path for divergence detection.
- Files: `src/refinement/types.ts:58-60`, `src/refinement/pattern-matcher.ts`
- Impact: The `skill_usage` observation category is silently inoperative. Any caller recording skill usage observations will never see proposals generated from them. The comment suggests this was intended to be implemented but was deferred.
- Fix approach: Implement runtime population by passing the loaded skills list into pattern detection, or remove `skill_usage` from the `ObservationCategory` type until it is implemented.

**Duplicate proposal lookup in `resolveProposal`:**
- Issue: `src/refinement/refinement-engine.ts:102` calls `queue.getById(proposalId)` to retrieve the proposal, then `src/refinement/refinement-engine.ts:112` calls `queue.resolve(proposalId, action)` which internally calls `store.proposals.find(p => p.id === proposalId)` again. This is a double linear scan on every resolution.
- Files: `src/refinement/refinement-engine.ts:101-115`, `src/refinement/proposal-queue.ts:85-103`
- Impact: Low impact at current scale (proposals are few and the file is small), but indicates a design inconsistency where the engine both fetches and then re-fetches the same object.
- Fix approach: Use the return value of `queue.resolve()` instead of the pre-fetched `proposal` object, or have `resolve()` accept the already-fetched proposal.

**Audit outcome type unsafe cast in entry points:**
- Issue: Both `src/entry/openclaw.ts:40` and `src/entry/standalone.ts:52` use `(entry.outcome as 'error') || 'error'`. This casts the outcome to `'error'` regardless of what the audit callback actually contains, then falls back to `'error'` if falsy. This means any non-error audit outcomes from `ActivationGate` (e.g., `'active'`, `'inactive'`) get incorrectly typed, though at runtime they pass through as-is due to JavaScript's OR behavior with truthy strings.
- Files: `src/entry/openclaw.ts:40`, `src/entry/standalone.ts:52`
- Impact: TypeScript types are misleading; the cast says `'error'` but runtime behavior passes through the actual value. This is a type accuracy issue, not a runtime bug, but makes auditing the audit callback harder.
- Fix approach: Pass the `AuditCallback` type from `gate.ts` directly to entry-point wiring, or type the callback parameter correctly as `AuditLogInput['outcome']`.

**`as unknown as CANSDocument` cast in activation gate:**
- Issue: `src/activation/gate.ts:90` casts `frontmatter as unknown as CANSDocument` after TypeBox validation succeeds. While the TypeBox `Value.Check` guard does validate the shape, the cast bypasses TypeScript's type narrowing. If the TypeBox schema and the `CANSDocument` type ever diverge, this cast masks the mismatch.
- Files: `src/activation/gate.ts:90`
- Impact: Low risk currently because TypeBox schema and type are derived from the same `Type.Object()` call via `Static<typeof CANSSchema>`. Risk increases if the schema is modified independently of the type.
- Fix approach: Use TypeBox's `Value.Cast` or return the already-correctly-typed result from `Value.Check` narrowing.

**OpenClaw adapter uses `api as any`:**
- Issue: `src/adapters/openclaw/index.ts:29` and `src/adapters/detect.ts:18` cast the raw plugin API to `any`. This is an intentional design choice for defensive adaptation, but it bypasses all type safety when interacting with the host platform.
- Files: `src/adapters/openclaw/index.ts:29`, `src/adapters/detect.ts:18`
- Impact: Type errors in OpenClaw API calls will be invisible to TypeScript. The extensive try/catch wrapping around every `raw.*` call mitigates runtime risk significantly.
- Fix approach: Create a minimal `OpenClawAPI` interface matching known OpenClaw patterns and use it in place of `any`, with type guards at runtime boundaries.

---

## Known Bugs

**`manifest.requires.license` mapped to `degrees` check (also listed as tech debt):**
- Symptoms: Skills that specify `requires.license: ["MD"]` validate against the provider's `degrees` array, not their `licenses` array. A provider who has not enumerated their degrees in CANS.md but has a license listed will be incorrectly blocked.
- Files: `src/skills/loader.ts:154`
- Trigger: Any clinical skill with `requires.license` populated and a provider whose CANS.md has different values in `degrees` vs `licenses`.
- Workaround: Providers can add the same values to both `degrees` and `licenses` fields in CANS.md to ensure the validation passes both checks.

---

## Security Considerations

**Audit log file integrity chain is verifiable but not protected from deletion:**
- Risk: The hash-chained AUDIT.log prevents silent tampering, but an attacker with filesystem access can delete the file entirely, removing the audit record without a chain break being detectable. The `verifyChain()` method returns `{ valid: true, entries: 0 }` for a missing file.
- Files: `src/audit/writer.ts:49-51`
- Current mitigation: Hash chaining detects content modification. The canary detects hook bypass. Integrity is checked every 60 seconds by the background service.
- Recommendations: Log to an append-only filesystem location, or emit audit events to a secondary channel (syslog, remote endpoint) for off-workspace persistence. Consider alerting when the log file disappears rather than silently treating it as empty.

**`proposals.json` file can be tampered to redirect accepted proposals to scope fields:**
- Risk: As demonstrated in `test/integration/security-review.test.ts:443-457`, an attacker with workspace write access can modify `.careagent/proposals.json` to set `field_path: 'scope.permitted_actions'`. If the provider then accepts the proposal, the `applyProposal` function will throw a `SAFETY VIOLATION` error — but only at application time, not at proposal review time. The provider sees the tampered proposal text during review without any visible indication it targets a scope field.
- Files: `src/refinement/refinement-engine.ts:180-182`, `src/refinement/proposal-queue.ts`
- Current mitigation: Defense layer 3 (`isScopeField` check in `applyProposal`) prevents the tampered value from being written to CANS.md. The accept operation throws and is not committed.
- Recommendations: Validate `field_path` against `isScopeField` when loading proposals from disk (during `ProposalQueue.load()`), not only at apply time. Display a security warning if a proposal targets an unusual field path.

**CANS.md integrity store does not detect store file replacement:**
- Risk: `src/activation/cans-integrity.ts` writes the known-good hash to `.careagent/cans-integrity.json`. An attacker with workspace write access could replace both CANS.md and its integrity store simultaneously, bypassing the integrity check.
- Files: `src/activation/cans-integrity.ts:23-29`
- Current mitigation: First-load creates the hash store, subsequent loads compare against it. Requires both files to be modified atomically to bypass.
- Recommendations: This is a known limitation of local-only integrity checking; consider signing the integrity store with a provider key or storing the reference hash outside the workspace.

**Exec allowlist uses first-token extraction, not full command parsing:**
- Risk: `src/hardening/layers/exec-allowlist.ts:62` splits on whitespace and takes the first token. Complex shell commands with subshells (e.g., `cat $(rm -rf /)`) would pass if the first token is `cat`. The subshell would execute as the agent.
- Files: `src/hardening/layers/exec-allowlist.ts:62-64`
- Current mitigation: The allowlist only applies to `Bash`/`exec` tool calls, which must first pass the tool-policy layer. If `Bash` is not in `permitted_actions`, no exec call reaches this layer.
- Recommendations: Implement shell metacharacter detection (`;`, `|`, `$(`, backtick, `&&`, `||`) and deny commands containing them. Add the test pattern explicitly to the test suite.

**Docker sandbox detection is report-only and does not enforce sandboxing:**
- Risk: Layer 4 (`src/hardening/layers/docker-sandbox.ts`) detects whether the runtime is in a container but never blocks execution regardless of the result. The audit log entry says "no container detected — running outside sandbox" but the tool call proceeds.
- Files: `src/hardening/layers/docker-sandbox.ts:71-89`
- Current mitigation: The detection exists for audit visibility. The system does not claim to require containerization.
- Recommendations: Document clearly that containerization is advisory, not enforced. If sandboxing becomes a hard requirement, change this layer to `allowed: false` when outside a container.

---

## Performance Bottlenecks

**Audit chain verification reads entire log file into memory:**
- Problem: `AuditWriter.verifyChain()` in `src/audit/writer.ts:55-88` reads the entire AUDIT.log with `readFileSync`, splits it into lines, and iterates over all entries. The background service in `src/audit/integrity-service.ts` calls this every 60 seconds.
- Files: `src/audit/writer.ts:55-88`, `src/audit/integrity-service.ts:48-58`
- Cause: No streaming or pagination; full file read on every check.
- Improvement path: Track the last-verified offset and only re-verify from that point on each subsequent check. For the background service, an incremental verifier that maintains a cursor would reduce I/O from O(n) to O(new entries) per check.

**Observation store reads entire file on every `generateProposals` call:**
- Problem: `ObservationStore.query()` in `src/refinement/observation-store.ts:40-41` reads the entire `observations.jsonl` into memory, parses every line, then applies in-memory filters. Called on every `generateProposals()` invocation, which runs each time the `careagent proposals` command is executed.
- Files: `src/refinement/observation-store.ts:35-53`, `src/refinement/refinement-engine.ts:73`
- Cause: No indexing, no streaming, no cursor-based reading.
- Improvement path: Cap observation store to a rolling window (e.g., last 1000 observations), or index by `field_path` at write time.

**Audit log and observation store have no size bounds:**
- Problem: Neither AUDIT.log nor observations.jsonl have rotation, truncation, or pruning logic. Both grow without bound for the lifetime of a workspace.
- Files: `src/audit/writer.ts`, `src/refinement/observation-store.ts`
- Cause: Intentional append-only design with no retention policy implemented.
- Improvement path: Add configurable retention (e.g., keep last N entries, or entries within last D days). The hash chain integrity system would need to handle log rotation gracefully (new genesis entry).

---

## Fragile Areas

**HardeningEngine `check()` throws if called before `activate()`:**
- Files: `src/hardening/engine.ts:40-43`
- Why fragile: The engine uses a boolean `activated` flag with a `let cans: CANSDocument` that is set in `activate()`. Calling `check()` before `activate()` throws `'Engine not activated'`. TypeScript does not prevent this call order. The engine is always activated immediately after construction in both entry points, but test code or future callers could miss this.
- Safe modification: Ensure `activate()` is always called before `check()`. Consider making `check()` return a deny result rather than throwing, for defensive behavior.
- Test coverage: `test/unit/hardening/hardening.test.ts` covers the activated case; the unactivated throw is covered implicitly.

**`applyProposal` modifies CANS.md in-place with no backup:**
- Files: `src/refinement/refinement-engine.ts:183-214`
- Why fragile: The function reads CANS.md, modifies it, validates the modified form, then writes it back. If the write succeeds but the subsequent `updateKnownGoodHash()` fails (e.g., disk full), the CANS.md is updated but the integrity store is stale. On next activation, the integrity check will fail and clinical mode will be inactive.
- Safe modification: Write to a `.tmp` file and rename atomically (as done in `src/onboarding/workspace-writer.ts`), updating the integrity hash before finalizing the rename.
- Test coverage: The happy path and scope-field safety check are tested; the partial-write failure scenario is not.

**ProposalQueue loads from disk only at construction, not before each read:**
- Files: `src/refinement/proposal-queue.ts:27`, `src/refinement/proposal-queue.ts:33-39`
- Why fragile: If two `RefinementEngine` instances are created for the same workspace (e.g., during testing or if the plugin is somehow re-registered), each maintains its own in-memory copy of `proposals.json`. A write from one instance will not be visible to the other without reconstruction. This is also the mechanism used in the security test at `test/integration/security-review.test.ts:449-451`.
- Safe modification: Call `load()` before `getPending()` and `getById()` to ensure freshness, or document that only one engine instance should exist per workspace lifetime.
- Test coverage: The stale-read scenario is only exercised intentionally in the security test; it is not guarded against in normal usage.

**`setNestedValue` in refinement engine does not validate path segments:**
- Files: `src/refinement/refinement-engine.ts:156-169`
- Why fragile: The function converts a `field_path` string (e.g., `"voice.chart"`) to a dot-split path and navigates/creates intermediate objects. Maliciously crafted field paths like `"__proto__"` or `"constructor"` could lead to prototype pollution.
- Safe modification: Validate that no path segment is a JavaScript prototype property (`__proto__`, `constructor`, `prototype`) before navigation. The upstream scope-field check only blocks `scope.*` paths, not prototype-polluting paths.
- Test coverage: No test covers prototype-polluting field paths.

---

## Scaling Limits

**AUDIT.log chain verification:**
- Current capacity: Works correctly for hundreds to low thousands of entries (typical single-session use).
- Limit: At tens of thousands of entries, the full file read in `verifyChain()` (called every 60 seconds) will cause measurable I/O overhead and memory allocation on each cycle.
- Scaling path: Implement incremental verification with a persisted cursor position.

**Observation store query performance:**
- Current capacity: Functional for the default divergence threshold of 5 observations per field per session.
- Limit: After months of continuous use in a high-frequency charting environment (hundreds of observations per session), the `query()` full scan will become slow.
- Scaling path: Implement a sliding window retention policy and/or on-disk indexing.

---

## Dependencies at Risk

**OpenClaw platform (`openclaw >= 2026.1.0`) — unverified API contract:**
- Risk: The OpenClaw adapter (`src/adapters/openclaw/index.ts`) probes the API object at runtime with multiple fallback paths for `workspaceDir` (e.g., `api.workspaceDir`, `api.config.workspaceDir`, `api.context.workspaceDir`). This suggests OpenClaw's API is not stable or was explored without a concrete API spec.
- Impact: If OpenClaw changes its API shape, the adapter will fall through to `process.cwd()` silently, which may point to the wrong workspace directory.
- Migration plan: Obtain an OpenClaw TypeScript type package or API specification document. Pin to a specific OpenClaw version range once the API stabilizes.

**`yaml` package (vendored via tsdown bundle):**
- Risk: `yaml` is listed as a devDependency because tsdown inlines it into the dist bundle. The `src/vendor/yaml/index.ts` comment notes that importing source directly will fail if `yaml` is not installed. This creates a hidden runtime dependency for consumers using path aliases.
- Impact: Any monorepo or development setup that imports `src/vendor/yaml/index.ts` directly (without bundling) will throw a module-not-found error unless `yaml` is installed as a regular dependency.
- Migration plan: Either move `yaml` to `dependencies`, or add a clear setup guard that validates the bundle exists before any source import of the vendor shim.

---

## Missing Critical Features

**Neuron network client and cross-installation protocol not implemented:**
- Problem: `src/neuron/client.ts` and `src/protocol/server.ts` are stubs that throw `'not yet implemented'` on every call. The CANS schema includes `neuron_endpoint` and `cross_installation` fields, but no code activates or connects to them.
- Blocks: Cross-installation patient-to-provider agent communication. The `cross_installation` consent flags in CANS.md have no runtime effect. Providers who set `neuron_endpoint` in their organizations will see no Neuron connection established.

**No log-level configuration for audit or adapter logging:**
- Problem: All adapter logging uses `'info'`, `'warn'`, or `'error'` levels hardcoded at each call site. There is no way to suppress verbose adapter registration messages (e.g., `"Workspace resolved from api.workspaceDir: ..."`) in production use.
- Blocks: Clean production deployment. Every plugin activation emits multiple info-level logs to the OpenClaw log stream.

**No docs/ directory or GitHub workflow files:**
- Problem: Phase 6 (documentation and release) has a context document but no implementation. There is no `docs/` directory, no `.github/` directory, no `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, and no GitHub issue or PR templates.
- Blocks: Open-source community contributions and self-service installation by clinical IT teams.

---

## Test Coverage Gaps

**`skill_usage` observation category end-to-end flow:**
- What's not tested: No test records an observation with `category: 'skill_usage'` and verifies that proposals are or are not generated from it. The empty `CATEGORY_FIELDS.skill_usage` array means the category silently drops observations.
- Files: `src/refinement/types.ts:58-60`, `test/unit/refinement/pattern-matcher.test.ts`
- Risk: Regression if `skill_usage` is implemented — existing behavior (no proposals) will change without a test asserting the new behavior.
- Priority: Medium

**`applyProposal` partial-write failure scenario:**
- What's not tested: No test simulates a disk write failure during CANS.md update or integrity hash update in `applyProposal`. The integrity store could become stale if the hash write fails after CANS.md is written.
- Files: `src/refinement/refinement-engine.ts:183-214`
- Risk: A provider accepts a proposal, the CANS.md update succeeds, but the next plugin activation fails integrity check and enters inactive mode with no clear recovery path.
- Priority: High

**Exec allowlist shell metacharacter bypass:**
- What's not tested: No test covers commands like `cat $(rm -rf /)`, `ls; rm -rf /`, or `echo | bash`. The allowlist checks only the first token.
- Files: `src/hardening/layers/exec-allowlist.ts`, `test/unit/hardening/layers/exec-allowlist.test.ts`
- Risk: A permitted exec tool call containing shell metacharacters could invoke arbitrary commands on the agent's host.
- Priority: High

**`setNestedValue` prototype pollution paths:**
- What's not tested: No test covers `field_path` values of `"__proto__"`, `"constructor"`, or `"prototype"`.
- Files: `src/refinement/refinement-engine.ts:156-169`, `test/unit/refinement/refinement-engine.test.ts`
- Risk: A crafted observation or tampered proposal could pollute the JavaScript object prototype.
- Priority: Medium

**Audit log deletion (empty file treated as valid):**
- What's not tested: No test verifies behavior when AUDIT.log is deleted between sessions. The current behavior (returns `{ valid: true, entries: 0 }`) is silent.
- Files: `src/audit/writer.ts:49-51`, `test/unit/audit/writer.test.ts`
- Risk: Malicious log deletion goes undetected by chain verification.
- Priority: Medium

---

*Concerns audit: 2026-02-21*
