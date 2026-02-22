# @careagent/provider-core

**The provider-side CareAgent plugin for OpenClaw.**

@careagent/provider-core transforms a standard OpenClaw personal AI agent into a credentialed, auditable, hardened clinical agent governed by the Irreducible Risk Hypothesis. It is the clinical activation layer for any healthcare provider — physician, nurse, therapist, pharmacist, technician, or any professional who documents in a patient's chart, interacts with patients, or performs clinical orders and actions.

This package is a plugin into OpenClaw — not a fork of it. When the plugin detects a `CANS.md` file in an agent's workspace, it activates credential validation, append-only audit logging, multi-layer runtime hardening, clinical protocol injection, credentialed skill gating, Neuron registration, and cross-installation communication. When no `CANS.md` is present, the plugin takes no action.

---

## The Seven Atomic Actions

All provider practice reduces to seven irreducible actions:

| Action | Delegable to AI | Oversight Model |
|--------|----------------|-----------------|
| **Chart** | Yes | Post-hoc review |
| **Order** | Yes | Pre-execution approval |
| **Charge** | Yes | Periodic audit |
| **Perform** | Not yet | Provider-present |
| **Interpret** | Yes | Provider attestation |
| **Educate** | Yes | Comprehension verification |
| **Coordinate** | Yes | Protocol-driven |

@careagent/provider-core enables AI delegation of chart, order, charge, interpret, educate, and coordinate within defined autonomy tiers. The risk associated with every delegated action remains with the provider.

---

## Quick Start

Requires an existing OpenClaw installation.

```bash
openclaw plugins install @careagent/provider-core
openclaw gateway restart
careagent init
```

See [Installation Guide](docs/installation.md) for full setup instructions.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | Plugin model, CANS activation, hardening, skills, audit |
| [Installation](docs/installation.md) | Prerequisites, setup, first-run verification |
| [Onboarding](docs/onboarding.md) | Provider interview and CANS.md generation |
| [Configuration](docs/configuration.md) | CANS.md schema, skill manifests, plugin config |

---

## Related Repositories

| Repository | Purpose |
|-----------|---------|
| [careagent/patient-core](https://github.com/careagent/patient-core) | Patient-side CareAgent plugin |
| [careagent/patient-chart](https://github.com/careagent/patient-chart) | Patient Chart vault |
| [careagent/neuron](https://github.com/careagent/neuron) | Organization-level Axon node |
| [careagent/axon](https://github.com/careagent/axon) | Open foundation network layer and protocol |
| [careagent/provider-skills](https://github.com/careagent/provider-skills) | Provider clinical skills registry |
| [careagent/patient-skills](https://github.com/careagent/patient-skills) | Patient clinical skills registry |

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

Apache 2.0. See [LICENSE](LICENSE).

Transparency is a structural requirement when providers bear personal liability for their agent's actions. Every line of code in this repository is open, auditable, and improvable by the community it serves.
