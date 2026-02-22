# Contributing to @careagent/provider-core

Contributions are welcome from clinicians, developers, and anyone committed to building trustworthy clinical AI infrastructure.

## Development Setup

```bash
git clone https://github.com/careagent/provider-core
cd provider-core
pnpm install
```

Requires Node.js >= 22.12.0 and [pnpm](https://pnpm.io). See [docs/installation.md](docs/installation.md) for comprehensive setup.

## Running Tests

```bash
pnpm test              # Run all tests
pnpm typecheck         # TypeScript type checking
pnpm test:coverage     # Test coverage report
```

All tests must pass before submitting a pull request.

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run `pnpm test` and `pnpm typecheck`
5. Submit a pull request with a clear description

## Code Conventions

- TypeScript ESM (ECMAScript modules)
- Node.js >= 22.12.0
- pnpm as the package manager
- Vitest for testing
- No runtime npm dependencies — all dependencies are dev-only or peer

## Clinical Skills

Clinical skill contributions belong in [careagent/provider-skills](https://github.com/careagent/provider-skills), not this repository. This package provides the activation and governance layer; skills are separate packages.

## Important

No real patient data or PHI in code, tests, or documentation. Use synthetic data only. Every test fixture and example must be clearly fictional.

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.
