# Frontend Testing Guide

This guide documents the current frontend testing setup for DevDrop.

## 1. Test Stack

The frontend uses:

- Vitest as the test runner
- Testing Library for React component behavior
- `@testing-library/jest-dom` for DOM assertions
- `@testing-library/user-event` for realistic user interactions
- `jsdom` as the browser-like test environment

The available npm scripts are defined in `frontend/package.json`:

```bash
npm test
npm run test:watch
npm run lint
npm run build
```

## 2. What to Test

### Components

Test behavior users can observe rather than implementation details.

Good examples:

- buttons enable/disable correctly
- forms show validation feedback
- loading and error states render correctly
- modal/dialog interactions work
- navigation triggers the expected route behavior

### Pages

Page tests should verify important route-level behavior and integration between the page and its child components. Avoid duplicating every child component assertion in the page suite.

### API-dependent UI

Mock network boundaries when a test is intended to verify frontend behavior without requiring a running backend. Cover loading, success, empty, unauthorized, and error states where those states materially affect the UI.

### Authentication and protected UI

Test that the UI responds correctly to authenticated and unauthenticated states, but keep final authorization enforcement on the backend. Frontend route guards are a UX mechanism, not a security boundary.

## 3. Test Layering

Use the smallest useful test scope:

```text
pure helper / transformation
        -> focused unit test

single component interaction
        -> component test

page + important child behavior
        -> page-level test

multiple frontend pieces + mocked API boundary
        -> integration-style frontend test
```

Do not create tests that merely restate JSX structure. A useful frontend test should protect behavior that could break during refactoring.

## 4. Mocking

Mock external browser/network boundaries when they are not the subject of the test.

Appropriate examples include:

- HTTP requests
- analytics SDK calls
- browser APIs unavailable in `jsdom`
- payment SDK boundaries
- OAuth callbacks or provider redirects

Do not over-mock React components simply to verify that one component called another. Prefer rendering the relevant component tree and asserting user-visible outcomes.

Keep reusable mocks organized in the frontend test structure when the repository establishes a shared mock convention. Keep one-off mocks close to the test when they are specific to one scenario.

## 5. Observability Integrations

`main.jsx` initializes Sentry only when `VITE_SENTRY_DSN` is available and mounts PostHog through its provider. Tests should not make real telemetry calls.

When testing application bootstrap behavior, mock these SDK boundaries rather than relying on external analytics services.

## 6. Environment Variables

Use safe test values for `VITE_*` variables. Never put private backend secrets into frontend test configuration.

Common frontend test configuration may include:

```env
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=test-key
VITE_GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com
VITE_POSTHOG_PROJECT_TOKEN=test-token
VITE_POSTHOG_HOST=http://localhost
VITE_SENTRY_DSN=
```

Only expose variables beginning with `VITE_` when they are intended to be available to browser code.

## 7. Verification Before a Frontend PR

Run:

```bash
cd frontend
npm test
npm run lint
npm run build
```

For a focused change, run the relevant test file in watch mode first, then run the complete suite before submitting the change.

## 8. Common High-Value Areas

Prioritize tests around behavior that crosses several UI states or connects to important backend workflows:

- login/signup and verification UX
- checkout and payment initiation UI
- purchase access states
- workspace loading and empty states
- GitHub connection/export UI
- Vercel/Render deployment connection and status UI
- admin actions and confirmation flows
- navigation redirects such as `/dashboard` to `/workspace`
- error, retry, and loading states for API requests

## 9. Test Maintenance

Tests should remain aligned with the current route and component ownership model described in [`ARCHITECTURE.md`](ARCHITECTURE.md).

When a feature moves between folders or routes, move its tests with it. Avoid introducing a new testing convention unless the existing Vitest setup cannot express the required behavior cleanly.
