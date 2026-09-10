"""
Pure RPM/TPM/RPD window-reset math, shared by every repository
implementation (storage/gemini_pool_memory.py,
storage/gemini_pool_mongo.py) and by gemini_pool/scheduler.py's
optimistic pre-filter (Sections 10-12).

Lives in storage/, not gemini_pool/, on purpose: it has zero storage
dependencies of its own (pure functions of a record + a clock), and
keeping it here means the repository layer doesn't have to import
"upward" into the business-logic package to share this logic with the
scheduler — both sides import this leaf module instead. This is the one
place the "has a window boundary passed?" rule is defined; every caller
uses it rather than re-deriving it, which is what keeps the optimistic
pre-filter and each repository's atomic `reserve()` from silently
drifting apart over time.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from storage.gemini_pool_models import GeminiProjectCredential

_MINUTE = timedelta(minutes=1)


def _as_aware_utc(dt: datetime) -> datetime:
    """Normalizes a datetime to timezone-aware UTC.

    MongoDB round-trips strip tzinfo off stored dates by default (pymongo
    returns naive datetimes unless the client is constructed with
    tz_aware=True), while freshly-created records use
    storage/models.py:utcnow() (timezone-aware). Comparing/subtracting a
    naive and an aware datetime raises TypeError, so every datetime this
    module touches is normalized through here first rather than assuming
    one representation. A naive value is always treated as already being
    UTC (every writer in this codebase only ever writes UTC instants),
    never the local timezone.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@dataclass(frozen=True)
class EffectiveCounts:
    """What a project's rate-limit counters would be *right now* if any
    due window reset were applied. Read-only projection — computing this
    never mutates the record; the caller decides whether/how to persist
    the reset (gemini_pool_memory.py and gemini_pool_mongo.py's
    `reserve()` do so atomically together with the reservation)."""

    requests_this_minute: int
    tokens_this_minute: int
    requests_today: int
    minute_window_reset: bool
    daily_window_reset: bool


def effective_counts(project: GeminiProjectCredential, now: datetime, daily_reset_hour_utc: int) -> EffectiveCounts:
    now = _as_aware_utc(now)
    minute_window_started_at = _as_aware_utc(project.minuteWindowStartedAt)
    daily_window_started_at = _as_aware_utc(project.dailyWindowStartedAt)
    minute_reset = now - minute_window_started_at >= _MINUTE
    daily_reset = now >= next_daily_boundary(daily_window_started_at, daily_reset_hour_utc)
    return EffectiveCounts(
        requests_this_minute=0 if minute_reset else project.requestsThisMinute,
        tokens_this_minute=0 if minute_reset else project.tokensThisMinute,
        requests_today=0 if daily_reset else project.requestsToday,
        minute_window_reset=minute_reset,
        daily_window_reset=daily_reset,
    )


def next_daily_boundary(window_started_at: datetime, hour_utc: int) -> datetime:
    """The next wall-clock UTC instant, at `hour_utc:00`, on or after
    `window_started_at` — i.e. when the day-window that started at
    `window_started_at` ends.

    Section 12 is explicit that a hard-coded reset timezone must not be
    assumed without checking Gemini's current documented quota-reset
    behavior. `hour_utc` is GEMINI_DAILY_RESET_HOUR_UTC (config.py),
    defaulted to UTC midnight as the most defensible placeholder — not a
    verified claim about Google's actual reset instant. See
    docs/GEMINI_PROJECT_POOL.md's "Daily quota handling" section.
    """
    window_started_at = _as_aware_utc(window_started_at)
    boundary = window_started_at.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=hour_utc)
    if boundary <= window_started_at:
        boundary += timedelta(days=1)
    return boundary