---
version: "1.0"
provider:
  name: Dr. Test Provider
  npi: "1234567890"
  license:
    type: RN
    state: TX
    number: A12345
    verified: false
  specialty: Neurosurgery
  privileges:
    - neurosurgical procedures
scope:
  permitted_actions:
    - chart_operative_note
autonomy:
  chart: auto
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

# Malformed CANS Document

This document has validation errors:
- license.type is "RN" (not in the valid union)
- autonomy.chart is "auto" (not a valid tier)
