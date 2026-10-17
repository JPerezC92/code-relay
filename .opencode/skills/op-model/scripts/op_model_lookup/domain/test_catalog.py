"""Unit tests for catalog.parse_records over selector lines, skipping, and recovery."""

from op_model_lookup._test_support import literal_model, raw_stdout, selector_line
from op_model_lookup.domain.catalog import (
    CatalogParseResult,
    Model,
    ParseIssue,
    parse_records,
)


def test_valid_selector_line_maps_to_exact_model() -> None:
    stdout = raw_stdout(selector_line("openai", "gpt-4o"))
    result = parse_records(stdout)
    assert isinstance(result, CatalogParseResult)
    assert result.issues == ()
    assert isinstance(result.models, tuple)
    assert result.models == (
        literal_model(
            config="openai/gpt-4o",
            id="gpt-4o",
            provider="openai",
            name="gpt-4o",
            cost_in=0.0,
            cost_out=0.0,
        ),
    )
    model = result.models[0]
    assert isinstance(model, Model)
    assert model.name == model.id
    assert isinstance(model.cost_in, float) and model.cost_in == 0.0
    assert isinstance(model.cost_out, float) and model.cost_out == 0.0


def test_selector_lines_map_in_encounter_order() -> None:
    stdout = raw_stdout(
        selector_line("deepseek", "deepseek-v4-flash"),
        selector_line("openai", "gpt-4o"),
        selector_line("anthropic", "claude-3"),
    )
    result = parse_records(stdout)
    assert result.issues == ()
    assert result.models == (
        literal_model(
            config="deepseek/deepseek-v4-flash",
            id="deepseek-v4-flash",
            provider="deepseek",
            name="deepseek-v4-flash",
            cost_in=0.0,
            cost_out=0.0,
        ),
        literal_model(
            config="openai/gpt-4o",
            id="gpt-4o",
            provider="openai",
            name="gpt-4o",
            cost_in=0.0,
            cost_out=0.0,
        ),
        literal_model(
            config="anthropic/claude-3",
            id="claude-3",
            provider="anthropic",
            name="claude-3",
            cost_in=0.0,
            cost_out=0.0,
        ),
    )


def test_blank_and_whitespace_lines_are_skipped() -> None:
    stdout = "\n".join(["", selector_line("openai", "gpt-4o"), "   ", "\t"])
    result = parse_records(stdout)
    assert result.issues == ()
    assert result.models == (
        literal_model(
            config="openai/gpt-4o",
            id="gpt-4o",
            provider="openai",
            name="gpt-4o",
            cost_in=0.0,
            cost_out=0.0,
        ),
    )


def test_surrounding_whitespace_is_trimmed_before_matching() -> None:
    stdout = raw_stdout(f"  {selector_line('openai', 'gpt-4o')}  ")
    result = parse_records(stdout)
    assert result.issues == ()
    assert result.models == (
        literal_model(
            config="openai/gpt-4o",
            id="gpt-4o",
            provider="openai",
            name="gpt-4o",
            cost_in=0.0,
            cost_out=0.0,
        ),
    )


def test_non_selector_line_is_skipped_and_valid_neighbours_survive() -> None:
    stdout = raw_stdout(
        selector_line("openai", "gpt-4o"),
        "this is not a selector",
        selector_line("anthropic", "claude-3"),
    )
    result = parse_records(stdout)
    assert result.models == (
        literal_model(
            config="openai/gpt-4o",
            id="gpt-4o",
            provider="openai",
            name="gpt-4o",
            cost_in=0.0,
            cost_out=0.0,
        ),
        literal_model(
            config="anthropic/claude-3",
            id="claude-3",
            provider="anthropic",
            name="claude-3",
            cost_in=0.0,
            cost_out=0.0,
        ),
    )
    assert result.issues == (
        ParseIssue(
            "unrecognized_line", "this is not a selector: not a provider/model selector"
        ),
    )


def test_line_without_a_provider_slash_is_unrecognized() -> None:
    result = parse_records(raw_stdout("openai"))
    assert result.models == ()
    assert result.issues == (
        ParseIssue("unrecognized_line", "openai: not a provider/model selector"),
    )


def test_all_unrecognized_lines_yield_empty_models_and_all_issues() -> None:
    stdout = raw_stdout(
        "not a selector",
        "still/not a selector",
        "",
        "openai",
    )
    result = parse_records(stdout)
    assert isinstance(result.models, tuple) and result.models == ()
    assert isinstance(result.issues, tuple)
    assert result.issues == (
        ParseIssue(
            "unrecognized_line", "not a selector: not a provider/model selector"
        ),
        ParseIssue(
            "unrecognized_line", "still/not a selector: not a provider/model selector"
        ),
        ParseIssue("unrecognized_line", "openai: not a provider/model selector"),
    )
    assert all(isinstance(issue, ParseIssue) for issue in result.issues)
