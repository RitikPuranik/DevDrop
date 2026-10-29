# React Best Practices (DevDrop original)

Independently written engineering principles for React 18/19 apps built with Vite, in JavaScript/JSX only.

## Structure
One component per file, named exports or a default export that matches how it is imported. Keep components small and focused. Put static content in data modules and import it. Co-locate small helper components with their only consumer.

## State
Keep state as local as possible. Derive values during render instead of storing them. Use one source of truth. Reach for context only for genuinely app-wide values. Use functional updates when new state depends on old state.

## Effects
Use effects only to synchronize with something external. Clean up listeners, timers and observers. Never fetch or compute in render. List every dependency honestly and fix the cause instead of silencing the lint rule.

## Rendering performance
Give list items stable keys from data, never array indexes when order can change. Avoid creating new objects or functions in hot paths when they cause child re-renders you can measure. Use memo, useMemo and useCallback sparingly and only where cost is real. Split heavy, rarely used views with React.lazy and Suspense.

## Async work
Run independent requests in parallel with Promise.all. Handle loading, error and empty results explicitly. Guard against stale responses with a cancellation flag or AbortController. Never leave an unhandled promise.

## Bundle and dependencies
Import only what is used and prefer individual icon imports. Avoid adding a library for something plain React or CSS handles. Do not add dependencies the architecture did not declare.

## Images and media
Set width and height or aspect-ratio to prevent layout shift. Lazy-load below-the-fold images. Provide alt text. Use the exact media URLs supplied by the manifest.

## Events and forms
Use controlled inputs when the value drives UI, uncontrolled otherwise. Prevent default on form submit and give feedback. Debounce expensive input handlers.

## Honest functionality
Every control must do something real with the data available: filters filter, carts total, tabs switch. Do not render buttons, forms or search boxes that do nothing. Remove the control instead.

## Robustness
Guard map, length and property access on data that may be undefined. Keep prop names consistent between parent and child. Export what other files import.
