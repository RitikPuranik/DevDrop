from datetime import datetime, timezone

from gemini_pool.scoring import rank_candidates, score_candidate
from storage.gemini_pool_models import GeminiProjectCredential

NOW = datetime.now(timezone.utc)


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(name="p", projectId="proj", credentialReference="key", model="gemini-2.0-flash")
    return GeminiProjectCredential(**{**defaults, **overrides})


def test_score_is_deterministic_for_identical_inputs():
    p = _project(priority=5, rpmLimit=100, requestsThisMinute=10)
    assert score_candidate(p, NOW, 100) == score_candidate(p, NOW, 100)


def test_more_headroom_scores_higher():
    busy = _project(rpmLimit=100, requestsThisMinute=95)
    idle = _project(rpmLimit=100, requestsThisMinute=5)
    assert score_candidate(idle, NOW, 100) > score_candidate(busy, NOW, 100)


def test_lower_priority_number_scores_higher():
    high_priority = _project(priority=1)
    low_priority = _project(priority=500)
    assert score_candidate(high_priority, NOW, 100) > score_candidate(low_priority, NOW, 100)


def test_recent_failures_reduce_score():
    healthy = _project(consecutiveFailures=0)
    flaky = _project(consecutiveFailures=4)
    assert score_candidate(healthy, NOW, 100) > score_candidate(flaky, NOW, 100)


def test_unlimited_project_treated_as_full_headroom():
    unlimited = _project(rpmLimit=None, tpmLimit=None, rpdLimit=None)
    limited_but_empty = _project(rpmLimit=1000, tpmLimit=1_000_000, rpdLimit=100_000)
    # Both should score very similarly (full headroom either way) —
    # "no limit configured" must not be scored as "zero headroom."
    assert abs(score_candidate(unlimited, NOW, 100) - score_candidate(limited_but_empty, NOW, 100)) < 1.0


def test_budget_headroom_affects_score():
    flush = _project(monthlyBudget=100.0, monthlyUsage=5.0)
    tight = _project(monthlyBudget=100.0, monthlyUsage=95.0)
    assert score_candidate(flush, NOW, 100) > score_candidate(tight, NOW, 100)


def test_rank_candidates_orders_best_first():
    worst = _project(projectId="worst", priority=999, consecutiveFailures=5)
    best = _project(projectId="best", priority=1, consecutiveFailures=0)
    middling = _project(projectId="mid", priority=100)
    ranked = rank_candidates([worst, middling, best], NOW, 100)
    assert [p.projectId for p in ranked] == ["best", "mid", "worst"]


def test_rank_candidates_breaks_ties_deterministically_by_id():
    a = _project(id="aaa", projectId="same")
    b = _project(id="bbb", projectId="same")
    ranked_once = rank_candidates([b, a], NOW, 100)
    ranked_again = rank_candidates([a, b], NOW, 100)
    assert [p.id for p in ranked_once] == [p.id for p in ranked_again] == ["aaa", "bbb"]
