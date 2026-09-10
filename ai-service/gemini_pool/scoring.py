"""
Candidate scoring — Section 9.

A pure function: `(project, now, estimated_total_tokens) -> float`. No I/O,
no randomness, so it's trivially unit-testable and its output is
reproducible for the same inputs — "keep the algorithm deterministic
enough to test," per the spec.

The weights below are the tunable part of the formula. They're module
constants rather than settings/env vars on purpose: Section 26's env var
list is about *operational* configuration (timeouts, defaults, feature
flags) that ops teams reasonably change per deployment; these weights are
a scheduling *policy* tuning knob more akin to a constant in the
algorithm itself. Exposing 6 more env vars for something no one asked to
configure per-deployment felt like the wrong kind of "configurable" —
this stays trivial to change in code review if the ranking ever needs
retuning.
"""
from datetime import datetime

from storage.gemini_pool_models import GeminiProjectCredential

W_HEALTH = 100.0
W_RPM = 20.0
W_TPM = 20.0
W_RPD = 15.0
W_BUDGET = 15.0
W_PRIORITY = 0.5
FAILURE_PENALTY_PER_STRIKE = 10.0
MAX_FAILURE_PENALTY = 50.0

#: priority is "lower number = scheduled first" (documented on the model
#: field); this is the range priority values are expected to fall in so
#: the priority term stays comparable in magnitude to the others.
_PRIORITY_FLOOR = 0
_PRIORITY_CEILING = 1000


def _headroom_fraction(used: int, limit: int | None) -> float:
    """1.0 = fully available, 0.0 = no room left. A project with no
    configured limit (limit is None — "Google enforces it, we don't track
    it separately") is treated as maximum headroom rather than excluded;
    the eligibility check (gemini_pool/scheduler.py), not this function,
    is what enforces "no limit configured" vs. "limit exceeded"."""
    if limit is None or limit <= 0:
        return 1.0
    return max(0.0, min(1.0, (limit - used) / limit))


def score_candidate(
    project: GeminiProjectCredential,
    now: datetime,
    estimated_total_tokens: int,
) -> float:
    """Higher is better. Only meaningful to compare between projects
    returned by the scheduler's own eligibility filter — this function
    doesn't re-check eligibility, it ranks projects already known to
    qualify."""
    rpm_headroom = _headroom_fraction(project.requestsThisMinute + 1, project.rpmLimit)
    tpm_headroom = _headroom_fraction(project.tokensThisMinute + estimated_total_tokens, project.tpmLimit)
    rpd_headroom = _headroom_fraction(project.requestsToday + 1, project.rpdLimit)

    if project.monthlyBudget is not None and project.monthlyBudget > 0:
        budget_headroom = max(0.0, min(1.0, 1 - (project.monthlyUsage / project.monthlyBudget)))
    else:
        budget_headroom = 1.0

    priority_clamped = max(_PRIORITY_FLOOR, min(_PRIORITY_CEILING, project.priority))
    priority_term = (_PRIORITY_CEILING - priority_clamped) / _PRIORITY_CEILING

    failure_penalty = min(MAX_FAILURE_PENALTY, project.consecutiveFailures * FAILURE_PENALTY_PER_STRIKE)

    return (
        W_HEALTH
        + W_RPM * rpm_headroom
        + W_TPM * tpm_headroom
        + W_RPD * rpd_headroom
        + W_BUDGET * budget_headroom
        + W_PRIORITY * priority_term * 100
        - failure_penalty
    )


def rank_candidates(
    projects: list[GeminiProjectCredential],
    now: datetime,
    estimated_total_tokens: int,
) -> list[GeminiProjectCredential]:
    """Highest score first. Ties broken by `id` so the ordering is fully
    deterministic (stable across runs with identical scores) rather than
    depending on Python's sort stability plus whatever order the
    repository happened to return them in."""
    return sorted(
        projects,
        key=lambda p: (-score_candidate(p, now, estimated_total_tokens), p.id),
    )
