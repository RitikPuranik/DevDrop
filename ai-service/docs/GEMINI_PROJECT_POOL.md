# Gemini Project Pool

A dynamic pool of Gemini projects/credentials the AI Gateway schedules
requests across, so DevDrop can run on 1 project or 100+ without any code
change — and without a `GEMINI_API_KEY_1..N`-style environment file.

Opt-in: everything below only activates when `GEMINI_POOL_ENABLED=true`.
Leave it unset and `AI_PROVIDER=gemini` behaves exactly as it always has,
using the single `GEMINI_API_KEY`/`GEMINI_MODEL` pair.

```text
Agent
  │  await ai_gateway.generate(...)          — agent knows nothing else
  ▼
providers.factory.get_provider()             — unchanged call site
  ▼
GeminiPooledProvider (providers/gemini_pool_provider.py)
  │  estimates tokens, tracks attempted-project-ids for this request
  ▼
GeminiScheduler (gemini_pool/scheduler.py)
  │  rank eligible candidates → atomically reserve the best one
  ▼
GeminiPoolRepository (storage/gemini_pool_memory.py | _mongo.py)
  │  the actual claimed project
  ▼
Gemini API
```

## Adding a Gemini project

```
POST /v1/admin/gemini-projects
{
  "name": "Prod Project 3",
  "projectId": "devdrop-gemini-3",
  "apiKey": "AIza...",
  "model": "gemini-2.0-flash",
  "priority": 100,
  "rpmLimit": 60,
  "tpmLimit": 1000000,
  "rpdLimit": 1500,
  "monthlyBudget": 50.0
}
```

The project is stored and immediately `ACTIVE` / eligible for scheduling.
`apiKey` is never echoed back in the response — every admin response is a
masked `GeminiProjectPublic` projection (`maskedCredential`, e.g.
`AIza...9F3k`). Pass `"validateOnAdd": true` to make this call also run a
real, minimal Gemini request before returning, so a typo'd key fails at
add-time instead of at the next scheduled request; this is optional and
defaults to off so CI/local dev never depends on Gemini being reachable
just to create a pool entry — use `POST .../{id}/test` any time after to
check a credential on demand instead.

No numbered environment variables are involved at any point — that's the
whole point of the pool existing.

## Removing a Gemini project

```
DELETE /v1/admin/gemini-projects/{id}
```

Soft by default: status flips to `removed`, permanently excluded from
scheduling from that instant on. Usage/health history is preserved and
still queryable. A request that already reserved this project before the
delete finishes or fails normally — nothing about an in-flight request
re-checks status mid-call.

`DELETE .../{id}?purge=true` physically deletes the record instead.

## Disabling / enabling

```
PATCH /v1/admin/gemini-projects/{id}   {"status": "disabled"}
PATCH /v1/admin/gemini-projects/{id}   {"status": "active"}
```

`disabled` is the same scheduling exclusion as `removed`, just explicitly
reversible. Enabling doesn't blindly force `active` back on — it
re-evaluates whatever the project's own fields already say:

- Still within a live cooldown → stays in that cooldown.
- Still short of a `dailyResetAt`/`monthlyBudget` boundary → stays
  `daily_exhausted`/`budget_exhausted`.
- `auth_error` / `invalid_credential` / `model_unavailable` → **enabling
  is refused (409)**. Those need a real successful call to clear, not an
  operator's click — run `POST .../{id}/test` first.
- Nothing blocking → becomes `active`.

`PATCH` only accepts `"active"` or `"disabled"` for `status` — every other
value (`cooldown_rpm`, `daily_exhausted`, ...) is the scheduler's own
bookkeeping and is rejected with a 400 if sent directly.

## How scheduling works

Every Gemini call goes through `GeminiScheduler.select_and_reserve` — see
`gemini_pool/scheduler.py`. Two phases:

1. **Optimistic filter + rank** (pure Python, no I/O per candidate):
   drop anything disabled/removed/invalid/model-mismatched/already-tried-
   this-request, then score the rest (`gemini_pool/scoring.py`) on
   healthiness, remaining RPM/TPM/RPD headroom, budget headroom, priority,
   and recent-failure count — highest score first, ties broken by id so
   the ordering is fully reproducible.
2. **Atomic reserve**: the top-ranked candidate is re-checked and claimed
   in one atomic repository operation. If another worker got there first
   (or it went ineligible in the interim), that returns "not reserved" and
   the scheduler just moves to the next-ranked candidate — not an error.

Agents never see any of this; they only ever call
`await ai_gateway.generate(...)`.

## RPM / TPM handling

Every project tracks `requestsThisMinute` / `tokensThisMinute` against its
own `rpmLimit` / `tpmLimit` (either can be left unset — "Google enforces
it, we don't track it separately"). Token usage for eligibility is a
**pre-request estimate** (`GEMINI_ESTIMATED_CHARS_PER_TOKEN`,
`GEMINI_ESTIMATED_OUTPUT_TOKENS`), corrected to Gemini's own reported
`usage_metadata` token counts once the real response comes back.

On a 429, the error is classified (`gemini_pool/errors.py`) into RPM vs
TPM vs RPD by pattern-matching the quota name Google puts in the error
message — Gemini doesn't separate these at the HTTP-status level, they're
all `RESOURCE_EXHAUSTED`. An unrecognized quota message degrades to "RPM,
retry soonest" rather than crashing.

The project goes into `cooldown_rpm` / `cooldown_tpm` with an
**exponential-backoff-with-jitter** cooldown
(`GEMINI_COOLDOWN_DEFAULT_MS`, capped at `GEMINI_COOLDOWN_MAX_MS`,
doubling per consecutive failure on that project, plus up to 25% random
jitter) so many workers hitting the same wall don't all retry on the
identical tick. The failed request itself fails over to the next eligible
project immediately rather than waiting out the cooldown in-line.

## Daily quota handling

`requestsToday` resets on a configurable UTC boundary,
`GEMINI_DAILY_RESET_HOUR_UTC` (default midnight UTC).

**This default is a placeholder, not a verified claim about Google's own
reset instant.** Confirm Gemini's currently documented daily-quota reset
behavior before relying on this in production — Section 12 of the spec
this pool was built against is explicit that a reset timezone must not be
assumed without checking, and nothing in this codebase has verified it
against a live 429 response (see "Known limitations" below).

A project that hits its configured `rpdLimit`, or that Gemini itself
reports as daily-exhausted, moves to `daily_exhausted` with `dailyResetAt`
set; it becomes eligible again automatically once `dailyResetAt` passes —
no manual action needed, unlike `auth_error`/`invalid_credential`.

## Budget controls

`monthlyBudget` / `monthlyUsage` are an **internal estimate only** — never
Google's authoritative billing. `monthlyUsage` only accrues if
`GEMINI_BUDGET_GUARD_ENABLED=true` and you've configured non-zero
`GEMINI_COST_PER_1K_INPUT_TOKENS` / `_OUTPUT_TOKENS`; left at the 0.0
default, the guard is effectively off even with a `monthlyBudget` set on a
project (documented deliberately, so a `monthlyBudget` field doesn't look
like it's doing something it isn't).

A project at or over its budget is excluded from scheduling
(`budget_exhausted`) before a request is even attempted — this is a
proactive check, not a reaction to a Gemini error (Google has no
"billing exceeded" error shape this pool tries to detect). `budgetState`
(`normal`/`warning`/`critical`/`exhausted`) is exposed per-project via the
admin API for dashboards, using configurable thresholds
(`GEMINI_BUDGET_WARNING_THRESHOLD` / `_CRITICAL_THRESHOLD`).

## Failover behavior

A single `ai_gateway.generate()` call may try up to
`GEMINI_MAX_PROJECT_FAILOVERS + 1` different projects before giving up,
tracking which projects it already tried so the same one is never picked
twice for that call. Whether a failure triggers failover at all depends on
its classification:

| Error class | Failover? | Project penalized? |
|---|---|---|
| RPM / TPM / RPD | yes | yes (cooldown / daily-exhausted) |
| Auth / invalid credential / model unavailable | yes | yes (needs manual `test`) |
| Server error / timeout / unknown | yes | yes (short cooldown) |
| **Application error** (bad/blocked prompt) | **no** | **no** |

That last row is deliberate: a malformed request or a safety-blocked
prompt isn't the project's fault, and retrying the identical bad prompt
against a different credential wastes an attempt for no benefit — the
whole pool would otherwise get burned through one bad prompt at a time.

If every attempt is exhausted (or the pool has zero eligible projects to
begin with), the caller gets a clean `AIProviderError` — not a raw 500 —
which surfaces through the existing agent/pipeline error path.

## Multi-worker behavior

If this service ever runs as more than one process/instance, two workers
must not double-book the same project's quota. The scheduling primitive
(`GeminiPoolRepository.reserve`) is atomic per repository:

- **In-memory repository** (default without `AI_DATABASE_URL`, and what
  every test in this feature exercises): a single `asyncio.Lock` around
  every reserve/record — real atomicity, but **single-process only**,
  same documented scope as the existing `storage/memory.py`.
- **MongoDB repository** (`AI_DATABASE_URL` set): optimistic concurrency
  via each record's own `updatedAt` field — read, decide, then write with
  a filter requiring `updatedAt` still matches what was just read. A
  losing race returns "not reserved," which the scheduler already treats
  as "try the next candidate." Not yet run against a live MongoDB in this
  environment — see "Known limitations."

A lease (`leaseOwner`/`leaseExpiresAt`, `GEMINI_LEASE_TTL_SECONDS`) is what
actually blocks a second concurrent reservation of the same project; it
expires automatically, so a crashed worker never permanently locks a
project out of the pool.

No Redis or other new infrastructure was introduced for this — the spec
this was built against explicitly says not to add infrastructure that
isn't already needed, and it isn't: the repository interface
(`GeminiPoolRepository`) is what a future Redis-backed implementation
would sit behind, without the scheduler changing at all.

## Security

- Every admin API response returns a masked view (`GeminiProjectPublic`)
  — the raw credential is never included in a GET/POST/PATCH response.
- Credentials are never logged. `gemini_pool/errors.py`'s `scrub_secret`
  strips any known credential value out of an error message before it's
  stored on a project's `lastError` field or logged, as defense in depth
  (Gemini has no documented reason to echo a key back in an error body,
  but this costs nothing).
- **Credentials are stored as plaintext in the database**
  (`credentialReference`) — this codebase has no secrets-manager
  integration to point at instead (the legacy `GEMINI_API_KEY` env var
  isn't referenced from one either). Every read of this field goes
  through `gemini_pool/lifecycle.py` or
  `providers/gemini_pool_provider.py`, never directly from a route
  handler. If a real secrets manager is ever integrated, this is the one
  field that needs to change into a reference.
- The admin API is protected by the same internal `X-Service-Auth` header
  every other route in this service uses — this service is only ever
  called by the DevDrop Node backend, never directly by the frontend or an
  end user, so the Node backend's own admin-auth layer is what actually
  gates who can reach these routes.

## Fallback provider behavior

If the pool has zero eligible projects (none configured, or every
configured project is currently ineligible), `GeminiPooledProvider`
raises a clean `AIProviderError` rather than crashing — this surfaces as a
normal `AgentError` → pipeline failure → a real error response, not an
unexplained 500.

There is **no automatic cross-provider fallback** (e.g. silently switching
to Ollama mid-request) — this codebase's provider abstraction doesn't have
a fallback-chain concept for any provider today, and building one wasn't
in scope here (see "Known limitations"). An operator can switch
`AI_PROVIDER=ollama` to change which provider new jobs use; an
already-selected provider for an in-flight job doesn't change mid-job.

## Testing

Every test in this feature (`tests/test_gemini_*.py`) runs against the
in-memory repository and an injected fake `GeminiCaller` — none of it
touches the network or needs a real Mongo/Gemini credential, so it runs in
CI unconditionally. See each test module's docstring for what it covers;
`gemini_pool/gemini_client.py`'s `GeminiCaller` protocol is the one seam
both `providers/gemini_pool_provider.py` and `gemini_pool/lifecycle.py`
accept an override for.

## Known limitations

- **`storage/gemini_pool_mongo.py` has not been run against a live
  MongoDB** in this environment (no server reachable here) — same
  disclaimer the pre-existing `storage/mongo.py` already carries about
  itself. Smoke-test it against a real database before depending on it in
  production.
- **`GEMINI_DAILY_RESET_HOUR_UTC`'s default (UTC midnight) is a
  placeholder**, not a value verified against Gemini's current documented
  quota-reset behavior.
- **RPM vs TPM vs RPD classification is message-pattern-based**, since
  Gemini's 429 responses don't separate these at the HTTP/status-code
  level — verify the exact quota-metric strings against a real
  rate-limited response before leaning on the split for anything
  operationally sensitive.
- **A pool entry serves exactly one model.** To offer multiple models from
  the same underlying Google Cloud project/key, register multiple pool
  entries pointing at the same credential with different `model` values,
  rather than one entry supporting several models.
- **No automatic cross-provider fallback** (see above).
- **No automatic monthly budget reset.** `monthlyUsage` only goes down if
  an admin explicitly `PATCH`es it (or the underlying record) — there's no
  `monthlyResetAt` field or scheduled job, matching the spec's minimum
  field list rather than inventing a billing-cycle concept that wasn't
  asked for.
