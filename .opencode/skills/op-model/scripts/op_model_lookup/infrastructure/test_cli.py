"""Unit tests for the CLI renderer: grouped selector lines and six-field JSON records."""

from __future__ import annotations

import json

from op_model_lookup._test_support import literal_model
from op_model_lookup.infrastructure.cli import (
    _render_grouped,
    _render_record,
    render_selection,
)

# Independent fixtures: literal records, hand-written expected output below.
COSTED = literal_model(
    config="openai/gpt-4o",
    id="gpt-4o",
    provider="openai",
    name="gpt-4o",
    cost_in=2.5,
    cost_out=10.0,
)
NO_COST = literal_model(
    config="google/gemini-2.5-flash",
    id="gemini-2.5-flash",
    provider="google",
    name="gemini-2.5-flash",
    cost_in=0.0,
    cost_out=0.0,
)
NAMED = literal_model(
    config="anthropic/claude-3-5-sonnet",
    id="claude-3-5-sonnet",
    provider="anthropic",
    name="Claude 3.5 Sonnet",
    cost_in=3.0,
    cost_out=15.0,
)

RECORD_FIELDS = ["config", "id", "provider", "name", "cost_in", "cost_out"]


def test_grouped_line_shows_cost_segment_when_source_provides_it() -> None:
    """AC1: a provided cost renders the in/out segment after the selector."""
    assert _render_grouped([COSTED]) == (
        "## openai\n  openai/gpt-4o | in:2.5 per 1M | out:10.0 per 1M\n\n"
    )


def test_grouped_line_is_bare_selector_when_cost_is_absent() -> None:
    """AC1: an absent cost omits the cost segment and shows the bare selector."""
    assert _render_grouped([NO_COST]) == "## google\n  google/gemini-2.5-flash\n\n"


def test_grouped_line_appends_human_name_only_when_it_differs_from_id() -> None:
    """A name equal to the id is omitted; a distinct human name is appended."""
    assert _render_grouped([NAMED]) == (
        "## anthropic\n"
        "  anthropic/claude-3-5-sonnet | Claude 3.5 Sonnet"
        " | in:3.0 per 1M | out:15.0 per 1M\n\n"
    )


def test_no_query_listing_groups_models_under_sorted_provider_headings() -> None:
    """A no-query listing groups under sorted `## <provider>` headings with sorted configs."""
    assert render_selection((NO_COST, NAMED, COSTED), "") == (
        "## anthropic\n"
        "  anthropic/claude-3-5-sonnet | Claude 3.5 Sonnet"
        " | in:3.0 per 1M | out:15.0 per 1M\n"
        "\n"
        "## google\n"
        "  google/gemini-2.5-flash\n"
        "\n"
        "## openai\n"
        "  openai/gpt-4o | in:2.5 per 1M | out:10.0 per 1M\n"
        "\n"
    )


def test_query_returns_six_field_json_line_in_contract_order() -> None:
    """A non-empty query emits the `_render_record` JSON line with the six fields in order."""
    rendered = render_selection((COSTED,), "gpt")
    assert rendered == (
        '{"config": "openai/gpt-4o", "id": "gpt-4o", "provider": "openai", '
        '"name": "gpt-4o", "cost_in": 2.5, "cost_out": 10.0}\n'
    )
    assert rendered == f"{_render_record(COSTED)}\n"
    assert list(json.loads(rendered)) == RECORD_FIELDS
