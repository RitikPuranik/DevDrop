# DevDrop Testing Guide

This document reflects the current backend and frontend test configuration on `main`.

## 1. Backend Test Layout

Backend tests are intended to be centralized under `backend/tests/`:

```text
backend/tests/
├── api/           # HTTP/controller/route behavior
├── integration/   # Multi-component and cross-module flows
├── mocks/         # Shared test doubles for external/boundary dependencies
├── setup/         # Jest environment setup
└── unit/          # Focused unit tests
```

The active Jest configuration uses:

```text
<rootDir>/tests/unit/**/*.test.js
<rootDir>/tests/api/**/*.test.js
<rootDir>/tests/integration/**/*.test.js
```

Coverage collection targets `src/**/*.js`.

## 2. Backend Commands

From `backend/`:

```bash
npm test
```

Run only unit tests:

```bash
npm run test:unit
```

Run API/controller tests:

```bash
npm run test:api
```

Run integration tests:

```bash
npm run test:integration
```

Generate a local coverage report:

```bash
npm run test:coverage
```

The `coverage/` directory is intentionally ignored by Git. Coverage output should be generated locally or in CI rather than committed to the repository.

## 3. Frontend Test Commands

From `frontend/`:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

The frontend test stack is Vitest with Testing Library, `jsdom`, and `@testing-library/jest-dom`.

Related quality commands:

```bash
npm run lint
npm run build
```

## 4. What Each Test Layer Should Cover

### Unit

Unit tests should isolate a small unit of business logic, validation, transformation, or service behavior. Keep external calls behind mocks or controlled fixtures.

Good candidates include:

- validation rules
- authorization decisions
- calculations and transformations
- deployment framework matching
- helper/service branches

### API

API tests should exercise route/controller behavior and verify HTTP contracts. They can mock infrastructure boundaries such as databases, storage, email, or third-party SDKs when the goal is endpoint behavior rather than end-to-end infrastructure verification.

### Integration

Integration tests should connect real internal components across boundaries. Examples already represented in the current suite include authentication/authorization flows and asset access/download behavior.

Use real internal middleware, routing, controllers, and business logic where practical, while keeping true external systems deterministic and isolated.

## 5. Mock Organization

Shared test doubles are kept under:

```text
backend/tests/mocks/
├── models/
├── services/
└── ...
```

This is preferable to scattering reusable mocks beside production code. Test-specific one-off mocks can remain local to a test when sharing them would make the suite harder to understand.

## 6. Important Current Reorganization Caveat

The Jest configuration comments describe the test suite as fully centralized under `backend/tests/`, but the current repository tree still contains in-source `__tests__` directories, including:

```text
backend/src/modules/auth/__tests__/
backend/src/services/deployment/__tests__/
```

Those paths are not included by the active `testMatch` configuration shown in `backend/jest.config.js`.

That means the correct current interpretation is:

> `backend/tests/` is the active, supported Jest test location, while some in-source `__tests__` directories remain as legacy/uncollected test material.

Do not describe the repository as having completed 100% test relocation until those legacy directories have been migrated or intentionally removed.

## 7. Coverage Hygiene

Coverage reports are useful for local auditing and CI quality gates, but the generated `coverage/` directory should not live in source control. The repository's current Git ignore rules explicitly exclude it.

When evaluating coverage, focus on meaningful behavioral coverage rather than the raw percentage alone. High-value targets include:

- authentication and authorization boundaries
- payment/webhook verification
- purchase ownership checks
- asset access/download rules
- auction state transitions
- GitHub export authorization
- deployment provider connection and lifecycle handling
- backup/restore safeguards

## 8. Test Writing Rules

Prefer deterministic tests with explicit setup and cleanup.

Use the narrowest test layer that proves the behavior. A pure function belongs in unit tests; a route contract belongs in API tests; a multi-module business flow belongs in integration tests.

Mock external infrastructure when it would make the test slow, nondeterministic, credential-dependent, or network-dependent. Do not mock the internal component whose collaboration is the behavior under test.

When adding a new test, place it under the matching centralized directory rather than creating a new `__tests__` directory inside `src/`.

## 9. Pre-PR Verification

A practical backend verification pass is:

```bash
cd backend
npm test
```

For changes touching a specific layer, also run the focused command. For frontend changes:

```bash
cd frontend
npm test
npm run lint
npm run build
```

For changes involving deployment, GitHub export, payments, or other credential-sensitive integrations, add or update tests that verify authorization failures as well as the successful path.
