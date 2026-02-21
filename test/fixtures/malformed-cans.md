---
version: "2.0"
provider:
  name: Dr. Test Provider
  npi: "1234567890"
  types: []
  degrees:
    - MD
  licenses:
    - MD-TX-A12345
  certifications: []
  specialty: Neurosurgery
  organizations:
    - name: University Medical Center
      primary: true
scope:
  permitted_actions:
    - chart_operative_note
autonomy:
  chart: auto
  order: supervised
  charge: supervised
  perform: manual
  interpret: manual
  educate: manual
  coordinate: manual
consent:
  hipaa_warning_acknowledged: true
  synthetic_data_only: true
  audit_consent: true
  acknowledged_at: "2026-02-21T00:00:00.000Z"
skills:
  authorized: []
---

# Malformed CANS Document

This document has validation errors:
- provider.types is empty (minItems: 1 required)
- autonomy.chart is "auto" (not a valid tier)
