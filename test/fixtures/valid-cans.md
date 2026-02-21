---
version: "2.0"
provider:
  name: Dr. Test Provider
  npi: "1234567890"
  types:
    - Physician
  degrees:
    - MD
  licenses:
    - MD-TX-A12345
  certifications:
    - ABNS Board Certified
  specialty: Neurosurgery
  subspecialty: Spine
  organizations:
    - name: University Medical Center
      privileges:
        - neurosurgical procedures
        - spine surgery
      primary: true
  credential_status: active
scope:
  permitted_actions:
    - chart_operative_note
    - chart_progress_note
    - chart_h_and_p
autonomy:
  chart: autonomous
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

# Clinical Activation and Notification System

This document configures the CareAgent clinical AI assistant for
Dr. Test Provider, a neurosurgeon specializing in spine surgery
at University Medical Center.

## Provider Summary

Board-certified neurosurgeon with active credentials and full
institutional privileges for neurosurgical and spine procedures.
