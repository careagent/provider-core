# Feature Landscape

**Domain:** Clinical AI activation layer (plugin for personal AI assistant)
**Researched:** 2026-02-17
**Overall Confidence:** MEDIUM-HIGH

## Table Stakes

Features users (provider-developers, clinicians) expect. Missing any of these and the product is either unsafe, non-functional, or immediately abandoned.

### Identity and Activation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Single-file clinical activation (CANS.md)** | Providers need a clear, inspectable boundary between "personal AI" and "clinical AI." Every ambient scribe and clinical CDS system has an activation gate. Without it, there is no clinical agent -- just an AI chatbot. | Medium | CareAgent's approach is unique: a single Markdown file rather than a configuration dashboard. This is a table stakes *function* with a differentiating *form factor*. |
| **Provider identity capture** | The agent must know who it is acting for -- license type, specialty, institution, privileges. Every credentialing system (Medallion, Verifiable, Verisys) treats provider identity as the root record. Without it, clinical actions lack legal grounding. | Medium | Onboarding interview is the mechanism. Must capture: full name, NPI, license type/state, specialty, institutional affiliation, privilege set, DEA (if applicable). |
| **Credential storage and verification** | UALM Layer 1 (Identity & Persona Registry) mandates a single system of record for every agent. The agent needs to verify it has authority before acting. If credentials are stale or absent, the agent must refuse clinical actions. | Medium | Store in CANS.md as structured YAML frontmatter. Verification is local-first (presence + format check), not network-verified in dev platform. |
| **Scope-of-practice enforcement** | State law (e.g., Texas SB 1188, California AB 489) requires practitioners to act within scope. The agent must refuse actions outside the provider's credentialed scope. This is the single most legally critical feature. | High | Map provider credentials to allowed actions. A family medicine provider cannot load neurosurgery-specific operative note templates. Scope gates at skill-load time AND at action-execution time (defense in depth). |

### Audit and Accountability

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Append-only audit log (AUDIT.log)** | HIPAA requires 6-year retention of access logs. Every clinical AI governance framework (UALM Layer 5, FDA 21 CFR Part 11) requires immutable audit trails. Malpractice defense depends on being able to prove what the AI did and what the provider approved. | Medium | Append-only file in dev platform. Every action logged: timestamp, action type, inputs, outputs, approval status. No PHI in dev platform, but the schema must accommodate PHI-aware logging for production. |
| **Action-level logging granularity** | Courts hold physicians liable for AI-assisted decisions. The audit log must capture *each discrete action*, not just session summaries. "What did the AI draft? What did the provider approve? What was the final output?" | Medium | Log entries must distinguish: AI-proposed, provider-approved, provider-modified, provider-rejected, system-blocked. |
| **Blocked action recording** | When the system refuses an action (scope violation, credential gap, safety hardening trigger), the refusal itself must be logged with rationale. This proves the guardrails work. | Low | Part of audit log schema. Include: what was attempted, why it was blocked, which rule triggered. |

### Safety and Hardening

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Runtime action gating (human-in-the-loop)** | EU AI Act and FDA guidance mandate human oversight for high-risk AI. Every clinical AI system reviewed (Oracle Health, Abridge, DAX, MediMobile) requires physician review before finalization. Provider must approve all clinical outputs before they leave the system. | Medium | Leverage OpenClaw's exec approval infrastructure. Clinical actions require explicit provider confirmation. This is non-negotiable for Chart, Order, and Charge actions. |
| **Hallucination prevention for clinical content** | AI hallucinations in clinical contexts are a documented patient safety risk. LLMs fabricate symptoms, misattribute conditions, and invent medications. Clinical outputs must be template-constrained, not free-generation. | High | Template-constrained documentation is the primary defense. The AI fills structured templates, not free-writes clinical notes. Second defense: output validation against the template schema before presenting to provider. |
| **Graceful degradation** | Microservices architecture principle: if the clinical module fails, the base AI must continue working. The provider should never be locked out of their personal AI because a clinical plugin crashed. | Medium | Plugin architecture inherently supports this -- CareAgent is a peer dependency, not a fork. But crash handling, error boundaries, and fallback messaging must be explicit. |
| **Action boundary enforcement** | The agent must not be able to take actions it was not designed to take. A chart-skill cannot place orders. A documentation agent cannot prescribe. Actions are typed and bounded. | Medium | The Four Atomic Actions framework (Chart, Order, Charge, Perform) provides the ontology. Each skill declares which action types it can perform. The runtime enforces this declaration. |

### Clinical Documentation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Structured clinical note generation** | Ambient documentation is now table stakes ($600M market in 2025). Every competing product (Abridge, DAX, Freed, DeepCura, Suki) generates structured notes. SOAP, H&P, procedure notes, progress notes are baseline expectations. | High | chart-skill as first implementation. Template-constrained, specialty-specific, provider-voice-aware. Not ambient (no audio capture) -- this is a differentiation choice, not a limitation. |
| **Specialty-specific templates** | Freed supports 27,000+ medical terms across specialties. Providers expect templates that match their specialty's documentation norms. A neurosurgery operative note is structurally different from a psychiatry progress note. | Medium | Start with neurosurgery templates (developer's specialty). Template schema must be extensible to other specialties. Template = structured fields + field-level constraints + voice guidance. |
| **Provider voice/style preservation** | Clinical documentation reflects the provider's professional identity. Notes that sound generic or wrong-specialty undermine trust and adoption. Providers will reject documentation that does not sound like them. | Medium | Captured during onboarding interview (documentation voice, common phrases, preferred terminology, abbreviation preferences). Injected into template generation context. |

### Skill Framework

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Credential-gated skill loading** | OpenClaw already has skill gating via metadata requirements (bins, env, config, platform). Clinical skills must add credential gating: license type, specialty, privilege set. A skill that requires surgical privileges must not load for a non-surgical provider. | Medium | Extend OpenClaw's `metadata.openclaw.requires` pattern with clinical credential requirements in CANS.md. Gate at load time, not just at execution time. |
| **Clinical skill isolation from personal skills** | Personal AI skills (calendar, email, file management) must continue working normally. Clinical skills must not interfere with or contaminate personal skills, and vice versa. | Low | OpenClaw's skill precedence system (workspace > local > bundled) handles this. Clinical skills live in a dedicated namespace. Plugin manifest declares the skill directory. |
| **Skill integrity verification** | Clinical skills are safety-critical code. Unlike personal skills that might send a bad email, a corrupted clinical skill could generate dangerous documentation. Checksumming at install, verification at load. | Medium | SHA-256 checksums stored at install time, verified at load time. If checksum fails, skill does not load, event is logged, provider is notified. |
| **Skill version pinning** | Clinical skills must not auto-update. A silent update to a documentation template could change clinical behavior without provider awareness. Provider must explicitly approve version changes. | Low | Pin in CANS.md or plugin config. No auto-update for clinical skills, even if OpenClaw updates personal skills. Provider reviews changelog before approving. |

## Differentiators

Features that set CareAgent apart from the ambient scribe / clinical CDS landscape. Not expected, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Provider-owned agent model (Irreducible Risk Hypothesis)** | Every competing product (Abridge, DAX, Oracle Health) is a vendor-owned service. CareAgent is the only system where the agent operates under the provider's authority, credentialed through their license. This is not a feature -- it is a philosophical and legal architecture that no competitor offers. | Low (conceptual, high in implementation) | The entire CANS.md activation model embodies this. The agent IS the provider's clinical instrument, not a third-party service. This has profound implications for liability, trust, and adoption. |
| **Single-file activation (CANS.md)** | Competitors require enterprise deployment, IT integration, vendor contracts. CareAgent activates with a single file drop. Presence = clinical agent. Absence = personal AI. No configuration dashboards, no admin portals, no vendor calls. | Medium | This is radically simpler than any competitor. The tradeoff is that it limits the sophistication of configuration -- but for a provider-owned model, that simplicity IS the feature. |
| **Onboarding interview generates clinical identity** | No competitor creates a persistent clinical identity through conversational onboarding. DAX requires Epic integration. Abridge requires admin setup. CareAgent's onboarding interview discovers the provider and generates their personalized clinical agent. | High | The interview must capture: credentials, specialty, scope, documentation voice, clinical philosophy, autonomy preferences, institutional context. Output: personalized CANS.md + supplements to SOUL.md, AGENTS.md, USER.md. |
| **Four Atomic Actions ontology** | No competing system reduces clinical practice to a typed action ontology (Chart, Order, Charge, Perform). This enables stratified autonomy -- Chart has high autonomy (post-hoc review), Order has medium autonomy (pre-approval required), Perform has zero AI autonomy. | Low (conceptual) | This is an intellectual contribution, not just a feature. It provides a framework for reasoning about what the AI can and cannot do that no other system offers. The framework is the safety architecture. |
| **Stratified autonomy tiers** | Instead of binary "AI does it / AI doesn't do it," CareAgent offers graduated autonomy per action type. Chart: AI drafts, provider reviews post-hoc. Order: AI suggests, provider approves pre-execution. Charge: AI captures, provider verifies. Perform: human only, AI assists with planning. | Medium | Autonomy tiers are configured per-provider in CANS.md. A senior attending may trust higher autonomy for documentation than a new provider. This is personalized safety. |
| **Open-source transparency** | Apache 2.0 license is a structural requirement when providers bear personal liability. Every ambient scribe (Abridge, DAX, Freed) is proprietary. Providers cannot inspect the code that generates their clinical documentation. CareAgent is fully inspectable. | Low | This is a trust differentiator. When the provider is personally liable for the AI's outputs (which the law says they are), they deserve to see the code. No competitor offers this. |
| **CANS continuous improvement loop** | The agent proposes updates to its own configuration based on observed patterns ("You frequently override the HPI template -- would you like to adjust it?"). Provider approves or rejects. The agent gets better over time, but only with explicit provider consent. | High | This requires pattern detection across sessions, proposal generation, and an approval workflow. Defer to later phases but architect for it from the start. |
| **Plugin architecture (extend, don't fork)** | CareAgent is a plugin, not a platform. It rides OpenClaw's infrastructure (channels, exec approval, skill framework, workspace files). No competitor takes this approach -- all build standalone platforms. This means CareAgent inherits every OpenClaw improvement for free. | Medium | Dependency risk: OpenClaw API changes could break CareAgent. Mitigation: track plugin API surface explicitly, pin peer dependency versions, test against OpenClaw nightly. |
| **Synthetic-first development** | All development uses synthetic data. No PHI touches the dev platform. This is architecturally principled: build the safety infrastructure first, add real data later. Competitors start with real data and retrofit privacy. CareAgent starts with privacy and adds data. | Low | Synthetic patient generators, synthetic encounters, synthetic notes. The test suite validates clinical functionality without any real patient data. |

## Anti-Features

Features to explicitly NOT build. These are deliberate exclusions with clear rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Ambient audio capture / listening** | Audio capture creates massive HIPAA liability, requires BAA with audio storage providers, introduces consent complexity (two-party consent states), and puts CareAgent in direct competition with $600M funded incumbents (Abridge, DAX). The dev platform explicitly excludes PHI. | Provider types or pastes encounter information. The AI structures it using templates. This is intentionally lower-friction than ambient capture for a solo provider building their own tool. |
| **Direct EHR integration** | EHR integration (Epic, Cerner/Oracle, athenahealth) requires vendor certification, BAAs, institutional IT approval, and months of enterprise sales cycles. This is antithetical to the single-file activation model. | Generate standalone clinical documents. Provider copies output into their EHR. Future: FHIR-compatible export formats so documents are EHR-ready but not EHR-connected. |
| **Autonomous clinical decision-making** | The Irreducible Risk Hypothesis explicitly states that AI operates under provider authority. Autonomous diagnosis, autonomous treatment selection, and autonomous prescribing all violate this principle AND current law (Texas SB 1188, EU AI Act). | AI drafts, suggests, and structures. Provider reviews, approves, and takes responsibility. The agent is a clinical instrument, not a clinician. |
| **Patient-facing interactions** | Patient CareAgents are architecturally supported but explicitly out of scope. Patient-facing AI has different consent requirements, different liability models, and different regulatory frameworks (FTC Act, state consumer protection). | Build provider-facing first. Prove the model works. Patient CareAgents are a future milestone with their own research and regulatory analysis. |
| **Real-time clinical alerts / CDS** | Clinical Decision Support notifications ("drug interaction detected!") require FDA clearance as a medical device (SaMD pathway). Building CDS puts CareAgent under FDA jurisdiction. | Documentation assistance is not CDS. The agent helps structure what the provider already decided, not recommend what they should decide. This distinction is legally critical. |
| **Multi-provider / team workflows** | Multi-provider workflows require agent-to-agent protocols, shared credentialing, handoff logic, and conflict resolution (UALM Layer 2). This is the Axon platform layer, explicitly out of scope. | Single provider, single agent. The architecture supports multi-provider (CANS.md per provider), but the implementation is single-provider only. |
| **Billing optimization / upcoding assistance** | AI-assisted charge capture that optimizes billing invites False Claims Act liability. MediMobile and similar tools are under scrutiny. Even suggesting "you could bill at a higher level" is a compliance landmine. | Charge action captures what was done, not what could be billed. Documentation supports the level of service provided. No optimization, no suggestions, no maximization. |
| **Black-box AI model selection** | CareAgent must not hardcode a specific LLM provider. The provider's choice of model (Claude, GPT, Llama, local Ollama) is their decision. Hardcoding creates vendor lock-in and removes provider control. | Support whatever OpenClaw supports. The clinical layer is model-agnostic. Template constraints work regardless of which LLM fills them. |
| **Auto-updating clinical skills** | Silent updates to clinical skills could change clinical behavior without provider awareness. This is a patient safety issue. | Version pin all clinical skills. Provider must explicitly approve updates after reviewing changelog. This is slower but dramatically safer. |
| **PHI storage or processing in dev platform** | The dev platform uses synthetic data only. Introducing real PHI requires HIPAA compliance infrastructure (encryption at rest, access controls, BAAs, breach notification procedures) that is premature for the dev platform. | Architect all data schemas to be PHI-ready (field-level encryption points, access control hooks, retention policies) but do not implement PHI handling. Synthetic data exercises the same code paths. |

## Feature Dependencies

```
Provider Identity Capture
  --> Credential Storage & Verification
    --> Scope-of-Practice Enforcement
      --> Credential-Gated Skill Loading
        --> chart-skill (first clinical skill)

Single-File Activation (CANS.md)
  --> Provider Identity Capture (stored in CANS.md)
  --> Skill Gating (reads credentials from CANS.md)
  --> Autonomy Tier Configuration (stored in CANS.md)

Onboarding Interview
  --> Provider Identity Capture (interview discovers identity)
  --> CANS.md Generation (interview output)
  --> Provider Voice Capture (interview discovers voice)
  --> Workspace File Supplements (SOUL.md, AGENTS.md, USER.md)

Append-Only Audit Log
  --> Action-Level Logging (audit log schema)
  --> Blocked Action Recording (audit log entries)
  --> Skill Integrity Verification (logged events)

Runtime Action Gating
  --> OpenClaw Exec Approval Infrastructure (dependency)
  --> Autonomy Tier Configuration (determines gating level)
  --> Audit Log (records approvals/rejections)

Template-Constrained Documentation
  --> Specialty-Specific Templates (template library)
  --> Provider Voice Preservation (voice context)
  --> Hallucination Prevention (structural defense)

Skill Framework
  --> Skill Integrity Verification --> Skill Version Pinning
  --> Credential-Gated Loading --> Scope Enforcement
  --> Clinical Skill Isolation --> OpenClaw Plugin Manifest
```

## MVP Recommendation

**Phase 1 -- Foundation (must ship first):**
1. CANS.md activation file (schema + presence detection)
2. Provider identity capture and credential storage
3. Scope-of-practice enforcement at skill-load time
4. Append-only audit log with action-level granularity
5. Runtime action gating via OpenClaw exec approval
6. Six-layer runtime hardening framework

**Phase 2 -- Onboarding and Personalization:**
7. Onboarding interview (full provider discovery)
8. CANS.md generation from interview output
9. Provider voice/style capture
10. Workspace file supplements (SOUL.md, AGENTS.md, USER.md)

**Phase 3 -- First Clinical Skill:**
11. chart-skill with template-constrained documentation
12. Neurosurgery-specific templates (operative note, H&P, progress note)
13. Specialty-specific template schema (extensible to other specialties)
14. Skill integrity verification and version pinning
15. Credential-gated skill loading

**Phase 4 -- Continuous Improvement:**
16. CANS continuous improvement proposals
17. Provider approval/rejection workflow for CANS updates

**Defer:**
- Order-skill and charge-skill: Framework supports them, but Chart is the safest first action (highest autonomy tier, post-hoc review pattern). Build the skill framework right with chart-skill before adding higher-risk action types.
- Patient CareAgents: Different liability model, different consent framework, different regulatory requirements. Future milestone.
- EHR integration: Requires vendor certification and enterprise deployment. Antithetical to the single-file activation model. Future milestone, if ever.
- CANS continuous improvement: Requires multiple sessions of data to detect patterns. Build the foundation first, add learning later.

## Sources

### Clinical AI Agent Architecture
- [A foundational architecture for AI agents in healthcare (Cell Reports Medicine)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12629813/) -- HIGH confidence, peer-reviewed
- [Agentic AI Governance and Lifecycle Management in Healthcare (UALM)](https://arxiv.org/html/2601.15630v1) -- HIGH confidence, comprehensive governance framework
- [McKinsey: Healthcare AI from point solutions to modular architecture](https://www.mckinsey.com/industries/healthcare/our-insights/the-coming-evolution-of-healthcare-ai-toward-a-modular-architecture) -- MEDIUM confidence

### Clinical Documentation Landscape
- [Abridge (Best in KLAS 2025)](https://www.abridge.com/) -- HIGH confidence, market leader
- [Nuance DAX Copilot](https://www.microsoft.com/en-us/industry/blog/healthcare/2025/11/18/agentic-ai-in-action-healthcare-innovation-at-microsoft-ignite-2025/) -- HIGH confidence
- [Oracle Health Clinical AI Agent](https://www.oracle.com/health/clinical-suite/clinical-ai-agent/) -- HIGH confidence
- [Menlo Ventures: State of AI in Healthcare 2025](https://menlovc.com/perspective/2025-the-state-of-ai-in-healthcare/) -- MEDIUM confidence, $600M ambient scribe market data

### Regulatory and Liability
- [FDA Oversight of Health AI Tools (Bipartisan Policy Center)](https://bipartisanpolicy.org/issue-brief/fda-oversight-understanding-the-regulation-of-health-ai-tools/) -- HIGH confidence
- [California AB 489: AI Healthcare Licensing Terms](https://www.orrick.com/en/Insights/2025/10/California-Enacts-New-Restrictions-on-Deceptive-Use-of-Healthcare-Licensing-Terms-by-AI-Systems) -- HIGH confidence, effective Jan 2026
- [Texas SB 1188: Practitioner AI Use Requirements](https://www.fenwick.com/insights/publications/the-new-regulatory-reality-for-ai-in-healthcare-how-certain-states-are-reshaping-compliance) -- HIGH confidence
- [Physician liability for AI decisions (Medical Economics)](https://www.medicaleconomics.com/view/the-new-malpractice-frontier-who-s-liable-when-ai-gets-it-wrong-) -- MEDIUM confidence
- [Colorado AI Act (effective June 2026)](https://www.akerman.com/en/perspectives/hrx-new-year-new-ai-rules-healthcare-ai-laws-now-in-effect.html) -- HIGH confidence

### Audit and Compliance
- [HIPAA Audit Log Requirements (Pangea)](https://pangea.cloud/blog/hipaa-audit-log-requirements/) -- MEDIUM confidence
- [Immutable Audit Trails Guide (HubiFi)](https://www.hubifi.com/blog/immutable-audit-log-basics) -- MEDIUM confidence
- [AI Audit Trail Compliance (Swept AI)](https://www.swept.ai/ai-audit-trail) -- MEDIUM confidence

### Safety and Guardrails
- [UNC: AI Agents Need Guardrails (HealthSystemCIO)](https://healthsystemcio.com/2026/01/20/uncs-dorn-cautions-that-ai-agents-need-guardrails-to-manage-risk/) -- MEDIUM confidence
- [Securing Agentic AI in Healthcare 2026 (HIT Consultant)](https://hitconsultant.net/2026/01/06/securing-agentic-ai-in-the-2026-healthcare-landscape/) -- MEDIUM confidence
- [AI Hallucinations in Healthcare (Healthcare IT News)](https://www.healthcareitnews.com/news/damage-ai-hallucinations-can-do-and-how-avoid-them) -- MEDIUM confidence

### OpenClaw Platform
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills) -- HIGH confidence, official docs
- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw) -- HIGH confidence
- [OpenClaw Skills Registry (ClawHub): 5,705 skills](https://github.com/VoltAgent/awesome-openclaw-skills) -- MEDIUM confidence

### Healthcare Data Standards
- [HL7 FHIR Overview](https://www.hl7.org/fhir/overview.html) -- HIGH confidence, official standard
- [FHIR for Healthcare AI (HL7 Blog)](https://blog.hl7.org/building-the-standards-infrastructure-for-healthcare-ai-lessons-from-the-interoperability-journey) -- HIGH confidence
- [AWS HealthLake MCP Server](https://aws.amazon.com/blogs/industries/building-healthcare-ai-agents-with-open-source-aws-healthlake-mcp-server/) -- MEDIUM confidence
