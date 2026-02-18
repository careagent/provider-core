---
version: "1.0"
provider:
  name: Dr. TAMPERED Provider
  npi: "1234567890"
  license:
    type: MD
    state: TX
    number: A12345
    verified: false
  specialty: Neurosurgery
  subspecialty: Spine
  institution: University Medical Center
  privileges:
    - neurosurgical procedures
    - spine surgery
  credential_status: active
scope:
  permitted_actions:
    - chart_operative_note
    - chart_progress_note
    - chart_h_and_p
  prohibited_actions:
    - prescribe_controlled_substances
  institutional_limitations:
    - no_pediatric_cases
autonomy:
  chart: autonomous
  order: supervised
  charge: supervised
  perform: manual
hardening:
  tool_policy_lockdown: true
  exec_approval: true
  cans_protocol_injection: true
  docker_sandbox: false
  safety_guard: true
  audit_trail: true
consent:
  hipaa_warning_acknowledged: true
  synthetic_data_only: true
  audit_consent: true
---

# Clinical Activation and Notification System

This document has been tampered with — the provider name was changed
from "Dr. Test Provider" to "Dr. TAMPERED Provider".
