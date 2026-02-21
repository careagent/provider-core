---
created: 2026-02-21T11:16:39.509Z
title: Integrate scope with Axon actions taxonomy
area: general
files:
  - src/activation/cans-schema.ts
  - src/credentials/validator.ts
  - src/onboarding/stages.ts
---

## Problem

The CANS schema redesign uses `scope.permitted_actions` as a whitelist-only model. The values in this array must come from Axon's controlled vocabulary (permitted actions taxonomy), not free-text input. provider-core needs to:

1. Validate that `scope.permitted_actions` strings match Axon's taxonomy
2. Present valid actions per provider type during onboarding questionnaires
3. Ensure skill gating references the same action identifiers
4. Ensure the hardening engine checks actions against the same vocabulary

Depends on: Axon "Build permitted actions taxonomy" todo being completed first.

## Solution

1. Add an Axon taxonomy client/loader to provider-core that fetches or reads the valid action set
2. Update CANS schema validation to check action strings against the taxonomy
3. Update onboarding to present selectable actions from the taxonomy filtered by provider type
4. Update credential validator and skill gating to reference taxonomy action IDs
