"""E2E: the public `models.py` command contract through real composition."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Callable

# Independent fixture catalogs: fake `opencode models` selector-line stdout payloads.
CATALOG_TWO_PROVIDERS = "zeta/zeta-two\nalpha/alpha-two\nalpha/alpha-one\n"

CATALOG_MIXED = (
    "good/one\n"
    "not a selector\n"
    "good/two\n"
    "\n"
    "still not a selector\n"
    "good/three\n"
)

CATALOG_ALL_INVALID = (
    "not a selector\n"
    "missing-slash-here\n"
    "\n"
    "another bad line\n"
)

# Independent expected outputs, hand-written from the contract.
RECORD_FIELDS = ["config", "id", "provider", "name", "cost_in", "cost_out"]

EXPECTED_GROUPED_LISTING = (
    "## alpha\n"
    "  alpha/alpha-one\n"
    "  alpha/alpha-two\n"
    "\n"
    "## zeta\n"
    "  zeta/zeta-two\n"
    "\n"
)

EXPECTED_ALPHA_TWO = (
    '{"config": "alpha/alpha-two", "id": "alpha-two", "provider": "alpha", '
    '"name": "alpha-two", "cost_in": 0.0, "cost_out": 0.0}'
)
EXPECTED_ALPHA_ONE = (
    '{"config": "alpha/alpha-one", "id": "alpha-one", "provider": "alpha", '
    '"name": "alpha-one", "cost_in": 0.0, "cost_out": 0.0}'
)
EXPECTED_GOOD_ONE = (
    '{"config": "good/one", "id": "one", "provider": "good", '
    '"name": "one", "cost_in": 0.0, "cost_out": 0.0}'
)
EXPECTED_GOOD_TWO = (
    '{"config": "good/two", "id": "two", "provider": "good", '
    '"name": "two", "cost_in": 0.0, "cost_out": 0.0}'
)
EXPECTED_GOOD_THREE = (
    '{"config": "good/three", "id": "three", "provider": "good", '
    '"name": "three", "cost_in": 0.0, "cost_out": 0.0}'
)
EXPECTED_NO_MODELS_STDERR = "No models parsed from `opencode models` output.\n"
EXPECTED_NO_MATCH_STDERR = (
    "No match for no-such-model in `opencode models`. "
    "Run `<python> .opencode/skills/op-model/scripts/models.py` "
    "to see all available models.\n"
)


def test_no_query_lists_models_grouped_by_provider_and_config(
    run_models: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    """No-query run groups every selector under its sorted provider and config."""
    result = run_models(CATALOG_TWO_PROVIDERS)
    assert result.returncode == 0
    assert result.stdout == EXPECTED_GROUPED_LISTING
    assert result.stderr == ""


def test_query_returns_six_field_json_lines_in_encounter_order(
    run_models: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    """A nonempty query emits one JSON line per match: six contract fields in order, in encounter order."""
    result = run_models(CATALOG_TWO_PROVIDERS, "alpha")
    assert result.returncode == 0
    assert result.stdout == f"{EXPECTED_ALPHA_TWO}\n{EXPECTED_ALPHA_ONE}\n"
    assert result.stderr == ""
    for line in result.stdout.splitlines():
        assert list(json.loads(line)) == RECORD_FIELDS


def test_mixed_valid_and_invalid_lines_keep_valid_records(
    run_models: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    """A non-selector line is skipped while its valid neighbours survive (AC6)."""
    result = run_models(CATALOG_MIXED, "good")
    assert result.returncode == 0
    assert result.stdout == (
        f"{EXPECTED_GOOD_ONE}\n{EXPECTED_GOOD_TWO}\n{EXPECTED_GOOD_THREE}\n"
    )
    assert result.stderr == ""


def test_all_invalid_catalog_reports_no_models(
    run_models: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    """A catalog of only invalid lines is a truthful nonzero no-models outcome with no stdout."""
    result = run_models(CATALOG_ALL_INVALID)
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == EXPECTED_NO_MODELS_STDERR


def test_no_match_query_reports_no_match_on_stderr(
    run_models: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    """A query matching nothing exits 1 with a 'No match for' message on stderr and no stdout."""
    result = run_models(CATALOG_TWO_PROVIDERS, "no-such-model")
    assert result.returncode == 1
    assert result.stdout == ""
    assert "No match for" in result.stderr
    assert result.stderr == EXPECTED_NO_MATCH_STDERR
