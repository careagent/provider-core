# Domain Pitfalls

**Domain:** Clinical AI Plugin (OpenClaw Healthcare Activation Layer)
**Project:** CareAgent (@careagent/provider-core)
**Researched:** 2026-02-17

---

## Critical Pitfalls

Mistakes that cause rewrites, liability events, or project failure.

---

### Pitfall 1: Prompt Injection Bypasses Clinical Scope Boundaries

**What goes wrong:** An LLM prompt injection attack causes CareAgent to generate clinical output outside the provider's credentialed scope -- for example, producing a surgical recommendation from a provider credentialed only in internal medicine, or recommending a contraindicated medication. In a JAMA Network Open study (Dec 2025), prompt injection attacks succeeded in 94.4% of trials across commercial LLMs, including 91.7% of extremely high-harm scenarios involving FDA Category X pregnancy drugs like thalidomide.

**Why it happens:** Scope enforcement implemented purely at the prompt/system-message level is fragile. LLMs do not have a reliable mechanism to refuse instructions embedded in context -- universal bypass techniques (policy puppetry, zero-width character injection, homoglyph attacks) defeat classifier-based guardrails with up to 100% success rates across all major models. If CareAgent's six-layer hardening relies on the LLM "understanding" its scope constraints, a sufficiently crafted injection will bypass them.

**Consequences:** Provider generates documentation or recommendations outside their scope. This is not a bug -- it is a liability event. The provider's malpractice exposure increases, and the audit trail records an action the provider's credentials do not support.

**Prevention:**
- **Never trust the LLM as a security boundary.** Scope enforcement must be structural, not conversational. The LLM can be part of a defense layer, but it cannot be the only layer.
- **Tool-level enforcement:** The `before_tool_call` hook (now wired via PR #6570) should validate that the requested action falls within credentialed scope BEFORE the LLM can execute it. If the hook is unavailable, the tool wrapper itself must enforce scope.
- **Output validation:** A secondary check (regex, structured schema validation, or a dedicated small model) must verify that generated clinical documentation does not reference procedures, medications, or diagnoses outside the provider's declared scope in CANS.md.
- **Input sanitization:** Strip or normalize Unicode zero-width characters, homoglyphs, and known injection patterns from all user input before it reaches the LLM context.
- **Template-constrained output:** For chart-skill, use structured templates that restrict what CAN be generated, rather than trying to filter what should NOT be generated.
- **Red-team continuously:** Build a prompt injection test suite specific to clinical scenarios. Run it on every release.

**Detection (warning signs):**
- Audit log entries referencing procedures or medications not in the provider's CANS.md scope
- Output that contains sections or terminology unrelated to the provider's specialty
- Test failures in adversarial prompt injection suite

**Phase relevance:** Must be addressed in the hardening layer phase (Phase 3 or wherever runtime hardening is built). The template-constrained approach should be baked into chart-skill from its first implementation. Prompt injection testing should be continuous from day one.

**Confidence:** HIGH -- the JAMA study and multiple 2025 security research papers provide strong evidence that LLM-only guardrails are insufficient.

---

### Pitfall 2: False Sense of HIPAA Compliance

**What goes wrong:** CareAgent's architecture looks HIPAA-ready (audit logs, scope enforcement, credential management) but creates a false impression of compliance. A provider, seeing these features, begins using real patient data before actual HIPAA hardening is complete. Alternatively, documentation or marketing language implies compliance that does not exist, creating legal exposure.

**Why it happens:** The project explicitly states "HIPAA architecture without HIPAA implementation." This is the correct design intent -- but the gap between "architected for" and "compliant" is enormous and easy to accidentally close in perception while leaving it wide open in reality. HIPAA compliance software does not guarantee compliance; it is the responsibility of users to ensure compliant use. The 2026 HIPAA Security Rule updates mandate MFA, encryption standards for ePHI, faster breach reporting, and AI-specific controls around training data provenance and output monitoring.

**Consequences:** If a provider uses CareAgent with real PHI before proper hardening: OCR violations, breach notification requirements, fines up to $2.07M per violation category per year, and personal liability for the provider. If CareAgent's documentation implies compliance it does not have: product liability for the project.

**Prevention:**
- **Explicit "NOT HIPAA COMPLIANT" warnings** at every layer: in the README, in the onboarding flow, in CANS.md, in CLI output, in audit log headers. Make it impossible to miss.
- **Synthetic data enforcement:** Build a guard that detects and refuses to process data patterns resembling real PHI (SSN patterns, MRN formats, real date-of-birth patterns). This is not foolproof, but it creates friction against accidental PHI use.
- **No PHI storage paths:** In the dev platform phase, ensure no data path could accidentally persist real patient data. Audit log entries should contain action metadata, not clinical content.
- **Compliance checklist document:** Maintain a clear, version-controlled document listing every HIPAA requirement, its status (not started / architected / implemented / validated), and what is needed to close the gap.
- **Legal review before any "compliance" language:** No documentation, README, or marketing material should use words like "HIPAA-compliant," "HIPAA-ready," or "secure for patient data" without legal review.

**Detection (warning signs):**
- Any documentation using the word "compliant" without explicit qualification
- Audit logs containing what looks like real patient data rather than synthetic data
- Users asking "can I use this with real patients?" -- if they are asking, the warning is not prominent enough

**Phase relevance:** Warnings must be built into Phase 1 (plugin scaffold). PHI detection guards should be in Phase 2 (audit logging). The compliance gap document should be maintained from project inception.

**Confidence:** HIGH -- HIPAA enforcement is well-documented, and the false compliance trap is the single most common mistake in healthcare software development.

---

### Pitfall 3: OpenClaw Upstream Breaking Changes Destroy Plugin Functionality

**What goes wrong:** OpenClaw releases daily (confirmed: v2026.2.13 through v2026.2.15 shipped on consecutive days). A release changes plugin hook behavior, renames API methods, restructures the extension loading mechanism, or modifies the workspace file format. CareAgent breaks silently -- hooks stop firing, skills fail to load, or the audit trail stops recording.

**Why it happens:** OpenClaw has no formal plugin API stability guarantee. The Plugin SDK is exported via `dist/plugin-sdk/` but no breaking-change policy is documented. Recent examples of breaking changes include:
- Bundled hooks broken by tsdown migration (v2026.2.2)
- POST /hooks/agent rejecting sessionKey overrides by default (v2026.2.12)
- Full rebrand from Clawdbot/Moltbot to OpenClaw, renaming npm package and moving extensions to @openclaw/* scope
- Removal of gateway auth mode "none" (v2026.1.29)

**Consequences:** CareAgent's hardening layer silently degrades. A hook that was enforcing scope suddenly stops being called. The audit log misses actions because an event format changed. The provider continues using CareAgent unaware that safety features are inactive.

**Prevention:**
- **Adapter layer pattern:** Never call OpenClaw APIs directly from CareAgent's core logic. Build a thin adapter layer (`src/adapters/openclaw/`) that translates between CareAgent's internal interfaces and OpenClaw's current API. When OpenClaw changes, only the adapter changes.
- **Pin OpenClaw version as peer dependency:** Specify exact or narrow semver ranges. Do not use `^` or `*` ranges.
- **API surface tracking document:** Maintain a file listing every OpenClaw API CareAgent depends on: hooks used, CLI registration methods, workspace files read, config paths accessed. When evaluating an OpenClaw update, check each surface.
- **Smoke test suite against OpenClaw:** A CI job that installs CareAgent into a fresh OpenClaw instance and verifies: plugin loads, hooks fire, skills register, audit entries are written, CLI commands work. Run this against both the pinned version AND the latest OpenClaw release (the latter as an informational, non-blocking check).
- **Graceful degradation with loud alerts:** If a hook fails to register or a capability is unavailable, CareAgent must not silently continue. It must log a prominent warning and, for safety-critical hooks (scope enforcement, audit logging), refuse to operate in clinical mode.
- **Subscribe to OpenClaw releases:** Monitor the GitHub releases feed and CHANGELOG.md. Evaluate every release for plugin API impact.

**Detection (warning signs):**
- Smoke tests fail against latest OpenClaw release
- Hook registration returns without error but handlers never execute
- New OpenClaw release notes mention "plugin," "hook," "extension," "SDK," or "breaking"
- CareAgent's adapter layer has not been updated in more than 2 weeks

**Phase relevance:** The adapter layer must be established in Phase 1 (plugin scaffold). The smoke test suite must be built alongside the first integration test. API surface tracking is a living document from day one.

**Confidence:** HIGH -- daily releases with documented breaking changes to plugin infrastructure are confirmed.

---

### Pitfall 4: Audit Log Integrity Failure Under Real-World Conditions

**What goes wrong:** The append-only audit log is not actually tamper-evident. Entries can be modified, deleted, or reordered without detection. Or the log has gaps -- actions that should have been logged were not, because the logging hook was bypassed, the write failed silently, or a race condition caused entries to be lost.

**Why it happens:** Append-only is a policy, not a mechanism. Writing to a file with `fs.appendFile()` and calling it "append-only" provides no protection against a process (or the provider themselves) editing the file. Hash chaining (where each entry includes the hash of the previous entry) is planned for "future" but not implemented in the dev platform phase. Without it, the log is just a text file with an honor system.

**Consequences:** If CareAgent is ever used in a legal proceeding (malpractice case, scope dispute, credentialing review), the audit log must be trustworthy. A log that can be trivially modified is not evidence -- it is a liability. The defense will argue the log was altered, and they would be right to do so.

**Prevention:**
- **Hash chaining from day one, even in dev:** Each audit entry should include the SHA-256 hash of the previous entry. This is cheap to implement and transforms the log from "text file" to "tamper-evident chain." You do not need full cryptographic signing (PKI, digital signatures) in the dev platform, but hash chaining costs almost nothing and provides enormous value.
- **Write-ahead verification:** After writing an entry, immediately read it back and verify it matches. This catches silent write failures.
- **Atomic writes:** Use write-rename patterns (write to temp file, fsync, rename) rather than append-in-place. This prevents partial writes from corrupting the chain.
- **Log completeness testing:** Build a test that performs a known sequence of actions and verifies every action appears in the audit log in the correct order. This catches "gap" bugs where hooks fail to fire.
- **File permissions:** Set the audit log file to append-only at the OS level (chattr +a on Linux). This is not cryptographic protection, but it prevents casual modification.
- **Separate the logging path from the action path:** The audit write should not be in a try/catch that swallows errors. If the audit log cannot be written, the action should fail. Audit logging is not optional instrumentation -- it is a safety mechanism.

**Detection (warning signs):**
- Audit log entries without hash chain references
- Gaps in sequential entry IDs
- Log file modification timestamps that do not match the last entry timestamp
- Tests that perform actions but find fewer audit entries than expected

**Phase relevance:** Hash chaining must be implemented when the audit log is first built (Phase 2). Do not defer this to "future hardening" -- the cost is minimal and the risk of building habits around a non-tamper-evident log is high.

**Confidence:** HIGH -- tamper-evident audit logging patterns are well-established; the pitfall is deferring them.

---

### Pitfall 5: `before_tool_call` Hook Dependency Creates a Silent Safety Gap

**What goes wrong:** CareAgent's scope enforcement design depends on intercepting tool calls before they execute. The `before_tool_call` hook existed in OpenClaw's type system but was not wired in the execution flow (issue #6535). PR #6570 reportedly wired it, but the hook's behavior may change, it may not fire for all tool types, or future OpenClaw updates may break the integration. CareAgent designs its entire hardening strategy around this hook, and when it fails, scope enforcement disappears.

**Why it happens:** Building safety-critical functionality on a single integration point in a rapidly-evolving upstream project. The hook was literally unimplemented for an extended period, demonstrating that OpenClaw's priorities do not necessarily align with CareAgent's safety requirements. Additionally, the `after_tool_call` hook was wired as "fire-and-forget telemetry" (PR #6264), suggesting OpenClaw views these hooks as observability features, not enforcement points.

**Consequences:** The provider executes clinical actions that should have been blocked by scope enforcement. The audit log may record the action (if that path works), but the damage is done -- an out-of-scope action was performed.

**Prevention:**
- **Defense in depth -- never rely on a single hook:** Implement scope enforcement at multiple layers:
  1. **System prompt layer:** Include scope constraints in the LLM's system prompt (weakest, but additive)
  2. **Tool registration layer:** Only register tools that are within the provider's scope. If a neurosurgeon should not have access to obstetric tools, do not register them.
  3. **before_tool_call hook:** Validate the specific invocation parameters against scope (primary enforcement if available)
  4. **Tool wrapper layer:** Each clinical tool's own implementation checks scope before executing (fallback enforcement)
  5. **Output validation layer:** Verify the tool's output is within scope before returning to the LLM
- **Graceful degradation with mode switching:** If `before_tool_call` is unavailable or fails to fire, CareAgent should detect this (canary test at startup) and switch to "restricted mode" where tool-wrapper enforcement is primary. Log a warning, do not silently continue.
- **Canary test:** At plugin initialization, register a test tool and a `before_tool_call` handler. Programmatically invoke the test tool. If the handler does not fire, the hook is broken. This must run at every startup.
- **Version-gate the hook dependency:** Track which OpenClaw versions have a working `before_tool_call`. If the detected OpenClaw version is below that threshold, skip the hook and rely on other layers.

**Detection (warning signs):**
- Canary test fails at startup
- Audit log shows tool executions with no corresponding `before_tool_call` log entries
- OpenClaw release notes mention changes to hook execution flow
- Hook handler registration succeeds but handler function is never invoked

**Phase relevance:** The canary test and tool-wrapper fallback must be built in Phase 1 (plugin scaffold) alongside the first hook registration. The multi-layer enforcement architecture should be the design principle from Phase 1, not bolted on later.

**Confidence:** HIGH -- the hook was confirmed unimplemented for an extended period, and OpenClaw's hook infrastructure has already broken once during the tsdown migration.

---

## Moderate Pitfalls

---

### Pitfall 6: Clinical Skill Integrity Verification That Does Not Actually Verify

**What goes wrong:** Clinical skills are checksummed at install time and verified at load time, but the verification is trivially bypassable or does not cover the full attack surface. For example: checksums are stored alongside the skill files (attacker modifies both), checksums use a weak algorithm, or the verification does not cover dynamically-loaded dependencies of the skill.

**Why it happens:** Integrity verification is conceptually simple but easy to implement incompletely. The npm ecosystem itself has been subject to supply chain attacks -- in 2025, widespread npm supply chain attacks put billions of weekly downloads at risk. Lifecycle scripts (preinstall, postinstall) are the primary malware execution vector. A clinical skill is essentially an npm package with clinical implications.

**Prevention:**
- **Store checksums out-of-band:** Checksums must not be stored in the same directory or file tree as the skill they protect. Store them in CANS.md or a separate integrity manifest that the provider controls.
- **Hash the entire skill directory tree:** Not just the main file, but every file in the skill directory (SKILL.md, handler.ts, any dependencies). Use SHA-256. Produce a Merkle root.
- **Disable npm lifecycle scripts for clinical skills:** Use `--ignore-scripts` when installing clinical skill dependencies. Audit any scripts that are present.
- **Version-pin with lockfile integrity:** Clinical skills must have their own lockfile with integrity hashes. Use `npm ci` (never `npm install`) for reproducible installations.
- **Provider approval workflow:** No clinical skill update should auto-apply. The provider must see the diff and approve it. This is already in the requirements but must be enforced technically, not just by convention.

**Detection (warning signs):**
- Checksum verification passes for a skill that was manually modified (test this)
- Clinical skill loads without any integrity check log entry
- Skill directory contains files not covered by the checksum manifest

**Phase relevance:** Integrity verification design in Phase 2 (clinical skill framework). Must be tested with tampered skills.

**Confidence:** MEDIUM -- the approach is sound, but implementation details determine whether it actually provides security.

---

### Pitfall 7: Onboarding Interview That Produces Unusable CANS.md

**What goes wrong:** The onboarding interview is the entry point for the entire CareAgent experience. If it produces a CANS.md that is too generic (does not capture the provider's actual clinical nuance), too rigid (forces the provider into uncomfortable constraints), or incorrect (miscategorizes their scope), the provider either abandons CareAgent or operates with incorrect scope boundaries.

**Why it happens:** Clinical practice is enormously heterogeneous. A neurosurgeon's scope varies by institution, by fellowship training, by personal preference. The interview must capture this nuance through a conversational LLM interaction, but LLMs are prone to: over-generalizing from specialty name alone, missing the distinction between "trained to do" and "credentialed to do," and failing to capture institutional-specific scope limitations. Additionally, research shows clinician trust is built through transparency, customization, and control -- an onboarding that feels like a checkbox exercise rather than a clinical conversation will undermine adoption.

**Prevention:**
- **Iterative refinement, not one-shot generation:** The onboarding should produce a draft CANS.md, present it to the provider for review, and iterate based on feedback. The provider must explicitly approve the final version.
- **Structured + freeform hybrid:** Use structured questions for unambiguous data (license type, DEA number, board certifications, institutional privileges) and freeform conversation for nuanced data (clinical philosophy, documentation voice, autonomy preferences).
- **Validation against known ontologies:** Cross-reference specialty and scope claims against standard medical specialty taxonomies (ABMS board certifications, CMS specialty codes). Flag inconsistencies for the provider to resolve.
- **CANS.md as living document:** The "CANS continuous improvement" requirement is critical. The onboarding is the first draft, not the final word. Build the editing/approval workflow from the start.
- **Test with multiple specialties:** Do not test onboarding only with neurosurgery. Test with primary care, emergency medicine, psychiatry, and at least one surgical and one non-surgical specialty to ensure the framework generalizes.

**Detection (warning signs):**
- Provider immediately edits CANS.md extensively after onboarding (the interview missed the mark)
- Scope enforcement blocks actions the provider considers within their scope (too restrictive)
- Scope enforcement allows actions the provider considers outside their scope (too permissive)
- Provider abandons CareAgent within the first week (onboarding failed to create value)

**Phase relevance:** Onboarding is its own phase. The iterative refinement and provider approval workflow must be built into the first version, not added later.

**Confidence:** MEDIUM -- clinical workflow integration research strongly supports the iterative, transparent approach, but the specific CANS.md format is novel and untested.

---

### Pitfall 8: Audit Log Becomes a Performance Bottleneck

**What goes wrong:** Every action, tool invocation, and blocked action writes to the audit log. With hash chaining, each write depends on the previous entry's hash. Under load (multiple rapid tool calls, long clinical sessions), the synchronous audit write path becomes the bottleneck. Developers are tempted to make logging async and fire-and-forget, which reintroduces the completeness problem from Pitfall 4.

**Why it happens:** Hash chaining is inherently sequential -- entry N requires the hash of entry N-1. If CareAgent processes multiple tool calls concurrently, the audit log must serialize them. The temptation is to buffer and batch, but buffering means entries could be lost on crash.

**Prevention:**
- **Design for the write volume from the start:** Estimate the maximum entries per clinical session. A typical clinical encounter involves 10-50 tool calls. At 1ms per hash + write, this is 10-50ms total -- not a bottleneck. Do not over-optimize prematurely.
- **Write-ahead log pattern:** Write the entry to a WAL first (fast append), then process the hash chain asynchronously but before the next action proceeds. This provides durability without blocking the main flow excessively.
- **Session-scoped chains:** Each clinical session gets its own hash chain. This allows concurrent sessions to write independently while maintaining intra-session ordering. Cross-session integrity can be established by periodic anchor entries.
- **Never make audit writes fire-and-forget:** If the audit write fails, the action must fail. This is non-negotiable for clinical use. Build the performance architecture around this constraint, not around relaxing it.

**Detection (warning signs):**
- Audit writes taking more than 10ms per entry
- Developer discussions about making logging "async" or "best-effort"
- Missing audit entries for actions that clearly executed (the completeness test from Pitfall 4 catches this)

**Phase relevance:** Design the write architecture correctly in Phase 2 (audit logging). Performance testing should happen before adding hash chaining, so you have a baseline.

**Confidence:** MEDIUM -- the theoretical bottleneck exists, but the actual write volume for clinical use is likely manageable with straightforward design.

---

### Pitfall 9: CANS.md as Single Point of Activation Creates a Brittleness Problem

**What goes wrong:** CANS.md is the single file that gates clinical mode activation. If it is accidentally deleted, corrupted, has a syntax error, or is modified by an upstream OpenClaw process (workspace sync, skill installation, compaction), CareAgent either fails to activate (provider loses clinical functionality) or activates with incorrect configuration (scope enforcement is wrong).

**Why it happens:** Using a single workspace file as the activation gate is elegant and aligns with OpenClaw's workspace architecture. But OpenClaw's workspace is a shared space -- other skills and plugins may read or even modify workspace files. OpenClaw's compaction feature may restructure workspace content. The provider may accidentally edit the file while working with other OpenClaw workspace files (SOUL.md, AGENTS.md).

**Prevention:**
- **CANS.md integrity check at every load:** Hash the file and compare to the last known-good hash. If it has changed, alert the provider and ask for confirmation before activating with the new content.
- **CANS.md backup:** Maintain a versioned backup in a CareAgent-controlled directory (e.g., `~/.careagent/cans-backups/`). Auto-restore if the workspace copy is corrupted.
- **Schema validation:** CANS.md should have a well-defined schema. Parse and validate it at load time. Reject malformed files with a clear error message rather than partially loading.
- **Separation of concerns:** CANS.md should contain clinical configuration only. Do not use it as a general-purpose state file. Keep mutable state (session data, learning data) in separate files.
- **File watcher:** Monitor CANS.md for changes during a session. If it changes mid-session, alert the provider rather than silently reloading.

**Detection (warning signs):**
- CareAgent fails to activate and the error message does not clearly indicate why
- CANS.md content changes without provider action
- Schema validation catches errors that would have caused silent misconfiguration

**Phase relevance:** Schema validation and integrity checking must be part of the CANS.md parser built in Phase 1. The backup mechanism should be added in Phase 2.

**Confidence:** MEDIUM -- the risk is architectural; the specific failure modes depend on how OpenClaw's workspace management evolves.

---

### Pitfall 10: Building Provider Voice Customization That Generates Hallucinated Clinical Content

**What goes wrong:** The chart-skill generates clinical documentation "in the provider's voice" and style. The LLM, given a documentation style template and encounter context, fabricates clinical findings, examination results, or assessments that sound like the provider but describe events that did not occur. The generated note is authoritative-sounding and in the correct format, making hallucinations harder to detect.

**Why it happens:** Research confirms that AI clinical documentation tools generate "entirely fictitious content, such as documenting examinations that never occurred or creating nonexistent diagnoses" (PMC, 2025). The more personalized and fluent the output, the harder it is to spot hallucinations, because it sounds exactly like something the provider would write. The provider, trusting the familiar voice, reviews less carefully -- contributing to the "deskilling" risk documented in clinical AI literature.

**Consequences:** A clinical note enters the medical record containing fabricated findings. This is medical fraud if undetected, and a malpractice risk regardless. The audit trail faithfully records that the note was generated, but does not record that its contents are false.

**Prevention:**
- **Template-constrained generation, not freeform:** Chart-skill should use structured templates with explicit sections. The LLM fills in sections based on provided data, not from its own inference. Empty sections remain empty rather than being filled with plausible-sounding fabrications.
- **Source attribution in generated notes:** Every clinical assertion in the generated note should trace back to a specific input (encounter context, provider dictation, structured data). If no source exists for an assertion, it should not be generated.
- **Mandatory provider review with diff-highlighting:** Present generated notes with clear indication of what was AI-generated vs. what came from provider input. Use visual differentiation (color, markers) to make AI-generated content obvious.
- **Explicit "unknown/not assessed" defaults:** If the encounter context does not include a physical exam finding, the template should say "Not assessed" rather than leaving a gap the LLM might fill.
- **Hallucination detection testing:** Build a test suite that provides partial encounter data and verifies the generated note does not contain information beyond what was provided.

**Detection (warning signs):**
- Generated notes that are longer or more detailed than the input data justifies
- Clinical findings in the note that do not appear in any input source
- Provider accepting generated notes without edits (may indicate over-trust or may indicate quality -- investigate)

**Phase relevance:** Template-constrained design must be the foundation of chart-skill from its first implementation. Do not build freeform generation first and add constraints later.

**Confidence:** HIGH -- clinical documentation hallucination is well-documented in peer-reviewed literature.

---

## Minor Pitfalls

---

### Pitfall 11: VPS-Only Development Creates Environment Drift

**What goes wrong:** CareAgent is developed on a VPS because a previous attempt broke a local OpenClaw installation. Over time, the VPS environment accumulates state (installed packages, config changes, orphaned processes) that makes it non-representative of a fresh installation. Tests pass on the VPS but fail on a clean install.

**Prevention:**
- **Disposable environments:** Use Docker or a VM snapshot to create a fresh OpenClaw + CareAgent environment for each test run. The VPS is for development, not for validation.
- **"Clean install" CI job:** A CI pipeline that starts from a bare environment, installs OpenClaw, installs CareAgent, runs the full test suite. This is the source of truth, not the dev VPS.
- **Document the VPS state:** Maintain a setup script that can reproduce the VPS environment from scratch.

**Phase relevance:** Phase 1 -- establish the CI pipeline early.

---

### Pitfall 12: Matching OpenClaw's Tooling Locks Into Premature Decisions

**What goes wrong:** The constraint to "match OpenClaw's tooling exactly" means CareAgent adopts whatever build system, test framework, and TypeScript configuration OpenClaw uses. If OpenClaw changes its tooling (it already migrated to tsdown, which broke bundled hooks), CareAgent must follow or diverge.

**Prevention:**
- **Match the interface, not the internals:** Use the same TypeScript target and module format as OpenClaw (necessary for compatibility). But for internal build tooling, testing framework, and linting, choose stable tools and do not change them just because OpenClaw does.
- **Isolate build artifacts:** CareAgent's build output should be a standard npm package. How it gets built internally does not need to match OpenClaw's build system.

**Phase relevance:** Phase 1 -- tooling decisions at project scaffold time.

---

### Pitfall 13: Credential Management Scope Creep

**What goes wrong:** CANS.md stores provider credentials (license type, DEA number, board certifications, institutional privileges). Over time, there is pressure to store more sensitive data: login credentials for EHR systems, API keys for clinical databases, authentication tokens. The file that was designed for scope configuration becomes a secrets store.

**Prevention:**
- **Hard boundary in the schema:** CANS.md schema explicitly defines what fields are allowed. Credential fields are enumerated and typed. There is no "extra" or "custom" field that could be used to store secrets.
- **No secrets in workspace files:** API keys, passwords, and tokens must never appear in CANS.md or any workspace file. Use environment variables or a proper secrets manager. Document this boundary clearly.
- **Automated secret detection:** Run a pre-commit check that scans CANS.md for patterns that look like secrets (API keys, passwords, tokens). Reject commits that match.

**Phase relevance:** Schema design in Phase 1. Secret detection in Phase 2.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| Plugin Scaffold (Phase 1) | Tight coupling to OpenClaw internals | Build adapter layer from day one; never import OpenClaw internal modules | Critical |
| Plugin Scaffold (Phase 1) | Hook dependency on unimplemented features | Canary test at startup; multi-layer fallback enforcement | Critical |
| Audit Logging (Phase 2) | Append-only without tamper evidence | Implement hash chaining immediately, not "later" | Critical |
| Audit Logging (Phase 2) | Silent write failures create gaps | Fail the action if audit write fails; completeness testing | Critical |
| Runtime Hardening (Phase 3) | Prompt injection bypasses scope | Structural enforcement at tool level, not just LLM prompt level | Critical |
| Runtime Hardening (Phase 3) | False HIPAA compliance perception | Explicit warnings at every layer; synthetic data enforcement | Critical |
| CANS.md / Onboarding (Phase 4) | Onboarding produces unusable configuration | Iterative refinement with provider approval; multi-specialty testing | Moderate |
| CANS.md / Onboarding (Phase 4) | CANS.md corruption or accidental modification | Integrity checking, backup, schema validation | Moderate |
| Clinical Skills (Phase 5) | Chart-skill hallucination | Template-constrained generation; source attribution | Critical |
| Clinical Skills (Phase 5) | Skill integrity verification that does not verify | Out-of-band checksum storage; full directory tree hashing | Moderate |
| All Phases | Upstream OpenClaw breaking change | Adapter layer, version pinning, smoke tests against latest | Critical |
| All Phases | Environment drift on dev VPS | Disposable CI environments; clean install validation | Minor |

---

## Sources

### Peer-Reviewed Research
- [Vulnerability of LLMs to Prompt Injection When Providing Medical Advice (JAMA Network Open, Dec 2025)](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2842987) -- 94.4% injection success rate in clinical LLMs
- [Beyond Human Ears: Risks of AI Scribes in Clinical Practice (npj Digital Medicine, 2025)](https://www.nature.com/articles/s41746-025-01895-6) -- AI documentation hallucination and deskilling risks
- [Trust in AI-Based Clinical Decision Support Systems (JMIR, 2025)](https://www.jmir.org/2025/1/e69678) -- Clinician trust barriers and enablers
- [Bypassing LLM Guardrails: Empirical Analysis (ACL, 2025)](https://aclanthology.org/2025.llmsec-1.8/) -- Up to 100% guardrail evasion rates

### OpenClaw-Specific
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin) -- Plugin API surface area and extension points
- [OpenClaw Issue #6535: Plugin hooks not wired](https://github.com/openclaw/openclaw/issues/6535) -- before_tool_call hook was unimplemented
- [OpenClaw Releases](https://github.com/openclaw/openclaw/releases) -- Daily release cadence, breaking changes documented
- [OpenClaw Extensions and Plugins (DeepWiki)](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) -- Plugin SDK exports without stability guarantees
- [BioDefense Discussion #9192](https://github.com/openclaw/openclaw/discussions/9192) -- Multi-layer defense architecture (theoretical)

### Security and Compliance
- [Universal AI Bypass: Policy Puppetry (HiddenLayer)](https://hiddenlayer.com/innovation-hub/novel-universal-bypass-for-all-major-llms) -- Universal LLM guardrail bypass techniques
- [OWASP LLM Top 10: Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) -- Canonical prompt injection risk documentation
- [2026 HIPAA Rule Updates](https://www.chesshealthsolutions.com/2025/11/06/2026-hipaa-rule-updates-what-healthcare-providers-administrators-and-compliance-officers-need-to-know/) -- Mandatory MFA, encryption, AI-specific controls
- [Tamper-Evident Audit Log Design Patterns (DesignGurus)](https://www.designgurus.io/answers/detail/how-do-you-design-tamperevident-audit-logs-merkle-trees-hashing) -- Hash chaining and Merkle tree patterns
- [npm Supply Chain Attacks 2026 (Bastion)](https://bastion.tech/blog/npm-supply-chain-attacks-2026-saas-security-guide) -- Package integrity and lifecycle script risks
- [Countermind: Multi-Layered LLM Security Architecture](https://arxiv.org/html/2510.11837v1) -- Defense-in-depth for LLM applications
- [LlamaFirewall: Open Source Guardrail System](https://arxiv.org/pdf/2505.03574) -- Layered agent security framework

### Clinical Documentation
- [Evaluating AI Impact on Clinical Documentation (PMC, 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11658896/) -- Error rates and hallucination in AI clinical docs
- [AI Adoption Challenges in Healthcare (ScienceDirect, 2025)](https://www.sciencedirect.com/science/article/pii/S092575352500253X) -- Workflow integration barriers
